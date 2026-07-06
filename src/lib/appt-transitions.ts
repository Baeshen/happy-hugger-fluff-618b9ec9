/**
 * Appointment status transition rules — the single source of truth for
 * "who can move a booking from which status to which status".
 *
 * Kept pure and dependency-free so it can be unit-tested and reused from
 * both the server function (`updateAppointmentStatus`) and the UI (to hide
 * buttons the caller isn't allowed to click).
 */

export type ApptStatus = "new" | "confirmed" | "completed" | "cancelled" | "no_show";
export type StaffRole = "admin" | "reception" | "pharmacy";

export interface TransitionRule {
  to: ApptStatus;
  roles: StaffRole[];
  reasonRequired?: boolean;
}

export const APPT_TRANSITIONS: Record<ApptStatus, TransitionRule[]> = {
  new: [
    { to: "confirmed", roles: ["admin", "reception"] },
    { to: "cancelled", roles: ["admin", "reception"], reasonRequired: true },
  ],
  confirmed: [
    { to: "completed", roles: ["admin", "reception"] },
    { to: "no_show",   roles: ["admin", "reception"], reasonRequired: true },
    { to: "cancelled", roles: ["admin", "reception"], reasonRequired: true },
  ],
  completed: [{ to: "new", roles: ["admin"] }],
  cancelled: [{ to: "new", roles: ["admin"] }],
  no_show:   [{ to: "new", roles: ["admin"] }],
};

export type TransitionCheck =
  | { ok: true; unchanged?: boolean }
  | { ok: false; code: "ILLEGAL_TRANSITION" | "FORBIDDEN_ROLE" | "REASON_REQUIRED"; message: string };

/** Pure validator: mirrors the checks the server function performs (steps 3–4 in its handler). */
export function checkAppointmentTransition(
  from: ApptStatus,
  to: ApptStatus,
  roles: StaffRole[],
  reason?: string | null,
): TransitionCheck {
  if (from === to) return { ok: true, unchanged: true };

  const rule = (APPT_TRANSITIONS[from] ?? []).find((r) => r.to === to);
  if (!rule) {
    return {
      ok: false,
      code: "ILLEGAL_TRANSITION",
      message: `لا يمكن تغيير الحالة من "${from}" إلى "${to}".`,
    };
  }
  if (!roles.some((r) => rule.roles.includes(r))) {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      message: "ليست لديك الصلاحية لتنفيذ هذا التغيير بالتحديد.",
    };
  }
  if (rule.reasonRequired && !(reason && reason.trim())) {
    return { ok: false, code: "REASON_REQUIRED", message: "السبب مطلوب لهذا الإجراء." };
  }
  return { ok: true };
}
