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
 * Signed URL lifetime in seconds. Kept as a shared constant so the button
 * hint ("صالح لمدة N دقائق") always matches the value passed to
 * `supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)`.
 */
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Format the signed-URL lifetime as a short Arabic phrase for the UI hint.
 * Rounds up to whole minutes when >= 60s; falls back to seconds otherwise.
 */
export function formatSignedUrlValidity(ttlSeconds: number = SIGNED_URL_TTL_SECONDS): string {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return "";
  if (ttlSeconds < 60) return `صالح لمدة ${ttlSeconds} ثانية`;
  const minutes = Math.round(ttlSeconds / 60);
  return `صالح لمدة ${minutes} دقيقة`;
}

/**
 * Format remaining seconds as "MM:SS" for the live countdown shown under the
 * download button after a signed URL is generated. Clamps to 00:00 for
 * non-positive / non-finite inputs so the UI never flashes negatives.
 */
export function formatCountdown(secondsRemaining: number): string {
  if (!Number.isFinite(secondsRemaining) || secondsRemaining <= 0) return "00:00";
  const total = Math.floor(secondsRemaining);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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

/**
 * Adaptive HEAD-check policy for signed-URL downloads.
 *
 * We still need to validate the URL is reachable before triggering the
 * browser download, but a HEAD round-trip on every click is wasteful once
 * a bucket has proven healthy. Rules:
 *
 *   1. Always HEAD on the first attempt for a bucket (no history yet).
 *   2. Always HEAD after any failure — cheap way to catch expired/moved files.
 *   3. Always HEAD when the previous failure is still within the cool-down
 *      window (default 60s) — the bucket is not "proven healthy" yet.
 *   4. Otherwise, skip HEAD after N consecutive successes (default 3).
 *
 * Pure function: caller owns the per-bucket state. Returns a decision plus
 * a short reason string useful for dev logs / debugging.
 */
export const HEAD_CHECK_DEFAULTS = {
  successThreshold: 3,
  failureCoolDownMs: 60_000,
} as const;

export interface HeadCheckState {
  /** Count of consecutive successful downloads for this bucket. */
  consecutiveSuccesses: number;
  /** Epoch ms of the most recent failure, or null if none in session. */
  lastFailureAt: number | null;
}

export interface HeadCheckDecision {
  shouldCheck: boolean;
  reason:
    | "first-attempt"
    | "recent-failure"
    | "below-success-threshold"
    | "trusted-bucket";
}

export function shouldPerformHeadCheck(
  state: HeadCheckState,
  now: number = Date.now(),
  opts: { successThreshold?: number; failureCoolDownMs?: number } = {},
): HeadCheckDecision {
  const successThreshold = opts.successThreshold ?? HEAD_CHECK_DEFAULTS.successThreshold;
  const failureCoolDownMs = opts.failureCoolDownMs ?? HEAD_CHECK_DEFAULTS.failureCoolDownMs;

  if (state.consecutiveSuccesses === 0 && state.lastFailureAt === null) {
    return { shouldCheck: true, reason: "first-attempt" };
  }
  if (state.lastFailureAt !== null && now - state.lastFailureAt < failureCoolDownMs) {
    return { shouldCheck: true, reason: "recent-failure" };
  }
  if (state.consecutiveSuccesses < successThreshold) {
    return { shouldCheck: true, reason: "below-success-threshold" };
  }
  return { shouldCheck: false, reason: "trusted-bucket" };
}

export function recordDownloadSuccess(state: HeadCheckState): HeadCheckState {
  return { consecutiveSuccesses: state.consecutiveSuccesses + 1, lastFailureAt: null };
}

export function recordDownloadFailure(
  _state: HeadCheckState,
  now: number = Date.now(),
): HeadCheckState {
  return { consecutiveSuccesses: 0, lastFailureAt: now };
}

export const INITIAL_HEAD_CHECK_STATE: HeadCheckState = {
  consecutiveSuccesses: 0,
  lastFailureAt: null,
};
