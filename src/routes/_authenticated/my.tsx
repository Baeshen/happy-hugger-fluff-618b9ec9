import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Calendar, Clock, User, Stethoscope, Plus, Search, History } from "lucide-react";
import { WEEKDAYS_AR } from "@/lib/site";
import { downloadIcs, whatsappShareUrl, type ShareBooking } from "@/lib/booking-share";
import { toast } from "sonner";
import { ReminderHistoryForMyAppointmentModal } from "@/components/ReminderPreferenceHistory";

export const Route = createFileRoute("/_authenticated/my")({
  component: MyPortal,
});

type Row = {
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

function MyPortal() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [reminderHistoryId, setReminderHistoryId] = useState<string | null>(null);

  const load = async () => {
    const { data: prof } = await supabase.auth.getUser();
    if (!prof.user) return;
    const { data: p } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", prof.user.id)
      .maybeSingle();
    setProfilePhone(p?.phone ?? null);
    if (p?.phone) setPhoneInput(p.phone);

    const { data, error } = await supabase.rpc("my_appointments");
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as Row[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const savePhone = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setSavingPhone(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: u.user.id, phone: phoneInput.trim() });
    setSavingPhone(false);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    load();
  };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const upcoming = (rows ?? []).filter(
    (r) => r.appointment_date >= today && r.status !== "cancelled" && r.status !== "completed",
  );
  const past = (rows ?? []).filter(
    (r) => r.appointment_date < today || r.status === "cancelled" || r.status === "completed",
  );
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div className="container-app py-10">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">{t("my_appointments")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("my_appointments_desc")}</p>
          </div>
          <Link
            to="/book"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> {t("cta_book")}
          </Link>
        </header>

        <div
          className={`mb-6 rounded-2xl border p-5 ${
            profilePhone ? "border-border bg-card" : "border-amber-500/40 bg-amber-500/5"
          }`}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">ربط رقم الجوال</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {profilePhone
                  ? `الرقم الحالي: ${profilePhone} — يمكنك تعديله لربط حجوزات مسجّلة برقم آخر.`
                  : t("update_phone_hint")}
              </p>
            </div>
            {profilePhone && (
              <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
                مربوط
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <input
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              inputMode="tel"
              placeholder="05xxxxxxxx"
              className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={savePhone}
              disabled={
                savingPhone ||
                phoneInput.trim().length < 6 ||
                phoneInput.trim() === (profilePhone ?? "")
              }
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {savingPhone ? t("loading") : profilePhone ? "تحديث الرقم" : "ربط الرقم"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            سيتم ربط جميع الحجوزات المسجّلة بهذا الرقم تلقائياً وعرضها هنا.
          </p>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-1">
          {(["upcoming", "past"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-1.5 text-sm rounded-md font-medium transition ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(k)}
            </button>
          ))}
        </div>

        {rows === null ? (
          <div className="text-center py-16 text-muted-foreground">{t("loading")}</div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted grid place-items-center text-muted-foreground">
              <Calendar className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t("no_appointments")}</p>
            <div className="mt-4 flex justify-center gap-2 flex-wrap">
              <Link
                to="/book"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <Plus className="h-4 w-4" /> {t("cta_book")}
              </Link>
              <Link
                to="/lookup"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                <Search className="h-4 w-4" /> {t("track_booking")}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {list.map((r) => {
              const doctor = lang === "ar" ? r.doctor_name_ar : r.doctor_name_en;
              const specialty = lang === "ar" ? r.specialty_name_ar : r.specialty_name_en;
              const share: ShareBooking = {
                ref: r.id.slice(0, 8).toUpperCase(),
                patient_name: r.patient_name,
                patient_phone: r.patient_phone,
                appointment_date: r.appointment_date,
                appointment_time: r.appointment_time,
                doctor: doctor ?? undefined,
                specialty: specialty ?? undefined,
              };
              return (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusColor(r.status)}`}
                        >
                          {t(statusKey(r.status))}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {share.ref}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        {specialty && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Stethoscope className="h-3.5 w-3.5" /> {specialty}
                          </div>
                        )}
                        {doctor && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <User className="h-3.5 w-3.5" /> {doctor}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium">
                            {r.appointment_date} ({WEEKDAYS_AR[new Date(r.appointment_date).getDay()]})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium">{r.appointment_time.slice(0, 5)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {tab === "upcoming" && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => downloadIcs(share)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        <Calendar className="h-3.5 w-3.5" /> {t("add_to_calendar")}
                      </button>
                      <a
                        href={whatsappShareUrl(share)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        {t("share_whatsapp")}
                      </a>
                      <button
                        onClick={() => setReminderHistoryId(r.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        <History className="h-3.5 w-3.5" /> سجل التذكيرات
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
