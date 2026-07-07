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
