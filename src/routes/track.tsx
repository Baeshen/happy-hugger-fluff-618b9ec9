import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import {
  Search,
  CheckCircle2,
  Clock3,
  XCircle,
  AlertCircle,
  CalendarDays,
  Stethoscope,
  User,
  Loader2,
  ArrowRight,
  Download,
} from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { downloadBookingConfirmationPdf } from "@/lib/booking-pdf";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "تتبع رقم طلبك | مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "تتبع حالة طلب حجزك في مجمع باعشن الطبي عبر رقم الطلب (BAA-XXXXXXXX) وآخر 4 أرقام من جوالك.",
      },
      { property: "og:title", content: "تتبع طلب الحجز — مجمع باعشن الطبي" },
      { property: "og:description", content: "تعرّف على حالة موعدك بسرعة." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/track" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/track" }],
  }),
  component: TrackPage,
});

const schema = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^BAA-[0-9A-F]{8}$/, "رقم الطلب يجب أن يكون بصيغة BAA-XXXXXXXX"),
  phone_last4: z.string().trim().regex(/^\d{4}$/, "أدخل آخر 4 أرقام من جوالك"),
});

type Appointment = {
  reference: string;
  status: string;
  appointment_date: string;
  appointment_time: string;
  patient_name: string;
  doctor_name_ar: string | null;
  specialty_name_ar: string | null;
  created_at: string;
  cancelled_at: string | null;
};

const STATUS: Record<
  string,
  { label: string; cls: string; icon: React.ReactNode; note: string }
> = {
  new: {
    label: "قيد المراجعة",
    cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    icon: <Clock3 className="h-8 w-8" />,
    note: "استلمنا طلبك — سيقوم فريق الاستقبال بتأكيده وسنُعلمك بأي مستجدات.",
  },
  confirmed: {
    label: "مؤكّد",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    icon: <CheckCircle2 className="h-8 w-8" />,
    note: "تم تأكيد موعدك. يُرجى الحضور قبل الوقت المحدد بـ15 دقيقة.",
  },
  completed: {
    label: "مكتمل",
    cls: "bg-primary/15 text-primary border-primary/30",
    icon: <CheckCircle2 className="h-8 w-8" />,
    note: "تمت الزيارة بنجاح. شكرًا لثقتك بنا — يسعدنا تقييمك للخدمة.",
  },
  cancelled: {
    label: "ملغى",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    icon: <XCircle className="h-8 w-8" />,
    note: "تم إلغاء هذا الموعد. يمكنك حجز موعد جديد في أي وقت.",
  },
  no_show: {
    label: "لم يتم الحضور",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    icon: <AlertCircle className="h-8 w-8" />,
    note: "لم يتم تسجيل حضورك للموعد. يمكنك إعادة الحجز في أي وقت.",
  },
};

function formatArabicDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("ar-SA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function TrackPage() {
  const [reference, setReference] = useState("");
  const [phone4, setPhone4] = useState("");
  const [loading, setLoading] = useState(false);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAppointment(null);

    const parsed = schema.safeParse({ reference, phone_last4: phone4 });
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "بيانات غير صالحة";
      setError(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/public/book/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        appointment?: Appointment;
        message?: string;
      };
      if (!res.ok || !body.ok || !body.appointment) {
        setError(body.message ?? "لم نعثر على طلب مطابق.");
        return;
      }
      setAppointment(body.appointment);
    } catch {
      setError("تعذّر الاتصال بالخادم. حاول مجددًا.");
    } finally {
      setLoading(false);
    }
  }

  const status = appointment ? STATUS[appointment.status] ?? STATUS.new : null;

  return (
    <>
      <PageHero
        eyebrow="خدمة إلكترونية"
        title="تتبّع طلب حجزك"
        subtitle="أدخل رقم الطلب الذي وصلك بعد الحجز (BAA-XXXXXXXX) وآخر 4 أرقام من جوالك لعرض حالة موعدك."
      />

      <section className="container-app py-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <form
          onSubmit={onSubmit}
          noValidate
          className="rounded-2xl border border-border bg-card p-6 space-y-4 h-fit"
          aria-label="نموذج تتبع طلب الحجز"
        >
          <div>
            <label htmlFor="tr-ref" className="mb-1 block text-xs font-semibold">
              رقم الطلب
            </label>
            <input
              id="tr-ref"
              required
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder="BAA-XXXXXXXX"
              dir="ltr"
              maxLength={12}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-mono tracking-wider"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              أرسلناه لك برسالة تأكيد بعد الحجز.
            </p>
          </div>

          <div>
            <label htmlFor="tr-phone" className="mb-1 block text-xs font-semibold">
              آخر 4 أرقام من جوالك
            </label>
            <input
              id="tr-phone"
              required
              value={phone4}
              onChange={(e) => setPhone4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              dir="ltr"
              inputMode="numeric"
              maxLength={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-mono tracking-wider"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              للتحقق من هويتك — لن نستخدمها لأي غرض آخر.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "جاري البحث..." : "عرض حالة الطلب"}
          </button>

          <p className="text-xs text-muted-foreground text-center pt-2">
            هل نسيت رقم الطلب؟{" "}
            <Link to="/lookup" className="text-primary font-semibold hover:underline">
              ابحث برقم الجوال بدلاً من ذلك
            </Link>
          </p>
        </form>

        <div>
          {!appointment && !error && (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground h-full grid place-items-center">
              <div>
                <Search className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                أدخل رقم الطلب لعرض حالة موعدك هنا.
              </div>
            </div>
          )}

          {error && !appointment && (
            <div
              role="alert"
              className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-8 text-center"
            >
              <XCircle className="mx-auto h-10 w-10 text-destructive mb-3" />
              <p className="text-sm font-semibold text-destructive">{error}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                تأكّد من كتابة الرقم كاملاً بصيغة BAA- ثم 8 خانات.
              </p>
            </div>
          )}

          {appointment && status && (
            <div className="space-y-4">
              <div className={`rounded-2xl border-2 p-6 ${status.cls}`}>
                <div className="flex items-center gap-4">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-background/60">
                    {status.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs opacity-80">حالة الطلب</div>
                    <div className="text-2xl font-black">{status.label}</div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6">{status.note}</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-muted-foreground">رقم الطلب</div>
                    <div className="text-lg font-mono font-black tracking-wider">
                      {appointment.reference}
                    </div>
                  </div>
                </div>

                <dl className="grid gap-2 text-sm">
                  <DetailRow
                    icon={<User className="h-4 w-4" />}
                    label="المريض"
                    value={appointment.patient_name}
                  />
                  <DetailRow
                    icon={<CalendarDays className="h-4 w-4" />}
                    label="التاريخ"
                    value={formatArabicDate(appointment.appointment_date)}
                  />
                  <DetailRow
                    icon={<Clock3 className="h-4 w-4" />}
                    label="الوقت"
                    value={appointment.appointment_time?.slice(0, 5)}
                    mono
                  />
                  <DetailRow
                    icon={<Stethoscope className="h-4 w-4" />}
                    label="التخصص"
                    value={appointment.specialty_name_ar ?? "—"}
                  />
                  <DetailRow
                    icon={<User className="h-4 w-4" />}
                    label="الطبيب"
                    value={appointment.doctor_name_ar ?? "—"}
                  />
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    to="/book"
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    حجز موعد جديد
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    to="/contact"
                    className="inline-flex items-center rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    تواصل مع الاستقبال
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-1.5 last:border-none">
      <dt className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd
        className={`text-sm font-semibold text-end ${mono ? "font-mono" : ""}`}
        dir={mono ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
