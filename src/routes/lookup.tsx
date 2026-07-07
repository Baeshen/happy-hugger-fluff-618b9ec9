import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Search, Calendar, Clock, User, Phone, Stethoscope, X, CheckCircle2, AlertCircle, XCircle, Clock3, CalendarClock } from "lucide-react";
import { WEEKDAYS_AR } from "@/lib/site";
import { downloadIcs, whatsappShareUrl, type ShareBooking } from "@/lib/booking-share";

export const Route = createFileRoute("/lookup")({
  head: () => ({
    meta: [
      { title: "تتبع حجزك | مجمع باعشن الطبي" },
      { name: "description", content: "استعرض حالة موعدك في مجمع باعشن الطبي برقم الحجز ورقم الجوال." },
      { property: "og:title", content: "تتبع حجزك — مجمع باعشن الطبي" },
    ],
  }),
  component: LookupPage,
});

type AppointmentRow = {
  id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  reason: string | null;
  notes: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  doctor_name_ar: string | null;
  doctor_name_en: string | null;
  created_at: string;
};

function statusKey(s: string) {
  return `status_${s}` as
    | "status_new"
    | "status_confirmed"
    | "status_completed"
    | "status_cancelled"
    | "status_no_show";
}

function statusColor(s: string) {
  switch (s) {
    case "confirmed":
      return "bg-green-500/10 text-green-700 border-green-500/30";
    case "completed":
      return "bg-blue-500/10 text-blue-700 border-blue-500/30";
    case "cancelled":
      return "bg-red-500/10 text-red-700 border-red-500/30";
    case "no_show":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    default:
      return "bg-primary/10 text-primary border-primary/30";
  }
}

function statusIcon(s: string) {
  switch (s) {
    case "confirmed":
      return <CheckCircle2 className="h-6 w-6" />;
    case "completed":
      return <CheckCircle2 className="h-6 w-6" />;
    case "cancelled":
      return <XCircle className="h-6 w-6" />;
    case "no_show":
      return <AlertCircle className="h-6 w-6" />;
    default:
      return <Clock3 className="h-6 w-6" />;
  }
}

function statusMessage(s: string) {
  switch (s) {
    case "new":
      return "تم استلام حجزك وسيتم التواصل معك قريباً للتأكيد.";
    case "confirmed":
      return "تم تأكيد موعدك. نرجو الحضور قبل الموعد بـ 15 دقيقة.";
    case "completed":
      return "تمّت زيارتك بنجاح. نتمنى لك دوام الصحة.";
    case "cancelled":
      return "تم إلغاء هذا الحجز. يمكنك حجز موعد جديد في أي وقت.";
    case "no_show":
      return "لم يتم تسجيل حضورك. يرجى إعادة الحجز عند الحاجة.";
    default:
      return "";
  }
}

function countdown(dateStr: string, timeStr: string): string | null {
  const target = new Date(`${dateStr}T${timeStr}`);
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `متبقّي ${days} يوم${days > 1 ? "" : ""} و ${hours} ساعة`;
  if (hours > 0) return `متبقّي ${hours} ساعة و ${mins} دقيقة`;
  return `متبقّي ${mins} دقيقة`;
}

