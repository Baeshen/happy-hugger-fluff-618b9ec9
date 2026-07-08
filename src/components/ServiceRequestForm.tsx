import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CalendarPlus, CheckCircle2, Copy, Loader2 } from "lucide-react";

/**
 * Generic service-request form used by advanced-service pages
 * (home-care, telemedicine, international-patients, etc.).
 *
 * Posts to /api/public/book/create — the same endpoint used by the main
 * booking flow. The `tag` prop is prefixed on `reason` so admins can
 * quickly filter by service type in the appointments queue.
 */

const NAME_MAX = 120;
const REASON_MAX = 400;
const PHONE_RE = /^[+0-9\s\-()]+$/;
const SA_MOBILE_RE = /^(?:\+?966|00966|0)?5\d{8}$/;

const schema = z.object({
  patient_name: z
    .string()
    .trim()
    .min(2, "الاسم قصير جدًا")
    .max(NAME_MAX, "الاسم طويل جدًا")
    .regex(/^[\p{L}\s'’.-]+$/u, "الاسم يحتوي على رموز غير مسموحة"),
  patient_phone: z
    .string()
    .trim()
    .min(6, "رقم الهاتف قصير جدًا")
    .max(32, "رقم الهاتف طويل جدًا")
    .regex(PHONE_RE, "الهاتف يحتوي على أحرف غير مسموحة")
    .refine((v) => SA_MOBILE_RE.test(v.replace(/[\s\-()]/g, "")), "أدخل رقم جوال سعودي صحيح (05XXXXXXXX)"),
  service: z.string().trim().min(1, "اختر نوع الخدمة"),
  appointment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صالح")
    .refine((v) => {
      const d = new Date(v + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d.getTime() >= today.getTime();
    }, "لا يمكن اختيار تاريخ في الماضي"),
  appointment_time: z.string().regex(/^\d{2}:\d{2}$/, "الوقت غير صالح"),
  extra: z.string().trim().max(REASON_MAX, `الحقل طويل جدًا`).optional().or(z.literal("")),
});

type FormState = {
  patient_name: string;
  patient_phone: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  extra: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = {
  patient_name: "",
  patient_phone: "",
  service: "",
  appointment_date: "",
  appointment_time: "",
  extra: "",
};

function shortReference(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined;
  const bytes = new Uint8Array(4);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${prefix}-${hex}`;
}

export function ServiceRequestForm({
  tag,
  title,
  subtitle,
  services,
  extraLabel,
  extraPlaceholder,
  extraRequired,
  refPrefix = "REQ",
  timeLabel = "الوقت المفضّل",
  dateLabel = "التاريخ المفضّل",
  submitLabel = "إرسال الطلب",
}: {
  tag: string;
  title: string;
  subtitle?: string;
  services: string[];
  extraLabel?: string;
  extraPlaceholder?: string;
  extraRequired?: boolean;
  refPrefix?: string;
  timeLabel?: string;
  dateLabel?: string;
  submitLabel?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const update =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((s) => ({ ...s, [k]: e.target.value }));
      if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
    };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined;
        if (key && !fe[key]) fe[key] = issue.message;
      }
      if (extraRequired && !form.extra.trim()) {
        fe.extra = "هذا الحقل مطلوب";
      }
      setErrors(fe);
      toast.error(parsed.error.issues[0]?.message ?? "يرجى مراجعة الحقول");
      return;
    }
    if (extraRequired && !parsed.data.extra?.trim()) {
      setErrors({ extra: "هذا الحقل مطلوب" });
      toast.error("هذا الحقل مطلوب");
      return;
    }

    setSubmitting(true);
    try {
      const d = parsed.data;
      const reason = [`[${tag}]`, `الخدمة: ${d.service}`, d.extra?.trim()].filter(Boolean).join(" — ");
      const res = await fetch("/api/public/book/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: d.patient_name,
          patient_phone: d.patient_phone,
          appointment_date: d.appointment_date,
          appointment_time: d.appointment_time,
          reason,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        reference?: string | null;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.message ?? "تعذّر إرسال الطلب");
        return;
      }
      setReference(body.reference ?? shortReference(refPrefix));
      setForm(EMPTY);
      setErrors({});
      toast.success("تم استلام طلبك، سنتواصل معك للتأكيد قريبًا");
    } catch {
      toast.error("تعذّر الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-accent/5 p-6"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold">تم استلام طلبك بنجاح</h3>
            <p className="text-xs text-muted-foreground">سيتواصل معك فريقنا للتأكيد وترتيب التفاصيل.</p>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-border bg-background/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">رقم الطلب</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(reference).then(
                  () => toast.success("تم نسخ رقم الطلب"),
                  () => toast.error("تعذّر النسخ"),
                );
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Copy className="h-3 w-3" />
              نسخ
            </button>
          </div>
          <div className="mt-1 text-lg font-mono font-bold tracking-wider">{reference}</div>
        </div>
        <button
          type="button"
          onClick={() => setReference(null)}
          className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          إرسال طلب آخر
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-border bg-card p-6 space-y-3"
      aria-label={title}
    >
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="space-y-3 text-sm">
        <Field label="الاسم الكامل" error={errors.patient_name} htmlFor="srf-name">
          <input
            id="srf-name"
            required
            value={form.patient_name}
            onChange={update("patient_name")}
            aria-invalid={!!errors.patient_name}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          />
        </Field>

        <Field label="رقم الجوال" error={errors.patient_phone} htmlFor="srf-phone" hint="مثال: 05XXXXXXXX">
          <input
            id="srf-phone"
            required
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={form.patient_phone}
            onChange={update("patient_phone")}
            aria-invalid={!!errors.patient_phone}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          />
        </Field>

        <Field label="نوع الخدمة" error={errors.service} htmlFor="srf-service">
          <select
            id="srf-service"
            required
            value={form.service}
            onChange={update("service")}
            aria-invalid={!!errors.service}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          >
            <option value="">— اختر الخدمة —</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={dateLabel} error={errors.appointment_date} htmlFor="srf-date">
            <input
              id="srf-date"
              required
              type="date"
              min={today}
              value={form.appointment_date}
              onChange={update("appointment_date")}
              aria-invalid={!!errors.appointment_date}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
            />
          </Field>
          <Field label={timeLabel} error={errors.appointment_time} htmlFor="srf-time">
            <input
              id="srf-time"
              required
              type="time"
              value={form.appointment_time}
              onChange={update("appointment_time")}
              aria-invalid={!!errors.appointment_time}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
            />
          </Field>
        </div>

        {extraLabel && (
          <Field label={extraLabel} error={errors.extra} htmlFor="srf-extra">
            <textarea
              id="srf-extra"
              rows={3}
              maxLength={REASON_MAX}
              placeholder={extraPlaceholder}
              value={form.extra}
              onChange={update("extra")}
              aria-invalid={!!errors.extra}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
            />
          </Field>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
        {submitting ? "جاري الإرسال..." : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
