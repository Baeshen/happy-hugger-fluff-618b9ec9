export type AlertScope = "branch" | "actor" | "any";
export type AlertStatus = "active" | "inactive" | "archived" | "deceased" | "any";

export type AlertRule = {
  id: string;
  label?: string;
  scope: AlertScope;
  status: AlertStatus;
  threshold: number;
  enabled: boolean;
};

export const STATUS_LABEL: Record<AlertStatus, string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
  deceased: "متوفى",
  any: "أي حالة",
};

export const SCOPE_LABEL: Record<AlertScope, string> = {
  branch: "لكل فرع",
  actor: "لكل موظف",
  any: "الإجمالي",
};

const STORAGE_KEY = "transition-alerts-rules-v1";

export function loadRules(): AlertRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.id === "string")
      .map((r) => ({
        id: String(r.id),
        label: typeof r.label === "string" ? r.label : undefined,
        scope: (["branch", "actor", "any"].includes(r.scope) ? r.scope : "branch") as AlertScope,
        status: (["active", "inactive", "archived", "deceased", "any"].includes(r.status) ? r.status : "any") as AlertStatus,
        threshold: Number(r.threshold) || 1,
        enabled: r.enabled !== false,
      }));
  } catch {
    return [];
  }
}

export function saveRules(rules: AlertRule[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* ignore */
  }
}

export type TriggeredAlert = {
  ruleId: string;
  scope: AlertScope;
  status: AlertStatus;
  threshold: number;
  subjectName: string;
  count: number;
};

type EvalStats = {
  total: number;
  perTarget: { status: string; count: number }[];
  byBranch: { branch_id: string; branch_name: string; count: number }[];
  byActor: { actor_id: string; actor_name: string; count: number }[];
  byBranchStatus: { branch_id: string; branch_name: string; status: string; count: number }[];
  byActorStatus: { actor_id: string; actor_name: string; status: string; count: number }[];
};

export function evaluateRules(rules: AlertRule[], stats: EvalStats): TriggeredAlert[] {
  const out: TriggeredAlert[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
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
          if (b.count >= r.threshold) out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName: b.branch_name, count: b.count });
        }
      } else {
        for (const b of stats.byBranchStatus) {
          if (b.status === r.status && b.count >= r.threshold) out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName: b.branch_name, count: b.count });
        }
      }
    } else {
      if (r.status === "any") {
        for (const a of stats.byActor) {
          if (a.count >= r.threshold) out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName: a.actor_name, count: a.count });
        }
      } else {
        for (const a of stats.byActorStatus) {
          if (a.status === r.status && a.count >= r.threshold) out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName: a.actor_name, count: a.count });
        }
      }
    }
  }
  return out.sort((x, y) => y.count - x.count);
}

  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* ignore */
  }
}
