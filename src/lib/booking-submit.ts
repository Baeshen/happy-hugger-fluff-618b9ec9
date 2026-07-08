/**
 * Shared submission helper for the booking / service-request forms.
 * Wraps `fetch('/api/public/book/create', …)` with:
 *   - a 20s abort timeout,
 *   - classification of failures into user-facing kinds,
 *   - one consistent { ok, reference, message, kind } shape.
 *
 * The server endpoint already returns { ok, kind, message } with Arabic
 * messages for validation and DB errors — we preserve those verbatim and
 * only synthesize a message for transport-level failures (network, timeout,
 * malformed JSON, 5xx without a body).
 */

export type BookingSubmitPayload = {
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  reason?: string;
  national_id?: string | null;
  gender?: "male" | "female";
  specialty_id?: string | null;
  doctor_id?: string | null;
  reminder_24h?: boolean;
  reminder_2h?: boolean;
};

export type BookingSubmitKind =
  | "success"
  | "validation"
  | "db"
  | "conflict"
  | "network"
  | "timeout"
  | "server"
  | "unknown";

export type BookingSubmitResult =
  | { ok: true; kind: "success"; reference: string | null }
  | { ok: false; kind: Exclude<BookingSubmitKind, "success">; message: string };

const TIMEOUT_MS = 20_000;

const FALLBACK_MESSAGES: Record<Exclude<BookingSubmitKind, "success">, string> = {
  validation: "تحقّق من صحة البيانات المدخلة وحاول مجددًا.",
  db: "تعذّر حفظ الطلب حاليًا. حاول بعد قليل أو تواصل مع الاستقبال.",
  conflict: "الموعد محجوز مسبقًا. اختر وقتًا آخر.",
  network: "تعذّر الاتصال بالخادم. تحقّق من اتصال الإنترنت وحاول مرة أخرى.",
  timeout: "استغرقت العملية وقتًا أطول من المعتاد. حاول مرة أخرى.",
  server: "حدث خطأ مؤقت في الخادم. حاول مرة أخرى بعد قليل.",
  unknown: "تعذّر إرسال الطلب. حاول مرة أخرى.",
};

export async function submitBooking(payload: BookingSubmitPayload): Promise<BookingSubmitResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch("/api/public/book/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err as { name?: string } | null)?.name === "AbortError";
    if (isAbort) {
      return { ok: false, kind: "timeout", message: FALLBACK_MESSAGES.timeout };
    }
    return { ok: false, kind: "network", message: FALLBACK_MESSAGES.network };
  }
  clearTimeout(timer);

  let body: {
    ok?: boolean;
    kind?: string;
    message?: string;
    reference?: string | null;
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Non-JSON response (e.g. a bare 502 from an edge proxy). Fall back
    // based on status code.
    const kind: Exclude<BookingSubmitKind, "success"> =
      res.status >= 500 ? "server" : "unknown";
    return { ok: false, kind, message: FALLBACK_MESSAGES[kind] };
  }

  if (res.ok && body.ok) {
    return { ok: true, kind: "success", reference: body.reference ?? null };
  }

  const kind: Exclude<BookingSubmitKind, "success"> =
    body.kind === "validation" ||
    body.kind === "db" ||
    body.kind === "conflict"
      ? body.kind
      : res.status >= 500
        ? "server"
        : "unknown";
  return {
    ok: false,
    kind,
    message: body.message?.trim() || FALLBACK_MESSAGES[kind],
  };
}
