import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Loader2 } from "lucide-react";

/**
 * Compact booking form embedded on excellence center detail pages.
 * Submits to the public API endpoint /api/public/book/create which
 * inserts into `appointments`; DB triggers enqueue the confirmation
 * notification for the patient (in-app / push / SMS per templates).
 */
export function CenterBookingForm({ centerName }: { centerName: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    patient_name: "",
    patient_phone: "",
    appointment_date: "",
    appointment_time: "",
    reason: "",
  });

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const reason = form.reason.trim()
        ? `[${centerName}] ${form.reason.trim()}`
        : `طلب حجز — ${centerName}`;
      const res = await fetch("/api/public/book/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: form.patient_name.trim(),
          patient_phone: form.patient_phone.trim(),
          appointment_date: form.appointment_date,
          appointment_time: form.appointment_time,
          reason,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.message ?? "تعذّر إرسال الطلب");
        return;
      }
      setDone(true);
      toast.success("تم استلام طلبك، سنرسل تأكيدًا برسالة قريبًا");
      setForm({
        patient_name: "",
        patient_phone: "",
        appointment_date: "",
        appointment_time: "",
        reason: "",
      });
    } catch {
      toast.error("تعذّر الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-accent/5 p-6">
        <h3 className="text-lg font-bold">تم استلام طلبك ✔︎</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          سيصلك تأكيد بالموعد على رقم الجوال خلال دقائق.
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-4 inline-flex rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          حجز موعد آخر
        </button>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-card p-6 space-y-3"
      aria-label={`نموذج حجز موعد في ${centerName}`}
    >
      <div>
        <h3 className="text-lg font-bold">احجز موعدك في {centerName}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          أدخل بياناتك وسنرسل تأكيدًا للموعد على جوالك.
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">الاسم الكامل</span>
          <input
            required
            minLength={2}
            maxLength={120}
            value={form.patient_name}
            onChange={update("patient_name")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">رقم الجوال</span>
          <input
            required
            type="tel"
            inputMode="tel"
            pattern="[+0-9\s\-()]+"
            minLength={6}
            maxLength={32}
            value={form.patient_phone}
            onChange={update("patient_phone")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">التاريخ</span>
            <input
              required
              type="date"
              min={today}
              value={form.appointment_date}
              onChange={update("appointment_date")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">الوقت</span>
            <input
              required
              type="time"
              value={form.appointment_time}
              onChange={update("appointment_time")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">
            سبب الزيارة <span className="text-muted-foreground">(اختياري)</span>
          </span>
          <textarea
            rows={3}
            maxLength={400}
            value={form.reason}
            onChange={update("reason")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
        {submitting ? "جاري الإرسال..." : "إرسال طلب الحجز"}
      </button>
    </form>
  );
}
