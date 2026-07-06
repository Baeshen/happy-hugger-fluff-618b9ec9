/**
 * Central mapping from raw Supabase/PostgREST error objects to short,
 * user-facing Arabic strings for the public /book insert path.
 *
 * Rules (co-owned with tests/rls/friendly-insert-error.test.ts):
 *   - Match by SQLSTATE code first, message text second. The mapping must
 *     stay stable if PostgREST rewords its default error strings.
 *   - Every returned string is a fixed Arabic literal. We NEVER interpolate
 *     err.message / err.details / err.hint into the output — those may
 *     contain policy names, table/column names, or English DB verbiage.
 *   - Unknown errors fall back to a generic Arabic string.
 *
 * Exported so both the UI and integration tests share one source of truth.
 */

export const FRIENDLY_INSERT_MESSAGES = {
  duplicate: "الموعد محجوز مسبقًا. اختر وقتًا آخر.",
  rls:       "تعذر الحفظ. تأكد من الاسم والهاتف وأن التاريخ ليس في الماضي.",
  check:     "بيانات غير مقبولة. راجع الحقول ثم حاول مرة أخرى.",
  network:   "تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.",
  unknown:   "حدث خطأ غير متوقع أثناء الحفظ.",
} as const;

export type FriendlyInsertKey = keyof typeof FRIENDLY_INSERT_MESSAGES;

export function friendlyInsertError(
  err: { message?: string; code?: string } | null | undefined,
): string {
  const msg  = (err?.message ?? "").toLowerCase();
  const code = err?.code ?? "";
  if (code === "23505" || msg.includes("duplicate key")) return FRIENDLY_INSERT_MESSAGES.duplicate;
  if (code === "42501" || msg.includes("row-level security") || msg.includes("violates row-level")) {
    return FRIENDLY_INSERT_MESSAGES.rls;
  }
  if (code === "23514" || msg.includes("check constraint")) {
    return FRIENDLY_INSERT_MESSAGES.check;
  }
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network")) {
    return FRIENDLY_INSERT_MESSAGES.network;
  }
  return FRIENDLY_INSERT_MESSAGES.unknown;
}
