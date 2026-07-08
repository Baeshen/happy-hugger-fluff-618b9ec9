import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalIcon,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Stethoscope,
  Sun,
  Moon,
  User,
  UserCircle2,
} from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { submitBooking, type BookingSubmitResult } from "@/lib/booking-submit";
import { SubmitErrorBanner } from "@/components/SubmitErrorBanner";

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

// (client-side UUID generation removed — the server now assigns IDs and
// returns a tracking reference from POST /api/public/book/create.)

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

// Unified field styling matching /second-opinion + /corporate
const FIELD_CLS =
  "w-full rounded-lg border border-input bg-background px-3.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20";
const INPUT_CLS = `${FIELD_CLS} h-11`;
const TEXTAREA_CLS = `${FIELD_CLS} py-2.5 min-h-[96px]`;

type StepErrors = Partial<Record<"name" | "phone" | "national_id" | "reason", string>>;

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
  const [errors, setErrors] = useState<StepErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<
    Extract<BookingSubmitResult, { ok: false }> | null
  >(null);

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

  const selectedSpecialty = specialties?.find((s) => s.id === specialtyId) ?? null;
  const selectedDoctor = doctors?.find((d) => d.id === doctorId) ?? null;

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

  const morningTimes = availableTimes.filter((tm) => Number(tm.slice(0, 2)) < 12);
  const eveningTimes = availableTimes.filter((tm) => Number(tm.slice(0, 2)) >= 12);

  const validateStep4 = (): boolean => {
    const parsed = bookingFormSchema.safeParse(form);
    if (parsed.success) {
      setErrors({});
      return true;
    }
    const next: StepErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof StepErrors;
      if (key && !next[key]) next[key] = issue.message;
    }
    setErrors(next);
    return false;
  };

  const submit = async () => {
    if (!date || !time) {
      toast.error(lang === "ar" ? "يرجى اختيار التاريخ والوقت" : "Please pick a date and time");
      return;
    }
    if (!validateStep4()) {
      toast.error(lang === "ar" ? "يرجى تصحيح الحقول المميزة" : "Please fix highlighted fields");
      return;
    }
    const v = bookingFormSchema.parse(form);
    setSubmitting(true);
    // Client-side id avoids a read-back that anon can't perform under RLS.
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

  const STEP_LABELS = [
    { n: 1, label: "التخصص", icon: Stethoscope },
    { n: 2, label: "الطبيب", icon: UserCircle2 },
    { n: 3, label: "الموعد", icon: CalIcon },
    { n: 4, label: "بياناتك", icon: User },
  ];

  const canGoNext =
    (step === 1 && !!specialtyId) ||
    (step === 2 && true) || // doctor optional (any_available)
    (step === 3 && !!date && !!time);

  return (
    <>
      <PageHero
        eyebrow="حجز موعد"
        title={t("cta_book")}
        subtitle="اختر تخصصك ثم طبيبك ووقتك المناسب، وسنؤكد موعدك خلال دقائق."
      >
        {/* Step tracker */}
        <div className="max-w-3xl">
          <ol className="flex items-center gap-2 sm:gap-3">
            {STEP_LABELS.map(({ n, label, icon: Icon }, i) => {
              const done = step > n;
              const active = step === n;
              return (
                <li key={n} className="flex items-center gap-2 sm:gap-3 flex-1">
                  <div
                    className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : done
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-background/60 text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${
                        active
                          ? "bg-primary-foreground/20"
                          : done
                            ? "bg-primary/20"
                            : "bg-muted"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    </span>
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{n}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div
                      className={`h-px flex-1 ${done ? "bg-primary/40" : "bg-border"}`}
                      aria-hidden
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </PageHero>

      <div className="container-app py-10 md:py-14">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main card */}
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm">
            {step === 1 && (
              <div>
                <h2 className="text-lg font-bold mb-1">{t("choose_specialty")}</h2>
                <p className="text-xs text-muted-foreground mb-5">
                  اختر التخصص الطبي الذي يناسب حالتك.
                </p>
                {!specialties ? (
                  <SkeletonGrid />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {specialties.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSpecialtyId(s.id);
                          setDoctorId(null);
                        }}
                        className={`group relative text-start rounded-xl border p-3.5 text-sm transition ${
                          specialtyId === s.id
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/50 hover:bg-muted/40"
                        }`}
                      >
                        {specialtyId === s.id && (
                          <span className="absolute top-2 end-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        <div className="font-semibold text-foreground pe-6">
                          {lang === "ar" ? s.name_ar : s.name_en}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-lg font-bold mb-1">{t("choose_doctor")}</h2>
                <p className="text-xs text-muted-foreground mb-5">
                  يمكنك اختيار طبيب معيّن أو ترك النظام يقترح أقرب طبيب متاح.
                </p>
                <div className="grid gap-2.5">
                  <button
                    onClick={() => setDoctorId(null)}
                    className={`flex items-center gap-3 text-start rounded-xl border p-4 transition ${
                      doctorId === null
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
                      <UserCircle2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{t("any_available")}</div>
                      <div className="text-xs text-muted-foreground">
                        سنحجز لك عند أول طبيب متاح في التخصص
                      </div>
                    </div>
                    {doctorId === null && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                  {filteredDoctors.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      لا يوجد أطباء في هذا التخصص حاليًا.
                    </div>
                  )}
                  {filteredDoctors.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDoctorId(d.id)}
                      className={`flex items-center gap-3 text-start rounded-xl border p-4 transition ${
                        doctorId === d.id
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="h-11 w-11 rounded-full bg-primary/10 text-primary grid place-items-center font-bold">
                        {(lang === "ar" ? d.name_ar : d.name_en).charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-sm">
                          {lang === "ar" ? d.name_ar : d.name_en}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {lang === "ar" ? d.title_ar : d.title_en}
                        </div>
                      </div>
                      {doctorId === d.id && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-lg font-bold mb-1">{t("choose_datetime")}</h2>
                <p className="text-xs text-muted-foreground mb-5">
                  اختر اليوم ثم الوقت المناسب لك من الأوقات المتاحة.
                </p>
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2.5">
                    <CalIcon className="h-3.5 w-3.5 text-primary" /> {t("date")}
                  </div>
                  {availableDates.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      لا توجد مواعيد متاحة خلال الأسبوعين القادمين — جرّب طبيبًا آخر.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      {availableDates.map((d) => (
                        <button
                          key={d.date}
                          onClick={() => {
                            setDate(d.date);
                            setTime("");
                          }}
                          className={`rounded-xl border p-2.5 text-xs text-center transition ${
                            date === d.date
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border hover:border-primary/50 hover:bg-muted/40"
                          }`}
                        >
                          <div
                            className={`text-[10px] ${date === d.date ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                          >
                            {WEEKDAYS_AR[d.weekday]}
                          </div>
                          <div className="font-bold text-sm mt-0.5">{d.label}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {date && (
                  <div className="mt-6">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2.5">
                      <Clock className="h-3.5 w-3.5 text-primary" /> {t("time")}
                    </div>
                    {availableTimes.length === 0 && (
                      <div className="text-sm text-muted-foreground">
                        لا توجد أوقات متاحة في هذا اليوم.
                      </div>
                    )}
                    {morningTimes.length > 0 && (
                      <TimeSection
                        icon={<Sun className="h-3.5 w-3.5" />}
                        label="صباحًا"
                        times={morningTimes}
                        selected={time}
                        onSelect={setTime}
                      />
                    )}
                    {eveningTimes.length > 0 && (
                      <div className="mt-4">
                        <TimeSection
                          icon={<Moon className="h-3.5 w-3.5" />}
                          label="مساءً"
                          times={eveningTimes}
                          selected={time}
                          onSelect={setTime}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" /> {t("patient_info")}
                </h2>
                <p className="text-xs text-muted-foreground mb-5">
                  نحتاج هذه البيانات لتأكيد الموعد والتواصل معك.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("name")} required error={errors.name}>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      onBlur={() => setErrors((p) => ({ ...p, name: undefined }))}
                      maxLength={NAME_MAX}
                      aria-invalid={!!errors.name}
                      placeholder="مثال: محمد أحمد"
                      className={INPUT_CLS}
                    />
                  </Field>
                  <Field label={t("phone")} required error={errors.phone}>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      onBlur={() => setErrors((p) => ({ ...p, phone: undefined }))}
                      inputMode="tel"
                      maxLength={PHONE_MAX}
                      aria-invalid={!!errors.phone}
                      placeholder="05xxxxxxxx"
                      dir="ltr"
                      className={`${INPUT_CLS} text-start`}
                    />
                  </Field>
                  <Field label={t("national_id")} error={errors.national_id}>
                    <input
                      value={form.national_id}
                      onChange={(e) => setForm({ ...form, national_id: e.target.value })}
                      maxLength={NID_MAX}
                      inputMode="numeric"
                      aria-invalid={!!errors.national_id}
                      placeholder="اختياري"
                      dir="ltr"
                      className={`${INPUT_CLS} text-start`}
                    />
                  </Field>
                  <Field label={t("gender")}>
                    <div className="grid grid-cols-2 gap-2">
                      {(["male", "female"] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setForm({ ...form, gender: g })}
                          className={`h-11 rounded-lg border text-sm font-medium transition ${
                            form.gender === g
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {t(g)}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field
                      label={t("reason")}
                      error={errors.reason}
                      hint={`${form.reason.length}/${REASON_MAX}`}
                    >
                      <textarea
                        value={form.reason}
                        onChange={(e) => setForm({ ...form, reason: e.target.value })}
                        rows={3}
                        maxLength={REASON_MAX}
                        aria-invalid={!!errors.reason}
                        placeholder="اذكر باختصار سبب الزيارة (اختياري)"
                        className={TEXTAREA_CLS}
                      />
                    </Field>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock className="h-4 w-4 text-primary" /> تذكيرات قبل الموعد
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    اختر متى تودّ استلام تذكير عبر الرسائل.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ReminderToggle
                      checked={form.reminder_24h}
                      onChange={(v) => setForm({ ...form, reminder_24h: v })}
                      label="قبل الموعد بـ 24 ساعة"
                    />
                    <ReminderToggle
                      checked={form.reminder_2h}
                      onChange={(v) => setForm({ ...form, reminder_2h: v })}
                      label="قبل الموعد بساعتين"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                disabled={step === 1}
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 h-10 text-sm font-medium hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ArrowRight className="h-4 w-4 rtl:hidden" />
                <ArrowLeft className="h-4 w-4 ltr:hidden" /> {t("back")}
              </button>

              {step < 4 ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canGoNext}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 h-10 text-sm font-semibold text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 shadow-sm transition"
                >
                  {t("next")} <ArrowLeft className="h-4 w-4 rtl:hidden" />
                  <ArrowRight className="h-4 w-4 ltr:hidden" />
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 h-10 text-sm font-semibold text-primary-foreground disabled:opacity-60 hover:bg-primary/90 shadow-sm transition"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? t("loading") : "تأكيد الحجز"}
                </button>
              )}
            </div>
          </div>

          {/* Summary sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" /> ملخّص الحجز
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <SummaryRow
                  icon={<Stethoscope className="h-3.5 w-3.5" />}
                  label="التخصص"
                  value={
                    selectedSpecialty
                      ? lang === "ar"
                        ? selectedSpecialty.name_ar
                        : selectedSpecialty.name_en
                      : null
                  }
                />
                <SummaryRow
                  icon={<UserCircle2 className="h-3.5 w-3.5" />}
                  label="الطبيب"
                  value={
                    selectedDoctor
                      ? lang === "ar"
                        ? selectedDoctor.name_ar
                        : selectedDoctor.name_en
                      : specialtyId
                        ? "أول متاح"
                        : null
                  }
                />
                <SummaryRow
                  icon={<CalIcon className="h-3.5 w-3.5" />}
                  label={t("date")}
                  value={date || null}
                />
                <SummaryRow
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label={t("time")}
                  value={time || null}
                />
              </dl>
              <div className="mt-5 rounded-lg bg-primary/5 border border-primary/15 p-3 text-[11px] leading-5 text-muted-foreground">
                الحجز مجاني ولا يتطلب دفعًا مسبقًا. يمكنك إلغاؤه أو تعديله في أي وقت من خلال
                رقم هاتفك.
              </div>
              <div className="mt-4 text-[11px] text-muted-foreground">
                هل تحتاج مساعدة؟{" "}
                <Link to="/contact" className="text-primary font-semibold hover:underline">
                  تواصل معنا
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function TimeSection({
  icon,
  label,
  times,
  selected,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  times: string[];
  selected: string;
  onSelect: (t: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {icon} {label}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {times.map((tm) => (
          <button
            key={tm}
            onClick={() => onSelect(tm)}
            className={`rounded-lg border py-2 text-sm font-medium transition ${
              selected === tm
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border hover:border-primary/50 hover:bg-muted/40"
            }`}
          >
            {tm}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReminderToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition ${
        checked ? "border-primary bg-primary/5 text-foreground" : "border-border hover:border-primary/40"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary"
      />
      {label}
    </label>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </dt>
      <dd
        className={`text-xs font-semibold text-end ${value ? "text-foreground" : "text-muted-foreground/60"}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl border border-border bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </span>
        {hint && !error && (
          <span className="text-[10px] text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
      {error && <p className="mt-1 text-[11px] text-destructive font-medium">{error}</p>}
    </label>
  );
}
