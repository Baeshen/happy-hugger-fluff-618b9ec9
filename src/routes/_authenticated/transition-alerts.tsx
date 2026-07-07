import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, Plus, Trash2, Save, Pencil, X, Check, AlertTriangle, CheckCircle2, Power } from "lucide-react";
import { getTransitionsStats, listBranchesForAnalytics } from "@/lib/patients-analytics.functions";
import {
  loadRules,
  saveRules,
  evaluateRules,
  STATUS_LABEL,
  SCOPE_LABEL,
  type AlertRule,
  type AlertScope,
  type AlertStatus,
} from "@/lib/transition-alerts";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export const Route = createFileRoute("/_authenticated/transition-alerts")({
  head: () => ({
    meta: [
      { title: "إدارة قواعد تنبيهات الانتقالات | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransitionAlertsPage,
});

const STATUS_OPTIONS: AlertStatus[] = ["any", "active", "inactive", "archived", "deceased"];
const SCOPE_OPTIONS: AlertScope[] = ["branch", "actor", "any"];

type Draft = Omit<AlertRule, "id">;
const EMPTY_DRAFT: Draft = { label: "", scope: "branch", status: "inactive", threshold: 10, enabled: true };

function TransitionAlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());

  useEffect(() => { setRules(loadRules()); }, []);
  useEffect(() => { saveRules(rules); }, [rules]);

  const branchesFn = useServerFn(listBranchesForAnalytics);
  const statsFn = useServerFn(getTransitionsStats);

  const branchesQ = useQuery({
    queryKey: ["ta-branches"],
    queryFn: () => branchesFn(),
    staleTime: 60_000,
  });

  const statsQ = useQuery({
    queryKey: ["ta-stats", branchId, from, to],
    queryFn: () => statsFn({ data: { branchId, from, to } }),
    placeholderData: keepPreviousData,
  });

  const triggered = useMemo(() => statsQ.data ? evaluateRules(rules, statsQ.data) : [], [rules, statsQ.data]);
  const triggeredByRule = useMemo(() => {
    const m = new Map<string, typeof triggered>();
    for (const t of triggered) {
      const arr = m.get(t.ruleId) ?? [];
      arr.push(t);
      m.set(t.ruleId, arr);
    }
    return m;
  }, [triggered]);

  const addRule = () => {
    if (!draft.threshold || draft.threshold < 1) return;
    const rule: AlertRule = {
      id: crypto.randomUUID(),
      label: draft.label?.trim() || undefined,
      scope: draft.scope,
      status: draft.status,
      threshold: draft.threshold,
      enabled: draft.enabled,
    };
    setRules((prev) => [rule, ...prev]);
    setDraft(EMPTY_DRAFT);
  };
  const removeRule = (id: string) => setRules((prev) => prev.filter((r) => r.id !== id));
  const toggleRule = (id: string) => setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const startEdit = (r: AlertRule) => {
    setEditingId(r.id);
    setEditDraft({ label: r.label ?? "", scope: r.scope, status: r.status, threshold: r.threshold, enabled: r.enabled });
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft(EMPTY_DRAFT); };
  const saveEdit = () => {
    if (!editingId) return;
    setRules((prev) => prev.map((r) => r.id === editingId ? {
      ...r,
      label: editDraft.label?.trim() || undefined,
      scope: editDraft.scope,
      status: editDraft.status,
      threshold: editDraft.threshold,
      enabled: editDraft.enabled,
    } : r));
    cancelEdit();
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3 flex-wrap">
          <Link to="/transitions-stats" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            إحصائيات الانتقالات
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            إدارة قواعد تنبيهات الانتقالات
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Evaluation window */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-bold mb-3">نافذة التقييم</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
              <select
                value={branchId ?? ""}
                onChange={(e) => setBranchId(e.target.value || null)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">كل الفروع</option>
                {(branchesQ.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name_ar}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">من</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إلى</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              {[7, 30, 90].map((n) => (
                <button key={n} onClick={() => { setFrom(daysAgoISO(n)); setTo(todayISO()); }}
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted">
                  آخر {n} يوم
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Add new rule */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4" />
            إضافة قاعدة جديدة
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">اسم القاعدة (اختياري)</label>
              <input
                type="text"
                value={draft.label ?? ""}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="مثال: تنبيه الأرشفة الشهرية"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">النطاق</label>
              <select
                value={draft.scope}
                onChange={(e) => setDraft({ ...draft, scope: e.target.value as AlertScope })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {SCOPE_OPTIONS.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as AlertStatus })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">العتبة (≥)</label>
              <input
                type="number"
                min={1}
                value={draft.threshold}
                onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) || 0 })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={addRule}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
              >
                <Save className="h-4 w-4" />
                حفظ
              </button>
            </div>
          </div>
        </section>

        {/* Rules list */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold">قواعد التنبيهات ({rules.length})</h2>
            <span className="text-xs text-muted-foreground">تُحفظ محلياً في هذا المتصفح</span>
          </div>
          {rules.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">لا توجد قواعد بعد.</div>
          ) : (
            <div className="divide-y divide-border">
              {rules.map((r) => {
                const isEditing = editingId === r.id;
                const hits = triggeredByRule.get(r.id) ?? [];
                return (
                  <div key={r.id} className={`p-4 ${r.enabled ? "" : "opacity-60"}`}>
                    {isEditing ? (
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                        <div className="md:col-span-2">
                          <label className="text-xs text-muted-foreground mb-1 block">اسم</label>
                          <input type="text" value={editDraft.label ?? ""}
                            onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">النطاق</label>
                          <select value={editDraft.scope}
                            onChange={(e) => setEditDraft({ ...editDraft, scope: e.target.value as AlertScope })}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                            {SCOPE_OPTIONS.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
                          <select value={editDraft.status}
                            onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value as AlertStatus })}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">العتبة</label>
                          <input type="number" min={1} value={editDraft.threshold}
                            onChange={(e) => setEditDraft({ ...editDraft, threshold: Number(e.target.value) || 0 })}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={cancelEdit}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="text-sm flex-1 min-w-0">
                          <div className="font-semibold flex items-center gap-2 flex-wrap">
                            {r.label || `${SCOPE_LABEL[r.scope]} · ${STATUS_LABEL[r.status]}`}
                            {!r.enabled && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">معطّلة</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {SCOPE_LABEL[r.scope]} · {STATUS_LABEL[r.status]} · العتبة ≥ {r.threshold}
                          </div>
                          {r.enabled && (
                            hits.length === 0 ? (
                              <div className="text-xs text-emerald-600 flex items-center gap-1 mt-2">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                ضمن الحد
                              </div>
                            ) : (
                              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                                <div className="text-xs text-destructive font-semibold flex items-center gap-1 mb-1">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  تجاوز في {hits.length} {hits.length === 1 ? "حالة" : "حالات"}
                                </div>
                                <ul className="space-y-0.5 text-xs">
                                  {hits.slice(0, 5).map((h, i) => (
                                    <li key={i} className="flex justify-between">
                                      <span>{h.subjectName}</span>
                                      <span className="font-mono font-semibold text-destructive">{h.count}</span>
                                    </li>
                                  ))}
                                  {hits.length > 5 && (
                                    <li className="text-muted-foreground">…و {hits.length - 5} أخرى</li>
                                  )}
                                </ul>
                              </div>
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleRule(r.id)}
                            title={r.enabled ? "تعطيل" : "تفعيل"}
                            className="rounded-md border border-border p-2 hover:bg-muted">
                            <Power className={`h-4 w-4 ${r.enabled ? "text-emerald-600" : "text-muted-foreground"}`} />
                          </button>
                          <button onClick={() => startEdit(r)}
                            title="تعديل"
                            className="rounded-md border border-border p-2 hover:bg-muted">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => removeRule(r.id)}
                            title="حذف"
                            className="rounded-md border border-border p-2 hover:bg-destructive/10 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {statsQ.isLoading && <p className="text-sm text-muted-foreground">جارٍ تقييم القواعد…</p>}
        {statsQ.error && (
          <p className="text-sm text-destructive">تعذر تحميل الإحصائيات: {(statsQ.error as Error).message}</p>
        )}
      </main>
    </div>
  );
}
