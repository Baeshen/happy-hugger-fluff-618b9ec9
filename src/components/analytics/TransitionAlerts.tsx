import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Plus, Trash2, CheckCircle2 } from "lucide-react";
import type { TransitionsStats } from "@/lib/patients-analytics.functions";

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
  deceased: "متوفى",
  any: "أي حالة",
};

type Scope = "branch" | "actor" | "any";
type Rule = {
  id: string;
  scope: Scope; // "branch" = per-branch, "actor" = per-staff, "any" = global total
  status: "active" | "inactive" | "archived" | "deceased" | "any";
  threshold: number;
};

const STORAGE_KEY = "transition-alerts-rules-v1";

function loadRules(): Rule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r.id === "string");
  } catch {
    return [];
  }
}

function saveRules(rules: Rule[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* ignore */
  }
}

export function TransitionAlerts({ stats }: { stats: TransitionsStats }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [draft, setDraft] = useState<Omit<Rule, "id">>({ scope: "branch", status: "inactive", threshold: 10 });

  useEffect(() => { setRules(loadRules()); }, []);
  useEffect(() => { saveRules(rules); }, [rules]);

  const addRule = () => {
    if (!draft.threshold || draft.threshold < 1) return;
    setRules((prev) => [...prev, { ...draft, id: crypto.randomUUID() }]);
  };
  const removeRule = (id: string) => setRules((prev) => prev.filter((r) => r.id !== id));

  const triggered = useMemo(() => {
    const out: {
      ruleId: string;
      scope: Scope;
      status: Rule["status"];
      threshold: number;
      subjectName: string;
      count: number;
    }[] = [];

    for (const r of rules) {
      if (r.scope === "any") {
        const count = r.status === "any"
          ? stats.total
          : (stats.perTarget.find((p) => p.status === r.status)?.count ?? 0);
        if (count >= r.threshold) {
          out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName: "الإجمالي", count });
        }
      } else if (r.scope === "branch") {
        if (r.status === "any") {
          for (const b of stats.byBranch) {
            if (b.count >= r.threshold) {
              out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName: b.branch_name, count: b.count });
            }
          }
        } else {
          for (const b of stats.byBranchStatus) {
            if (b.status === r.status && b.count >= r.threshold) {
              out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName: b.branch_name, count: b.count });
            }
          }
        }
      } else {
        if (r.status === "any") {
          for (const a of stats.byActor) {
            if (a.count >= r.threshold) {
              out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName: a.actor_name, count: a.count });
            }
          }
        } else {
          for (const a of stats.byActorStatus) {
            if (a.status === r.status && a.count >= r.threshold) {
              out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName: a.actor_name, count: a.count });
            }
          }
        }
      }
    }
    return out.sort((x, y) => y.count - x.count);
  }, [rules, stats]);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          تنبيهات العتبات
          {triggered.length > 0 && (
            <span className="rounded-full bg-destructive/15 text-destructive text-[11px] px-2 py-0.5 font-semibold">
              {triggered.length}
            </span>
          )}
        </h2>
        <span className="text-xs text-muted-foreground">تُحفظ محلياً في هذا المتصفح</span>
      </div>

      {/* Rule builder */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">النطاق</label>
          <select
            value={draft.scope}
            onChange={(e) => setDraft({ ...draft, scope: e.target.value as Scope })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="branch">لكل فرع</option>
            <option value="actor">لكل موظف</option>
            <option value="any">الإجمالي</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as Rule["status"] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="any">أي حالة</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
            <option value="archived">مؤرشف</option>
            <option value="deceased">متوفى</option>
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
        <div className="md:col-span-2 flex items-end">
          <button
            onClick={addRule}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            إضافة قاعدة تنبيه
          </button>
        </div>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="text-sm text-muted-foreground py-3">لا توجد قواعد بعد. أضف قاعدة أعلاه لبدء التنبيه عند تجاوز العتبة.</div>
      ) : (
        <div className="space-y-2 mb-4">
          {rules.map((r) => {
            const hits = triggered.filter((t) => t.ruleId === r.id);
            return (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {r.scope === "any" ? "الإجمالي" : r.scope === "branch" ? "لكل فرع" : "لكل موظف"}
                    {" · "}
                    {STATUS_LABEL[r.status]}
                    {" · "}
                    ≥ {r.threshold}
                  </div>
                  {hits.length === 0 ? (
                    <div className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      ضمن الحد
                    </div>
                  ) : (
                    <div className="text-xs text-destructive flex items-center gap-1 mt-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      تجاوز في {hits.length} {hits.length === 1 ? "حالة" : "حالات"}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeRule(r.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="حذف القاعدة"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Triggered alerts */}
      {triggered.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            تنبيهات مُفعّلة ({triggered.length})
          </div>
          <ul className="space-y-1.5 text-sm">
            {triggered.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-2 border-b border-destructive/10 pb-1.5 last:border-0">
                <span>
                  <span className="font-medium">{t.subjectName}</span>
                  <span className="text-muted-foreground"> — {STATUS_LABEL[t.status]}</span>
                </span>
                <span className="font-mono text-destructive font-semibold">
                  {t.count} <span className="text-xs text-muted-foreground">(العتبة ≥ {t.threshold})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
