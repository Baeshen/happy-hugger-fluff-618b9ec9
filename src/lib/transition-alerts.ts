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

export type Severity = "low" | "medium" | "high";

export type TriggeredAlert = {
  ruleId: string;
  scope: AlertScope;
  status: AlertStatus;
  threshold: number;
  subjectName: string;
  count: number;
  severity: Severity;
  ratio: number;
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
};

// Tailwind classes for badges/backgrounds per severity.
export const SEVERITY_STYLES: Record<Severity, { badge: string; ring: string; text: string; dot: string }> = {
  low: {
    badge: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    ring: "border-amber-500/40 bg-amber-500/5",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  medium: {
    badge: "bg-orange-500/15 text-orange-700 border-orange-500/30",
    ring: "border-orange-500/40 bg-orange-500/5",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  high: {
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    ring: "border-destructive/40 bg-destructive/5",
    text: "text-destructive",
    dot: "bg-destructive",
  },
};

// Severity is derived from how far the count exceeds the threshold.
// < 1.5x → منخفض, 1.5x–2.5x → متوسط, ≥ 2.5x → مرتفع
export function computeSeverity(count: number, threshold: number): { severity: Severity; ratio: number } {
  const ratio = threshold > 0 ? count / threshold : 1;
  const severity: Severity = ratio >= 2.5 ? "high" : ratio >= 1.5 ? "medium" : "low";
  return { severity, ratio };
}

type EvalStats = {
  total: number;
  perTarget: { status: string; count: number }[];
  byBranch: { branch_id: string; branch_name: string; count: number }[];
  byActor: { actor_id: string; actor_name: string; count: number }[];
  byBranchStatus: { branch_id: string; branch_name: string; status: string; count: number }[];
  byActorStatus: { actor_id: string; actor_name: string; status: string; count: number }[];
};

function push(out: TriggeredAlert[], r: AlertRule, subjectName: string, count: number) {
  const { severity, ratio } = computeSeverity(count, r.threshold);
  out.push({ ruleId: r.id, scope: r.scope, status: r.status, threshold: r.threshold, subjectName, count, severity, ratio });
}

export function evaluateRules(rules: AlertRule[], stats: EvalStats): TriggeredAlert[] {
  const out: TriggeredAlert[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.scope === "any") {
      const count = r.status === "any"
        ? stats.total
        : (stats.perTarget.find((p) => p.status === r.status)?.count ?? 0);
      if (count >= r.threshold) push(out, r, "الإجمالي", count);
    } else if (r.scope === "branch") {
      if (r.status === "any") {
        for (const b of stats.byBranch) if (b.count >= r.threshold) push(out, r, b.branch_name, b.count);
      } else {
        for (const b of stats.byBranchStatus) if (b.status === r.status && b.count >= r.threshold) push(out, r, b.branch_name, b.count);
      }
    } else {
      if (r.status === "any") {
        for (const a of stats.byActor) if (a.count >= r.threshold) push(out, r, a.actor_name, a.count);
      } else {
        for (const a of stats.byActorStatus) if (a.status === r.status && a.count >= r.threshold) push(out, r, a.actor_name, a.count);
      }
    }
  }
  // Sort by severity (high → low), then by count desc.
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((x, y) => order[x.severity] - order[y.severity] || y.count - x.count);
}

