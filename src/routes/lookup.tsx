import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Search, Calendar, Clock, User, Phone, Stethoscope, X, CheckCircle2, AlertCircle, XCircle, Clock3, CalendarClock, CalendarPlus } from "lucide-react";
import { WEEKDAYS_AR } from "@/lib/site";
import { downloadIcs, whatsappShareUrl, googleCalendarUrl, type ShareBooking } from "@/lib/booking-share";
import { ReminderHistoryByRefModal } from "@/components/ReminderPreferenceHistory";

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
  specialty_id: string | null;
  doctor_id: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  doctor_name_ar: string | null;
  doctor_name_en: string | null;
  created_at: string;
  reminder_24h: boolean | null;
  reminder_2h: boolean | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
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
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  const [rescheduleReminder24h, setRescheduleReminder24h] = useState(true);
  const [rescheduleReminder2h, setRescheduleReminder2h] = useState(true);
  const [showReminderHistory, setShowReminderHistory] = useState(false);

  const toggleReminder = async (which: "24h" | "2h", value: boolean) => {
    if (!appt) return;
    setSavingReminders(true);
    const payload = {
      _ref: ref.trim(),
      _phone: phone.trim(),
      _reminder_24h: which === "24h" ? value : appt.reminder_24h ?? true,
      _reminder_2h: which === "2h" ? value : appt.reminder_2h ?? true,
    };
    const { data, error } = await supabase.rpc("update_reminders_by_ref", payload);
    setSavingReminders(false);
    if (error) return toast.error(error.message);
    if (!data) return toast.error(t("lookup_not_found"));
    setAppt({
      ...appt,
      reminder_24h: payload._reminder_24h,
      reminder_2h: payload._reminder_2h,
    });
    toast.success("تم حفظ إعدادات التذكير");
  };
  const [newDate, setNewDate] = useState<string>("");
  const [newTime, setNewTime] = useState<string>("");
  const [availability, setAvailability] = useState<
    { weekday: number; start_time: string; end_time: string; slot_minutes: number }[] | null
  >(null);

  useEffect(() => {
    if (showReschedule && appt) {
      setRescheduleReminder24h(appt.reminder_24h ?? true);
      setRescheduleReminder2h(appt.reminder_2h ?? true);
    }
  }, [showReschedule, appt]);

  useEffect(() => {
    if (!showReschedule || !appt?.doctor_id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("availability")
        .select("weekday,start_time,end_time,slot_minutes")
        .eq("doctor_id", appt.doctor_id!);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      setAvailability(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [showReschedule, appt?.doctor_id]);

  const availableDates = useMemo(() => {
    if (!availability) return [];
    const days = new Set(availability.map((a) => a.weekday));
    const out: { date: string; label: string; weekday: number }[] = [];
    const now = new Date();
    for (let i = 1; i < 30 && out.length < 14; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      if (days.has(d.getDay())) {
        out.push({
          date: d.toISOString().slice(0, 10),
          label: `${d.getDate()}/${d.getMonth() + 1}`,
          weekday: d.getDay(),
        });
      }
    }
    return out;
  }, [availability]);

  const availableTimes = useMemo(() => {
    if (!newDate || !availability) return [];
    const wd = new Date(newDate).getDay();
    const slots = new Set<string>();
    availability
      .filter((a) => a.weekday === wd)
      .forEach((a) => {
        const [sh, sm] = a.start_time.split(":").map(Number);
        const [eh, em] = a.end_time.split(":").map(Number);
        let mins = sh * 60 + sm;
        const end = eh * 60 + em;
        while (mins + a.slot_minutes <= end) {
          slots.add(
            `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`,
          );
          mins += a.slot_minutes;
        }
      });
    return Array.from(slots).sort();
  }, [newDate, availability]);

  const rescheduleBooking = async () => {
    if (!appt || !newDate || !newTime) {
      toast.error("يرجى اختيار التاريخ والوقت");
      return;
    }
    setRescheduling(true);
    const { data, error } = await supabase.rpc("reschedule_appointment_by_ref", {
      _ref: ref.trim(),
      _phone: phone.trim(),
      _new_date: newDate,
      _new_time: `${newTime}:00`,
      _reason: "إعادة جدولة من المراجع",
    });
    setRescheduling(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data) {
      // Apply the reminder choices selected by the user inside the reschedule panel.
      await supabase.rpc("update_reminders_by_ref", {
        _ref: ref.trim(),
        _phone: phone.trim(),
        _reminder_24h: rescheduleReminder24h,
        _reminder_2h: rescheduleReminder2h,
      });
      const reminderList = [
        rescheduleReminder24h && "24 ساعة",
        rescheduleReminder2h && "ساعتين",
      ].filter(Boolean);
      const reminderMsg =
        reminderList.length > 0
          ? `تم تعيين تذكير: ${reminderList.join(" و ")}`
          : "تم إيقاف جميع التذكيرات";
      toast.success(`تمت إعادة الجدولة — ${reminderMsg}`);
      setShowReschedule(false);
      setNewDate("");
      setNewTime("");
      submit();
    } else {
      toast.error(t("lookup_not_found"));
    }
  };


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
      reminder_24h: appt.reminder_24h,
      reminder_2h: appt.reminder_2h,
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
                  {appt.status === "cancelled" && (appt.cancel_reason || appt.cancelled_at) && (
                    <div className="mt-3 rounded-xl border border-red-500/30 bg-background/70 p-3 text-sm">
                      <div className="flex items-center gap-2 text-red-700 font-semibold">
                        <XCircle className="h-4 w-4" />
                        <span>سبب الإلغاء</span>
                      </div>
                      {appt.cancel_reason ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-foreground/90 leading-relaxed">
                          {appt.cancel_reason}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-muted-foreground">لم يُسجَّل سبب محدد.</p>
                      )}
                      {appt.cancelled_at && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          تاريخ الإلغاء:{" "}
                          {new Date(appt.cancelled_at).toLocaleString("ar-SA", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                      )}
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

              {(appt.status === "new" || appt.status === "confirmed") && (
                <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold">تذكيرات قبل الموعد</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        فعّل/عطّل التذكيرات المرتبطة بهذا الحجز.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { key: "24h" as const, label: "قبل 24 ساعة", value: !!appt.reminder_24h },
                      { key: "2h" as const, label: "قبل ساعتين", value: !!appt.reminder_2h },
                    ].map((r) => (
                      <button
                        key={r.key}
                        disabled={savingReminders}
                        onClick={() => toggleReminder(r.key, !r.value)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                          r.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            r.value ? "bg-primary-foreground" : "bg-muted-foreground/40"
                          }`}
                          aria-hidden
                        />
                        {r.label}
                        <span className="text-[10px] opacity-80">
                          {r.value ? "مفعّل" : "معطّل"}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReminderHistory(true)}
                    className="mt-3 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    عرض سجل تفضيلات التذكير
                  </button>
                </div>
              )}



              <div className="mt-6 flex flex-wrap gap-2">
                <a
                  href={googleCalendarUrl(share)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                  title="فتح في Google Calendar"
                >
                  <Calendar className="h-4 w-4" /> Google Calendar
                </a>
                <button
                  onClick={() => downloadIcs(share)}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                  title="ملف ICS يعمل مع Apple / Outlook / أي تقويم"
                >
                  <Calendar className="h-4 w-4" /> ملف ICS
                </button>
                <a
                  href={whatsappShareUrl(share)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  {t("share_whatsapp")}
                </a>
                {(appt.status === "new" || appt.status === "confirmed") &&
                  appt.doctor_id &&
                  !showReschedule &&
                  !showCancel && (
                    <button
                      onClick={() => setShowReschedule(true)}
                      className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-4 py-2 text-sm text-primary hover:bg-primary/5"
                    >
                      <CalendarPlus className="h-4 w-4" /> إعادة جدولة
                    </button>
                  )}
                {(appt.status === "new" || appt.status === "confirmed") && !showCancel && !showReschedule && (
                  <button
                    onClick={() => setShowCancel(true)}
                    className="ms-auto inline-flex items-center gap-2 rounded-md border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/5"
                  >
                    <X className="h-4 w-4" /> {t("cancel_booking")}
                  </button>
                )}
              </div>

              {showReschedule && (
                <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold text-primary">اختيار موعد جديد</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        اختر تاريخاً ووقتاً متاحاً ثم أكّد لإعادة الجدولة. سيتم إعادة التأكيد من الاستقبال.
                      </p>
                      <div className="mt-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs text-primary/90">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <span className="font-semibold">تنبيه:</span> اختر تفضيلات التذكير للموعد الجديد قبل تأكيد إعادة الجدولة. ستُطبّق هذه الإعدادات على الحجز المُعاد جدولته.
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">تذكيرات الموعد الجديد</div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: "24h" as const, label: "قبل 24 ساعة", value: rescheduleReminder24h, setter: setRescheduleReminder24h },
                            { key: "2h" as const, label: "قبل ساعتين", value: rescheduleReminder2h, setter: setRescheduleReminder2h },
                          ].map((r) => (
                            <button
                              key={r.key}
                              onClick={() => r.setter(!r.value)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                r.value
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              <span
                                className={`inline-block h-2 w-2 rounded-full ${
                                  r.value ? "bg-primary-foreground" : "bg-muted-foreground/40"
                                }`}
                                aria-hidden
                              />
                              {r.label}
                              <span className="text-[10px] opacity-80">
                                {r.value ? "مفعّل" : "معطّل"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {!availability ? (
                    <div className="mt-4 text-center text-sm text-muted-foreground py-6">
                      {t("loading")}
                    </div>
                  ) : availableDates.length === 0 ? (
                    <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800">
                      لا تتوفر مواعيد متاحة لهذا الطبيب حالياً. يمكنك التواصل مع الاستقبال.
                    </div>
                  ) : (
                    <>
                      <div className="mt-4">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">التاريخ</div>
                        <div className="flex flex-wrap gap-2">
                          {availableDates.map((d) => (
                            <button
                              key={d.date}
                              onClick={() => {
                                setNewDate(d.date);
                                setNewTime("");
                              }}
                              className={`rounded-md border px-3 py-2 text-xs transition ${
                                newDate === d.date
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background hover:border-primary/50"
                              }`}
                            >
                              <div className="font-semibold">{WEEKDAYS_AR[d.weekday]}</div>
                              <div className="opacity-80">{d.label}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {newDate && (
                        <div className="mt-4">
                          <div className="mb-2 text-xs font-medium text-muted-foreground">الوقت</div>
                          {availableTimes.length === 0 ? (
                            <div className="text-xs text-muted-foreground">لا توجد أوقات متاحة</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {availableTimes.map((tm) => (
                                <button
                                  key={tm}
                                  onClick={() => setNewTime(tm)}
                                  className={`rounded-md border px-3 py-1.5 text-xs font-mono transition ${
                                    newTime === tm
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background hover:border-primary/50"
                                  }`}
                                >
                                  {tm}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowReschedule(false);
                        setNewDate("");
                        setNewTime("");
                      }}
                      className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                    >
                      تراجع
                    </button>
                    <button
                      onClick={rescheduleBooking}
                      disabled={rescheduling || !newDate || !newTime}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      <CalendarPlus className="h-4 w-4" />
                      {rescheduling ? t("loading") : "تأكيد إعادة الجدولة"}
                    </button>
                  </div>
                </div>
              )}


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
      {showReminderHistory && appt && (
        <ReminderHistoryByRefModal
          refValue={ref.trim()}
          phone={phone.trim()}
          onClose={() => setShowReminderHistory(false)}
        />
      )}
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

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type Step = {
  key: string;
  label: string;
  date: string | null;
  state: "done" | "current" | "pending" | "cancelled";
};

function StatusTimeline({
  status,
  createdAt,
  apptDate,
  apptTime,
}: {
  status: string;
  createdAt: string;
  apptDate: string;
  apptTime: string;
}) {
  const apptIso = `${apptDate}T${apptTime}`;
  const apptDone = new Date(apptIso).getTime() <= Date.now();

  const steps: Step[] = (() => {
    if (status === "cancelled") {
      return [
        { key: "received", label: "تم استلام الحجز", date: fmtDateTime(createdAt), state: "done" },
        { key: "cancelled", label: "تم إلغاء الحجز", date: null, state: "cancelled" },
      ];
    }
    const reachedConfirmed = ["confirmed", "completed", "no_show"].includes(status);
    const isCompleted = status === "completed";
    const isNoShow = status === "no_show";
    return [
      {
        key: "received",
        label: "تم استلام الحجز",
        date: fmtDateTime(createdAt),
        state: "done",
      },
      {
        key: "confirmed",
        label: "تأكيد الموعد",
        date: null,
        state: reachedConfirmed ? "done" : status === "new" ? "current" : "pending",
      },
      {
        key: "visit",
        label: "موعد الزيارة",
        date: fmtDateTime(apptIso),
        state: isCompleted
          ? "done"
          : isNoShow
            ? "cancelled"
            : apptDone
              ? "current"
              : reachedConfirmed
                ? "current"
                : "pending",
      },
      {
        key: "completed",
        label: "اكتمال الزيارة",
        date: null,
        state: isCompleted ? "done" : isNoShow ? "cancelled" : "pending",
      },
    ];
  })();

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 text-sm font-semibold">مراحل الحجز</div>
      <ol className="relative">
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          const dot =
            s.state === "done"
              ? "bg-green-500 border-green-500 text-white"
              : s.state === "current"
                ? "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20"
                : s.state === "cancelled"
                  ? "bg-destructive border-destructive text-destructive-foreground"
                  : "bg-background border-border text-muted-foreground";
          const line =
            s.state === "done"
              ? "bg-green-500"
              : s.state === "cancelled"
                ? "bg-destructive"
                : "bg-border";
          return (
            <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
              {!isLast && (
                <span
                  className={`absolute top-8 bottom-0 w-0.5 ${line}`}
                  style={{ insetInlineStart: "0.9375rem" }}
                  aria-hidden
                />
              )}
              <div
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${dot}`}
              >
                {s.state === "done" ? "✓" : s.state === "cancelled" ? "✕" : i + 1}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div
                  className={`text-sm font-semibold ${
                    s.state === "pending" ? "text-muted-foreground" : ""
                  }`}
                >
                  {s.label}
                </div>
                {s.date && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.date}</div>
                )}
                {s.state === "current" && (
                  <div className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    الحالة الحالية
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

