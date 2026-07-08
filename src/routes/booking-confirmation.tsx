import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  Check,
  Calendar,
  Clock,
  User,
  Phone,
  Stethoscope,
  Building2,
  Search,
  CalendarPlus,
  Share2,
  FileText,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { downloadIcs, whatsappShareUrl, googleCalendarUrl, type ShareBooking } from "@/lib/booking-share";

const searchSchema = z.object({
  ref: z.string().optional(),
  phone: z.string().optional(),
  branch: z.string().optional(),
});

export const Route = createFileRoute("/booking-confirmation")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "تأكيد الحجز | مجمع باعشن الطبي" },
      { name: "description", content: "ملخص الحجز ورقم الحجز في مجمع باعشن الطبي." },
      { property: "og:title", content: "تأكيد الحجز — مجمع باعشن الطبي" },
      { property: "og:description", content: "استعرض تفاصيل موعدك ورقم الحجز." },
    ],
  }),
  component: BookingConfirmationPage,
});

type AppointmentSummary = {
  id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  reason: string | null;
  specialty_id: string | null;
  doctor_id: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  doctor_name_ar: string | null;
  doctor_name_en: string | null;
  created_at: string;
  reminder_24h: boolean | null;
  reminder_2h: boolean | null;
};

const WEEKDAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function statusLabel(s: string) {
  switch (s) {
    case "confirmed":
      return "مؤكد";
    case "completed":
      return "مكتمل";
    case "cancelled":
      return "ملغى";
    case "no_show":
      return "لم يحضر";
    default:
      return "قيد المراجعة";
  }
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

function BookingConfirmationPage() {
  const { ref, phone, branch } = Route.useSearch();
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [appt, setAppt] = useState<AppointmentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref || !phone) {
      setLoading(false);
      setError("يرجى إدخال رقم الحجز ورقم الجوال لعرض التفاصيل.");
      return;
    }
    let cancelled = false;
    const fetchAppt = async () => {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc("lookup_appointment", {
        _ref: ref,
        _phone: phone,
      });
      if (cancelled) return;
      setLoading(false);
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setError(t("lookup_not_found"));
        return;
      }
      setAppt(row as AppointmentSummary);
    };
    fetchAppt();
    return () => {
      cancelled = true;
    };
  }, [ref, phone, t]);

  const share: ShareBooking | null = appt
    ? {
        ref: appt.id.slice(0, 8).toUpperCase(),
        patient_name: appt.patient_name,
        patient_phone: appt.patient_phone,
        appointment_date: appt.appointment_date,
        appointment_time: appt.appointment_time.slice(0, 5),
        doctor: lang === "ar" ? appt.doctor_name_ar ?? undefined : appt.doctor_name_en ?? undefined,
        specialty: lang === "ar" ? appt.specialty_name_ar ?? undefined : appt.specialty_name_en ?? undefined,
        reminder_24h: appt.reminder_24h,
        reminder_2h: appt.reminder_2h,
      }
    : null;

  return (
    <div className="container-app py-12">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-3xl font-bold">{t("booking_success")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("booking_success_desc")}</p>
        </header>

        {loading && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">جارٍ تحميل تفاصيل الحجز…</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-3 text-sm text-destructive">{error}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link
                to="/lookup"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                <Search className="h-4 w-4" /> {t("track_booking")}
              </Link>
              <Link
                to="/book"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <CalendarPlus className="h-4 w-4" /> حجز جديد
              </Link>
            </div>
          </div>
        )}

        {!loading && appt && share && (
          <div className="space-y-4">
            <div className={`rounded-2xl border p-5 ${statusColor(appt.status)}`}>
              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  <Check className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-lg font-bold">{statusLabel(appt.status)}</div>
                    <div className="text-xs opacity-80">
                      <span className="opacity-70">{t("booking_ref")}: </span>
                      <span className="font-mono font-bold">{share.ref}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm opacity-90">
                    تم استلام حجزك وسنتواصل معك لتأكيد الموعد.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-bold mb-4">ملخص الحجز</h2>
              <div className="grid gap-3 text-sm">
                {branch && (
                  <Row icon={<Building2 className="h-4 w-4" />} label="الفرع" value={branch} />
                )}
                {share.specialty && (
                  <Row
                    icon={<Stethoscope className="h-4 w-4" />}
                    label={t("nav_specialties")}
                    value={share.specialty}
                  />
                )}
                {share.doctor && (
                  <Row icon={<User className="h-4 w-4" />} label={t("nav_doctors")} value={share.doctor} />
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
                <Row icon={<User className="h-4 w-4" />} label={t("name")} value={appt.patient_name} />
                <Row icon={<Phone className="h-4 w-4" />} label={t("phone")} value={appt.patient_phone} />
                {appt.reason && (
                  <Row icon={<Share2 className="h-4 w-4" />} label={t("reason")} value={appt.reason} />
                )}
              </div>

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
                  <Share2 className="h-4 w-4" /> {t("share_whatsapp")}
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                to="/lookup"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                <Search className="h-4 w-4" /> {t("track_booking")}
              </Link>
              <Link
                to="/book"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <CalendarPlus className="h-4 w-4" /> حجز جديد
              </Link>
              <Link
                to="/"
                className="inline-flex items-center gap-1 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("nav_home")}
              </Link>
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
