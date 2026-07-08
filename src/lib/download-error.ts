/**
 * Shared helpers for signed-URL download errors used by /my tabs
 * (lab reports, radiology reports, invoices).
 *
 * Extracted so the friendly-message + retry logic is unit-testable
 * without mounting the full React tree.
 */

export const DOWNLOAD_ERROR_MESSAGES = {
  generic: "تعذّر إنشاء رابط التنزيل",
  notFound: "الملف غير متاح حاليًا، الرجاء التواصل مع الاستقبال",
  expired: "انتهت صلاحية رابط التنزيل",
  invalidUrl: "رابط التنزيل غير صالح أو انتهت صلاحيته",
  unexpected: "حدث خطأ غير متوقع أثناء التنزيل",
  downloadStarted: "تم بدء تنزيل الملف بنجاح",
} as const;

/**
 * Map a raw signed-URL error message to a user-friendly Arabic message.
 * - 404 / "not found" → notFound
 * - "expired" / "انتهت" → expired
 * - other non-empty messages → passed through verbatim (surface backend text)
 * - empty / null / undefined → generic
 */
export function getFriendlyDownloadError(rawMessage: string | null | undefined): string {
  const msg = (rawMessage ?? "").trim();
  if (!msg) return DOWNLOAD_ERROR_MESSAGES.generic;
  if (/not.?found|404/i.test(msg)) return DOWNLOAD_ERROR_MESSAGES.notFound;
  if (/expired|انتهت/i.test(msg)) return DOWNLOAD_ERROR_MESSAGES.expired;
  return msg;
}

/**
 * Buckets used by the /my download button. Kept as a type-safe union so
 * the tabs (lab / radiology / invoices) can share one code path.
 */
export type DownloadBucket = "lab-reports" | "radiology-reports" | "invoice-pdfs";
