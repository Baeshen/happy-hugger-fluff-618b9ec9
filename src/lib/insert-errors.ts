/**
 * Central mapping from raw Supabase/PostgREST error objects to short,
 * user-facing Arabic strings for insert paths (public /book and any
 * future insert surface).
 *
 * Rules (co-owned with tests/rls/friendly-insert-error.test.ts):
 *   - Match by SQLSTATE code first, message text second. The mapping must
 *     stay stable if PostgREST rewords its default error strings.
 *   - Every returned string is a fixed Arabic literal. We NEVER interpolate
 *     err.message / err.details / err.hint into the output — those may
 *     contain policy names, table/column names, or English DB verbiage.
 *   - Unknown errors fall back to a generic Arabic string.
 *
 * SQLSTATE quick reference (Postgres class 22/23/42):
 *   22001  string_data_right_truncation  → too-long value
 *   22P02  invalid_text_representation   → bad UUID / enum / integer input
 *   23502  not_null_violation
 *   23503  foreign_key_violation
 *   23505  unique_violation
 *   23514  check_violation
 *   42501  insufficient_privilege        (RLS deny)
 */

export const FRIENDLY_INSERT_MESSAGES = {
  duplicate: "الموعد محجوز مسبقًا. اختر وقتًا آخر.",
  rls:       "تعذر الحفظ. تأكد من الاسم والهاتف وأن التاريخ ليس في الماضي.",
  check:     "بيانات غير مقبولة. راجع الحقول ثم حاول مرة أخرى.",
  missing:   "بيانات ناقصة. رجاءً املأ الحقول المطلوبة ثم حاول مرة أخرى.",
  reference: "قيمة مرجعية غير صالحة. تأكد من الاختيارات ثم حاول مرة أخرى.",
  invalid:   "قيمة غير صالحة في أحد الحقول. راجع المدخلات ثم حاول مرة أخرى.",
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

  if (code === "42501"
      || msg.includes("row-level security")
      || msg.includes("violates row-level")) {
    return FRIENDLY_INSERT_MESSAGES.rls;
  }

  if (code === "23502"
      || msg.includes("null value in column")
      || msg.includes("not-null constraint")) {
    return FRIENDLY_INSERT_MESSAGES.missing;
  }

  if (code === "23503" || msg.includes("foreign key")) {
    return FRIENDLY_INSERT_MESSAGES.reference;
  }

  // Length overflow (22001) is a data-shape rejection; folded into `check`
  // because the user's remedy is identical: "review your inputs".
  if (code === "23514" || code === "22001"
      || msg.includes("check constraint")
      || msg.includes("value too long")) {
    return FRIENDLY_INSERT_MESSAGES.check;
  }

  if (code === "22P02"
      || msg.includes("invalid input syntax")
      || msg.includes("invalid input value")) {
    return FRIENDLY_INSERT_MESSAGES.invalid;
  }

  if (msg.includes("failed to fetch")
      || msg.includes("networkerror")
      || msg.includes("network")) {
    return FRIENDLY_INSERT_MESSAGES.network;
  }

  return FRIENDLY_INSERT_MESSAGES.unknown;
}
