import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Check, ArrowLeft, ArrowRight, Calendar as CalIcon, Clock, User, Search } from "lucide-react";
import { friendlyInsertError } from "@/lib/insert-errors";
import { downloadIcs, whatsappShareUrl, type ShareBooking } from "@/lib/booking-share";

const search = z.object({
  specialty: z.string().optional(),
  doctor: z.string().optional(),
});

// Public booking input caps. Kept intentionally in sync with the DB RLS
// WITH CHECK constraints on `public.appointments`:
//   patient_name : btrim length 2-120
//   patient_phone: btrim length 6-32
// `reason` mirrors REASON_MAX (500) from src/lib/reason.ts so a rejected
// audit-reason cap can never differ from what the booking form allowed.
const NAME_MIN = 2,
  NAME_MAX = 120;
const PHONE_MIN = 6,
  PHONE_MAX = 32;
const NID_MAX = 20;
const REASON_MAX = 500;
const PHONE_RE = /^[+0-9\s\-()]+$/;

const bookingFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(NAME_MIN, "الاسم قصير جدًا (٢ أحرف على الأقل)")
    .max(NAME_MAX, "الاسم طويل جدًا"),
  phone: z
    .string()
    .trim()
    .min(PHONE_MIN, "رقم الهاتف قصير جدًا")
    .max(PHONE_MAX, "رقم الهاتف طويل جدًا")
    .regex(PHONE_RE, "رقم الهاتف يحتوي على أحرف غير مسموحة"),
  national_id: z.string().trim().max(NID_MAX, "رقم الهوية طويل جدًا").optional().or(z.literal("")),
  gender: z.enum(["male", "female"], { message: "الجنس غير صالح" }),
  reason: z
    .string()
    .trim()
    .max(REASON_MAX, `السبب طويل جدًا (الحد الأقصى ${REASON_MAX} حرفًا)`)
    .optional()
    .or(z.literal("")),
});

/**
 * Generate an RFC-4122 v4 uuid client-side so we can set the appointment id
 * before insert and skip the returning-representation round trip (anon
 * cannot SELECT `appointments`). Uses `crypto.randomUUID` when available.
 */
