import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bell, History, Settings, ChevronDown, ChevronUp } from "lucide-react";
import type { TransitionsStats } from "@/lib/patients-analytics.functions";
import {
  loadRules,
  evaluateRules,
  buildAlertTimeline,
  STATUS_LABEL,
  SCOPE_LABEL,
  SEVERITY_LABEL,
  SEVERITY_STYLES,
  TIMELINE_KIND_LABEL,
  type AlertRule,
} from "@/lib/transition-alerts";


export function TransitionAlerts({ stats }: { stats: TransitionsStats }) {
  const [rules, setRules] = useState<AlertRule[]>([]);

  useEffect(() => {
    setRules(loadRules());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "transition-alerts-rules-v1") setRules(loadRules());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const triggered = useMemo(() => evaluateRules(rules, stats), [rules, stats]);
  const timeline = useMemo(() => buildAlertTimeline(rules, stats), [rules, stats]);
  const [showTimeline, setShowTimeline] = useState(true);
  const activeRules = rules.filter((r) => r.enabled).length;
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 } as Record<"high" | "medium" | "low", number>;
    for (const t of triggered) c[t.severity]++;
    return c;
  }, [triggered]);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-bold flex items-center gap-2 flex-wrap">
          <Bell className="h-4 w-4 text-primary" />
          تنبيهات العتبات
          {triggered.length > 0 && (
            <>
              {(["high", "medium", "low"] as const).map((sev) => counts[sev] > 0 && (
                <span key={sev}
                  className={`inline-flex items-center gap-1 rounded-full text-[11px] px-2 py-0.5 font-semibold border ${SEVERITY_STYLES[sev].badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_STYLES[sev].dot}`} />
                  {SEVERITY_LABEL[sev]}: {counts[sev]}
                </span>
              ))}
            </>
          )}
          <span className="text-xs text-muted-foreground font-normal">
            ({activeRules} {activeRules === 1 ? "قاعدة نشطة" : "قواعد نشطة"})
          </span>
        </h2>
        <Link
          to="/transition-alerts"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Settings className="h-4 w-4" />
          إدارة القواعد
        </Link>
      </div>

      {rules.length === 0 ? (
        <div className="text-sm text-muted-foreground py-3">
          لا توجد قواعد بعد. أنشئ قواعد التنبيه من صفحة{" "}
          <Link to="/transition-alerts" className="text-primary underline">إدارة قواعد التنبيهات</Link>.
        </div>
      ) : triggered.length === 0 ? (
        <div className="text-sm text-emerald-600 py-2">جميع القواعد ضمن الحدود.</div>
      ) : (
        <div className="space-y-2">
          {triggered.map((t, i) => {
            const s = SEVERITY_STYLES[t.severity];
            return (
              <div key={i} className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 ${s.ring}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${s.text}`} />
                  <span className={`inline-flex items-center gap-1 rounded-full text-[10px] px-1.5 py-0.5 font-semibold border ${s.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {SEVERITY_LABEL[t.severity]}
                  </span>
                  <span className="text-sm truncate">
                    <span className="font-medium">{t.subjectName}</span>
                    <span className="text-muted-foreground"> — {STATUS_LABEL[t.status]}</span>
                  </span>
                </div>
                <span className={`font-mono font-semibold text-sm ${s.text}`}>
                  {t.count}
                  <span className="text-xs text-muted-foreground"> / {t.threshold} (×{t.ratio.toFixed(1)})</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline of alert activations within the current period */}
      {rules.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowTimeline((v) => !v)}
            className="w-full flex items-center justify-between text-sm font-semibold hover:text-primary"
          >
            <span className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              السجل الزمني للتنبيهات
              <span className="text-xs text-muted-foreground font-normal">
                ({timeline.length} حدث خلال {stats.period.from} → {stats.period.to})
              </span>
            </span>
            {showTimeline ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showTimeline && (
            timeline.length === 0 ? (
              <div className="text-sm text-muted-foreground py-3">
                لا توجد أحداث تنبيه ضمن هذه الفترة.
              </div>
            ) : (
              <ol className="mt-3 relative border-r border-border pr-4 space-y-2 max-h-96 overflow-y-auto">
                {timeline.map((e, i) => {
                  const s = SEVERITY_STYLES[e.severity];
                  const kindClass =
                    e.kind === "first-trigger"
                      ? "bg-primary/15 text-primary border-primary/30"
                      : e.kind === "escalation"
                        ? "bg-destructive/15 text-destructive border-destructive/30"
                        : "bg-muted text-muted-foreground border-border";
                  return (
                    <li key={i} className={`relative rounded-lg border p-2.5 ${s.ring}`}>
                      <span className={`absolute -right-[22px] top-3 h-3 w-3 rounded-full ring-2 ring-background ${s.dot}`} />
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">{e.day}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full text-[10px] px-1.5 py-0.5 font-semibold border ${kindClass}`}>
                            {TIMELINE_KIND_LABEL[e.kind]}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full text-[10px] px-1.5 py-0.5 font-semibold border ${s.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                            {SEVERITY_LABEL[e.severity]}
                          </span>
                          <span className="text-sm truncate">
                            <span className="font-medium">{e.subjectName}</span>
                            <span className="text-muted-foreground"> — {SCOPE_LABEL[e.scope]} · {STATUS_LABEL[e.status]}</span>
                          </span>
                        </div>
                        <span className={`font-mono text-xs ${s.text}`}>
                          +{e.delta}
                          <span className="text-muted-foreground"> · تراكمي {e.cumulative}/{e.threshold} (×{e.ratio.toFixed(1)})</span>
                        </span>
                      </div>
                      {e.ruleLabel && (
                        <div className="mt-1 text-[11px] text-muted-foreground truncate">
                          القاعدة: {e.ruleLabel}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )
          )}
        </div>
      )}
    </section>
  );
}

