import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bell, Settings } from "lucide-react";
import type { TransitionsStats } from "@/lib/patients-analytics.functions";
import { loadRules, evaluateRules, STATUS_LABEL, type AlertRule } from "@/lib/transition-alerts";

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
  const activeRules = rules.filter((r) => r.enabled).length;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          تنبيهات العتبات
          {triggered.length > 0 && (
            <span className="rounded-full bg-destructive/15 text-destructive text-[11px] px-2 py-0.5 font-semibold">
              {triggered.length}
            </span>
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
                  {t.count} <span className="text-xs text-muted-foreground">(≥ {t.threshold})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