function LookupPage() {
  const { t, lang } = useI18n();
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [appt, setAppt] = useState<AppointmentRow | null>(null);
  const [searched, setSearched] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ref.trim() || !phone.trim()) {
      toast.error(t("required"));
      return;
    }
    setLoading(true);
    setSearched(true);
    const { data, error } = await supabase.rpc("lookup_appointment", {
      _ref: ref.trim(),
      _phone: phone.trim(),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setAppt(row ?? null);
    setShowCancel(false);
    setCancelReason("");
  };

  const cancelBooking = async () => {
    if (!appt) return;
    if (!cancelReason.trim()) {
      toast.error("السبب مطلوب");
      return;
    }
    setCancelling(true);
    const { data, error } = await supabase.rpc("cancel_appointment_by_ref", {
      _ref: ref.trim(),
      _phone: phone.trim(),
      _reason: cancelReason.trim(),
    });
    setCancelling(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data) {
      toast.success(t("cancelled_ok"));
      setShowCancel(false);
      setCancelReason("");
      submit();
    } else {
      toast.error(t("lookup_not_found"));
    }
  };

  const doctorName = appt
    ? lang === "ar"
      ? appt.doctor_name_ar
      : appt.doctor_name_en
    : null;
  const specialtyName = appt
    ? lang === "ar"
      ? appt.specialty_name_ar
      : appt.specialty_name_en
    : null;


  const share: ShareBooking | null = appt
    ? {
        ref: appt.id.slice(0, 8).toUpperCase(),
        patient_name: appt.patient_name,
        patient_phone: appt.patient_phone,
        appointment_date: appt.appointment_date,
        appointment_time: appt.appointment_time,
      doctor: doctorName ?? undefined,
      specialty: specialtyName ?? undefined,
      }
    : null;

  return (
    <div className="container-app py-12">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Search className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-3xl font-bold">{t("lookup_title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("lookup_desc")}</p>
        </header>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-border bg-card p-6 md:p-8 grid gap-4 sm:grid-cols-2"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("lookup_ref")}
            </span>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="مثل: A1B2C3D4"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              maxLength={12}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("lookup_phone")}
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="05xxxxxxxx"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={32}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {loading ? t("loading") : t("lookup_check")}
            </button>
          </div>
        </form>

        {searched && !loading && !appt && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {t("lookup_not_found")}
          </div>
        )}

        {appt && share && (
          <div className="mt-6 space-y-4">
            {/* Prominent status banner */}
            <div className={`rounded-2xl border p-5 ${statusColor(appt.status)}`}>
              <div className="flex items-start gap-4">
                <div className="shrink-0">{statusIcon(appt.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-lg font-bold">{t(statusKey(appt.status))}</div>
                    <div className="text-xs opacity-80">
                      <span className="opacity-70">{t("booking_ref")}: </span>
                      <span className="font-mono font-bold">{share.ref}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm opacity-90">{statusMessage(appt.status)}</p>
                  {(appt.status === "new" || appt.status === "confirmed") &&
                    countdown(appt.appointment_date, appt.appointment_time) && (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {countdown(appt.appointment_date, appt.appointment_time)}
                      </div>
                    )}
                </div>
              </div>
            </div>

            {/* Timeline */}
            <StatusTimeline
              status={appt.status}
              createdAt={appt.created_at}
              apptDate={appt.appointment_date}
              apptTime={appt.appointment_time}
            />


            {/* Details card */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="grid gap-3 text-sm">
                <Row icon={<User className="h-4 w-4" />} label={t("name")} value={appt.patient_name} />
                <Row icon={<Phone className="h-4 w-4" />} label={t("phone")} value={appt.patient_phone} />
                {specialtyName && (
                  <Row
                    icon={<Stethoscope className="h-4 w-4" />}
                    label={t("nav_specialties")}
                    value={specialtyName}
                  />
                )}
                {doctorName && (
                  <Row icon={<User className="h-4 w-4" />} label={t("nav_doctors")} value={doctorName} />
                )}
                <Row
                  icon={<Calendar className="h-4 w-4" />}
                  label={t("date")}
                  value={`${appt.appointment_date} (${WEEKDAYS_AR[new Date(appt.appointment_date).getDay()]})`}
                />
                <Row
                  icon={<Clock className="h-4 w-4" />}
                  label={t("time")}
                  value={appt.appointment_time.slice(0, 5)}
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  onClick={() => downloadIcs(share)}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  <Calendar className="h-4 w-4" /> {t("add_to_calendar")}
                </button>
                <a
                  href={whatsappShareUrl(share)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  {t("share_whatsapp")}
                </a>
                {(appt.status === "new" || appt.status === "confirmed") && !showCancel && (
                  <button
                    onClick={() => setShowCancel(true)}
                    className="ms-auto inline-flex items-center gap-2 rounded-md border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/5"
                  >
                    <X className="h-4 w-4" /> {t("cancel_booking")}
                  </button>
                )}
              </div>

              {showCancel && (
                <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <div className="text-sm font-semibold text-destructive">
                    {t("cancel_confirm")}
                  </div>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder={t("cancel_reason_ph") ?? "سبب الإلغاء"}
                    rows={3}
                    maxLength={500}
                    className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="mt-3 flex flex-wrap gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowCancel(false);
                        setCancelReason("");
                      }}
                      className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                    >
                      تراجع
                    </button>
                    <button
                      onClick={cancelBooking}
                      disabled={cancelling || !cancelReason.trim()}
                      className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      {cancelling ? t("loading") : t("cancel_booking")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}