function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c!.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const Route = createFileRoute("/book")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "احجز موعدًا | مجمع باعشن الطبي" },
      {
        name: "description",
        content: "احجز موعدك أونلاين مع طبيبك في مجمع باعشن الطبي بصبيا، جازان. تدفق سريع وسهل.",
      },
      { property: "og:title", content: "احجز موعدًا — مجمع باعشن الطبي" },
    ],
  }),
  component: BookPage,
});

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function BookPage() {
  const { specialty: initSpec, doctor: initDoc } = Route.useSearch();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(initDoc ?? null);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    national_id: "",
    gender: "male",
    reason: "",
    reminder_24h: true,
    reminder_2h: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const { data: specialties } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () =>
      (await supabase.from("specialties").select("*").eq("is_active", true).order("sort_order"))
        .data ?? [],
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors_all"],
    queryFn: async () =>
      (await supabase.from("doctors").select("*, specialties(*)").eq("is_active", true)).data ?? [],
  });

  useEffect(() => {
    if (specialtyId) return;
    if (specialties && initSpec) {
      const s = specialties.find((x) => x.slug === initSpec);
      if (s) {
        setSpecialtyId(s.id);
        return;
      }
    }
    if (doctorId && doctors) {
      const d = doctors.find((x) => x.id === doctorId);
      if (d?.specialty_id) setSpecialtyId(d.specialty_id);
    }
  }, [specialties, doctors, initSpec, doctorId, specialtyId]);

  const filteredDoctors = (doctors ?? []).filter(
    (d) => !specialtyId || d.specialty_id === specialtyId,
  );

  const { data: availability } = useQuery({
    queryKey: ["availability", doctorId, specialtyId],
    enabled: !!(doctorId || specialtyId),
    queryFn: async () => {
      let q = supabase.from("availability").select("*");
      if (doctorId) q = q.eq("doctor_id", doctorId);
      else if (specialtyId) {
        const ids = filteredDoctors.map((d) => d.id);
        if (ids.length === 0) return [];
        q = q.in("doctor_id", ids);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // generate next 14 days that have availability
  const availableDates = useMemo(() => {
    if (!availability) return [];
    const days = new Set(availability.map((a) => a.weekday));
    const out: { date: string; label: string; weekday: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 21 && out.length < 14; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const wd = d.getDay();
      if (days.has(wd)) {
        const iso = d.toISOString().slice(0, 10);
        out.push({ date: iso, label: `${d.getDate()}/${d.getMonth() + 1}`, weekday: wd });
      }
    }
    return out;
  }, [availability]);

  const availableTimes = useMemo(() => {
    if (!date || !availability) return [];
    const wd = new Date(date).getDay();
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
  }, [date, availability]);

  const submit = async () => {
    if (!date || !time) {
      toast.error(lang === "ar" ? "يرجى اختيار التاريخ والوقت" : "Please pick a date and time");
      return;
    }
    const parsed = bookingFormSchema.safeParse(form);
    if (!parsed.success) {
      // Surface the first validation issue in Arabic; keeps UI simple and
      // prevents a raw Zod path/JSON blob from leaking into the toast.
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
      return;
    }
    const v = parsed.data;
    setSubmitting(true);
    // Generate the id client-side so we can show a reference to the patient
    // WITHOUT relying on `Prefer: return=representation` — anon has no SELECT
    // policy on `appointments`, so `.select("id").single()` after insert
    // would trip RLS and the whole insert would roll back. Since the DB
    // default is also `gen_random_uuid()`, providing our own value here is
    // just a way to avoid the read-back round trip.
    const newId = randomId();
    // NOTE: `status` and `notes` are intentionally omitted from the payload;
    // even if a client injected them, `trg_force_appointment_defaults`
    // rewrites them to 'new'/NULL for anon inserts.
    const { error } = await supabase.from("appointments").insert({
      id: newId,
      patient_name: v.name,
      patient_phone: v.phone,
      national_id: v.national_id ? v.national_id : null,
      gender: v.gender,
      specialty_id: specialtyId,
      doctor_id: doctorId,
      appointment_date: date,
      appointment_time: time,
      reason: v.reason ? v.reason : null,
      reminder_24h: form.reminder_24h,
      reminder_2h: form.reminder_2h,
    });
    setSubmitting(false);
    if (error) {
      toast.error(friendlyInsertError(error));
      return;
    }
    const ref = newId.slice(0, 8).toUpperCase();
    navigate({
      to: "/booking-confirmation",
      search: { ref, phone: v.phone },
    });
  };


  return (
    <div className="container-app py-12">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">{t("cta_book")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("step")} {step} {t("of")} 4
          </p>
          <div className="mt-4 flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        </header>

        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          {step === 1 && (
            <div>
              <h2 className="text-lg font-bold mb-4">{t("choose_specialty")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {specialties?.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSpecialtyId(s.id);
                      setDoctorId(null);
                    }}
                    className={`text-start rounded-lg border p-3 text-sm transition ${specialtyId === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    {lang === "ar" ? s.name_ar : s.name_en}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-lg font-bold mb-4">{t("choose_doctor")}</h2>
              <div className="grid gap-2">
                <button
                  onClick={() => setDoctorId(null)}
                  className={`text-start rounded-lg border p-4 transition ${doctorId === null ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                >
                  <div className="font-semibold text-sm">{t("any_available")}</div>
                </button>
                {filteredDoctors.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDoctorId(d.id)}
                    className={`flex items-center gap-3 text-start rounded-lg border p-4 transition ${doctorId === d.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center font-bold">
                      {(lang === "ar" ? d.name_ar : d.name_en).charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">
                        {lang === "ar" ? d.name_ar : d.name_en}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {lang === "ar" ? d.title_ar : d.title_en}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-lg font-bold mb-4">{t("choose_datetime")}</h2>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                  <CalIcon className="h-3 w-3" /> {t("date")}
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {availableDates.map((d) => (
                    <button
                      key={d.date}
                      onClick={() => {
                        setDate(d.date);
                        setTime("");
                      }}
                      className={`rounded-lg border p-2 text-xs text-center transition ${date === d.date ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                    >
                      <div className="font-semibold">{d.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {WEEKDAYS_AR[d.weekday]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              {date && (
                <div className="mt-6">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                    <Clock className="h-3 w-3" /> {t("time")}
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {availableTimes.map((tm) => (
                      <button
                        key={tm}
                        onClick={() => setTime(tm)}
                        className={`rounded-md border py-2 text-sm transition ${time === tm ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
                      >
                        {tm}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <User className="h-5 w-5" /> {t("patient_info")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("name")} required>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    maxLength={NAME_MAX}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label={t("phone")} required>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    inputMode="tel"
                    maxLength={PHONE_MAX}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label={t("national_id")}>
                  <input
                    value={form.national_id}
                    onChange={(e) => setForm({ ...form, national_id: e.target.value })}
                    maxLength={NID_MAX}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label={t("gender")}>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="male">{t("male")}</option>
                    <option value="female">{t("female")}</option>
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t("reason")}>
                    <textarea
                      value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      rows={3}
                      maxLength={REASON_MAX}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </Field>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-card p-4">
                <div className="text-sm font-semibold">تذكيرات قبل الموعد</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  اختر متى تودّ استلام تذكير قبل موعدك.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                      form.reminder_24h ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.reminder_24h}
                      onChange={(e) => setForm({ ...form, reminder_24h: e.target.checked })}
                      className="accent-primary"
                    />
                    قبل الموعد بـ 24 ساعة
                  </label>
                  <label
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                      form.reminder_2h ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.reminder_2h}
                      onChange={(e) => setForm({ ...form, reminder_2h: e.target.checked })}
                      className="accent-primary"
                    />
                    قبل الموعد بساعتين
                  </label>
                </div>
              </div>

              </div>

              <div className="mt-6 rounded-lg bg-muted/60 p-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("date")}:</span>{" "}
                  <span className="font-semibold">{date}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("time")}:</span>{" "}
                  <span className="font-semibold">{time}</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="inline-flex items-center gap-1 rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              <ArrowRight className="h-4 w-4 rtl:hidden" />
              <ArrowLeft className="h-4 w-4 ltr:hidden" /> {t("back")}
            </button>

            {step < 4 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={(step === 1 && !specialtyId) || (step === 3 && (!date || !time))}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
              >
                {t("next")} <ArrowLeft className="h-4 w-4 rtl:hidden" />
                <ArrowRight className="h-4 w-4 ltr:hidden" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
              >
                {submitting ? t("loading") : t("submit")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}
