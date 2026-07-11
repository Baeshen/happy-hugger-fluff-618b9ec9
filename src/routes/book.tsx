/**
 * صفحة الحجز — Multi-step booking wizard (UDH-style)
 *   1. Service type      2. Branch       3. Specialty
 *   4. Doctor            5. Date         6. Time
 *   7. Patient info      8. Review       → submits then navigates to /booking-confirmation
 *
 * Uses existing public APIs:
 *   - list_public_branches / specialties / list_public_doctors  (Supabase RPC)
 *   - GET  /api/public/book/availability
 *   - POST /api/public/book/create  (via submitBooking helper)
 *
 * State is stored in sessionStorage under `booking:draft` so the user can
 * refresh mid-flow without losing progress. Deep links accept ?doctor= and
 * ?specialty= to jump straight to the doctor step from /doctors and
 * /specialties pages.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useReducer, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Building2, Calendar as CalIcon, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock, Loader2, MapPin, Star, Stethoscope,
  User, UserCircle2, ClipboardList, TestTube, Scan, Activity,
} from "lucide-react";
import { submitBooking } from "@/lib/booking-submit";
import { SubmitErrorBanner } from "@/components/SubmitErrorBanner";
import { Button } from "@/components/ui/button";

const search = z.object({
  specialty: z.string().optional(),
  doctor: z.string().optional(),
  branch: z.string().optional(),
});

const NAME_MIN = 2, NAME_MAX = 120;
const PHONE_MIN = 6, PHONE_MAX = 32;
const NID_MAX = 20;
const REASON_MAX = 500;
const PHONE_RE = /^[+0-9\s\-()]+$/;

export const Route = createFileRoute("/book")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "احجز موعدًا | مجمع باعشن الطبي" },
      { name: "description", content: "احجز موعدك مع أطبائنا خطوة بخطوة: اختر الفرع، التخصص، الطبيب، ثم الموعد المناسب." },
      { property: "og:title", content: "احجز موعدًا — مجمع باعشن الطبي" },
      { property: "og:description", content: "نظام حجز سريع وسهل عبر خطوات واضحة." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: BookPage,
});

/* ================================================================
   State
   ================================================================ */

type ServiceType = "clinic" | "radiology" | "lab" | "followup";
type Gender = "male" | "female";

type State = {
  step: number; // 1..8
  serviceType: ServiceType | null;
  branchId: string | null;
  specialtyId: string | null;
  doctorId: string | null;
  date: string | null;      // YYYY-MM-DD
  time: string | null;      // HH:MM
  patient: {
    name: string;
    phone: string;
    nationalId: string;
    gender: Gender | null;
    reason: string;
    reminder24h: boolean;
    reminder2h: boolean;
  };
};

const INITIAL: State = {
  step: 1,
  serviceType: null,
  branchId: null,
  specialtyId: null,
  doctorId: null,
  date: null,
  time: null,
  patient: {
    name: "",
    phone: "",
    nationalId: "",
    gender: null,
    reason: "",
    reminder24h: true,
    reminder2h: true,
  },
};

type Action =
  | { t: "set"; p: Partial<State> }
  | { t: "setPatient"; p: Partial<State["patient"]> }
  | { t: "goto"; step: number }
  | { t: "reset" };

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "set":         return { ...s, ...a.p };
    case "setPatient":  return { ...s, patient: { ...s.patient, ...a.p } };
    case "goto":        return { ...s, step: Math.max(1, Math.min(9, a.step)) };
    case "reset":       return { ...INITIAL };
  }
}

const STORAGE_KEY = "booking:draft";

function loadDraft(initial: Partial<State>): State {
  if (typeof window === "undefined") return { ...INITIAL, ...initial };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      return { ...INITIAL, ...parsed, ...initial };
    }
  } catch {/* ignore */}
  return { ...INITIAL, ...initial };
}

/* ================================================================
   Data fetching helpers
   ================================================================ */

async function fetchBranches() {
  const { data } = await supabase.rpc("list_public_branches");
  return data ?? [];
}
async function fetchSpecialties() {
  const { data } = await supabase
    .from("specialties")
    .select("id,slug,name_ar,name_en,icon")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}
async function fetchDoctors(specialtyId: string | null, branchId: string | null) {
  const { data, error } = await supabase.rpc("list_public_doctors", {
    _limit: 200, _offset: 0, _branch_id: branchId ?? undefined,
  });
  if (error) return [];
  const list = (data ?? []) as any[];
  return specialtyId ? list.filter((d) => d.specialty_id === specialtyId) : list;
}

type AvailResp = { ok: boolean; times: string[]; booked: string[] };
async function fetchAvailability(date: string, doctorId: string | null, specialtyId: string | null, branchId: string | null): Promise<AvailResp> {
  const p = new URLSearchParams({ date });
  if (doctorId) p.set("doctor_id", doctorId);
  else if (specialtyId) p.set("specialty_id", specialtyId);
  if (branchId) p.set("branch_id", branchId);
  const res = await fetch(`/api/public/book/availability?${p.toString()}`);
  if (!res.ok) return { ok: false, times: [], booked: [] };
  return (await res.json()) as AvailResp;
}

/* ================================================================
   Page
   ================================================================ */

function BookPage() {
  const searchParams = Route.useSearch();
  const { lang } = useI18n();
  const navigate = useNavigate();

  const [state, dispatch] = useReducer(reducer, undefined, () =>
    loadDraft({
      doctorId: searchParams.doctor ?? null,
      specialtyId: searchParams.specialty ?? null,
      branchId: searchParams.branch ?? null,
      // Jump ahead if a deep link is provided.
      step: searchParams.doctor ? 5 : searchParams.specialty ? 4 : 1,
    }),
  );

  // Persist draft to sessionStorage.
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string | null; phone: string } | null>(null);

  const { data: branches = [] }    = useQuery({ queryKey: ["branches"], queryFn: fetchBranches, staleTime: 5*60_000 });
  const { data: specialties = [] } = useQuery({ queryKey: ["specialties-active"], queryFn: fetchSpecialties, staleTime: 5*60_000 });
  const { data: doctors = [] } = useQuery({
    queryKey: ["doctors-for-book", state.specialtyId, state.branchId],
    queryFn: () => fetchDoctors(state.specialtyId, state.branchId),
    enabled: state.step >= 4,
    staleTime: 60_000,
  });

  // If the user picked a doctor via deep link, auto-fill branch & specialty
  useEffect(() => {
    if (state.doctorId && !state.specialtyId && doctors.length) {
      const d = doctors.find((x: any) => x.id === state.doctorId);
      if (d) dispatch({ t: "set", p: { specialtyId: d.specialty_id, branchId: d.branch_id ?? state.branchId } });
    }
  }, [state.doctorId, state.specialtyId, doctors]);

  const { data: avail } = useQuery({
    queryKey: ["avail", state.date, state.doctorId, state.specialtyId, state.branchId],
    queryFn: () => fetchAvailability(state.date!, state.doctorId, state.specialtyId, state.branchId),
    enabled: !!state.date && state.step >= 6,
    staleTime: 20_000,
  });

  const canNext = useMemo(() => {
    switch (state.step) {
      case 1: return !!state.serviceType;
      case 2: return !!state.branchId;
      case 3: return !!state.specialtyId;
      case 4: return !!state.doctorId;
      case 5: return !!state.date;
      case 6: return !!state.time;
      case 7: {
        const p = state.patient;
        return (
          p.name.trim().length >= NAME_MIN &&
          p.phone.trim().length >= PHONE_MIN &&
          PHONE_RE.test(p.phone.trim()) &&
          !!p.gender
        );
      }
      default: return true;
    }
  }, [state]);

  async function handleSubmit() {
    setErrorMsg(null);
    setSubmitting(true);
    const p = state.patient;
    const res = await submitBooking({
      patient_name: p.name.trim(),
      patient_phone: p.phone.trim(),
      appointment_date: state.date!,
      appointment_time: state.time!,
      reason: p.reason.trim() || undefined,
      national_id: p.nationalId.trim() || null,
      gender: p.gender ?? undefined,
      specialty_id: state.specialtyId,
      doctor_id: state.doctorId,
      reminder_24h: p.reminder24h,
      reminder_2h: p.reminder2h,
    });
    setSubmitting(false);
    if (res.ok) {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      toast.success(lang === "ar" ? "تم إنشاء الحجز بنجاح" : "Booking created");
      setResult({ reference: res.reference, phone: p.phone.trim() });
      dispatch({ t: "goto", step: 9 });
    } else {
      setErrorMsg(res.message);
    }
  }

  function handleReset() {
    setResult(null);
    setErrorMsg(null);
    dispatch({ t: "reset" });
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    navigate({ to: "/book", search: {} });
  }

  const STEPS = lang === "ar"
    ? ["نوع الخدمة", "الفرع", "التخصص", "الطبيب", "التاريخ", "الوقت", "بياناتك", "المراجعة", "التأكيد"]
    : ["Service", "Branch", "Specialty", "Doctor", "Date", "Time", "Your info", "Review", "Confirmed"];

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container-app py-8 md:py-12 max-w-5xl">
        <header className="mb-6 md:mb-8 text-center">
          <h1 className="text-2xl md:text-4xl font-bold">
            {lang === "ar" ? "احجز موعدك" : "Book an appointment"}
          </h1>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            {lang === "ar"
              ? "اتبع الخطوات لإتمام حجز موعدك — يمكنك الرجوع في أي وقت."
              : "Follow the steps to complete your booking — you can go back anytime."}
          </p>
        </header>

        <Stepper steps={STEPS} current={state.step} onJump={(i) => {
          // Allow jumping back only.
          if (i + 1 < state.step) dispatch({ t: "goto", step: i + 1 });
        }}/>

        <div className="mt-6 rounded-2xl bg-card border border-border shadow-sm p-5 md:p-8 min-h-[420px]">
          {state.step === 1 && <StepService lang={lang} value={state.serviceType} onPick={(v) => { dispatch({ t: "set", p: { serviceType: v } }); dispatch({ t: "goto", step: 2 }); }}/>}
          {state.step === 2 && <StepBranch lang={lang} branches={branches} value={state.branchId} onPick={(v) => { dispatch({ t: "set", p: { branchId: v } }); dispatch({ t: "goto", step: 3 }); }}/>}
          {state.step === 3 && <StepSpecialty lang={lang} specialties={specialties} value={state.specialtyId} onPick={(v) => { dispatch({ t: "set", p: { specialtyId: v, doctorId: null } }); dispatch({ t: "goto", step: 4 }); }}/>}
          {state.step === 4 && <StepDoctor lang={lang} doctors={doctors} value={state.doctorId} onPick={(v) => { dispatch({ t: "set", p: { doctorId: v, date: null, time: null } }); dispatch({ t: "goto", step: 5 }); }}/>}
          {state.step === 5 && <StepDate lang={lang} value={state.date} onPick={(v) => { dispatch({ t: "set", p: { date: v, time: null } }); dispatch({ t: "goto", step: 6 }); }} doctorId={state.doctorId} specialtyId={state.specialtyId} branchId={state.branchId}/>}
          {state.step === 6 && <StepTime lang={lang} value={state.time} avail={avail} onPick={(v) => { dispatch({ t: "set", p: { time: v } }); dispatch({ t: "goto", step: 7 }); }}/>}
          {state.step === 7 && <StepPatient lang={lang} value={state.patient} onChange={(p) => dispatch({ t: "setPatient", p })}/>}
          {state.step === 8 && <StepReview lang={lang} state={state} branches={branches} specialties={specialties} doctors={doctors} errorMsg={errorMsg} submitting={submitting} onSubmit={handleSubmit}/>}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            disabled={state.step === 1}
            onClick={() => dispatch({ t: "goto", step: state.step - 1 })}
            className="gap-1"
          >
            {lang === "ar" ? <><ChevronRight className="h-4 w-4"/>السابق</> : <><ChevronLeft className="h-4 w-4"/>Back</>}
          </Button>

          {state.step < 8 && (
            <Button
              disabled={!canNext}
              onClick={() => dispatch({ t: "goto", step: state.step + 1 })}
              className="gap-1"
            >
              {lang === "ar" ? <>التالي<ChevronLeft className="h-4 w-4"/></> : <>Next<ChevronRight className="h-4 w-4"/></>}
            </Button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {lang === "ar" ? "لديك حجز مسبق؟" : "Already booked?"}{" "}
          <Link to="/track" className="text-primary hover:underline">
            {lang === "ar" ? "تتبع حجزك" : "Track your booking"}
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ================================================================
   Stepper
   ================================================================ */

function Stepper({ steps, current, onJump }: { steps: string[]; current: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <li key={i} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={n >= current}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active ? "bg-primary text-primary-foreground shadow"
                : done ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                : "bg-muted text-muted-foreground"
              }`}
            >
              <span className={`h-5 w-5 rounded-full grid place-items-center text-[10px] ${
                active ? "bg-primary-foreground text-primary" : done ? "bg-primary text-primary-foreground" : "bg-background"
              }`}>
                {done ? <Check className="h-3 w-3"/> : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < steps.length - 1 && <span className="text-muted-foreground/50">·</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ================================================================
   Step components
   ================================================================ */

function StepService({ lang, value, onPick }: { lang: "ar"|"en"; value: ServiceType | null; onPick: (v: ServiceType) => void }) {
  const items: { id: ServiceType; ar: string; en: string; icon: any; desc_ar: string; desc_en: string; disabled?: boolean }[] = [
    { id: "clinic",    ar: "عيادات تخصصية", en: "Specialty Clinics", icon: Stethoscope, desc_ar: "احجز مع طبيب متخصص", desc_en: "Book with a specialist" },
    { id: "followup",  ar: "متابعة",         en: "Follow-up",        icon: Activity,    desc_ar: "متابعة مع نفس الطبيب", desc_en: "Follow-up visit" },
    { id: "radiology", ar: "الأشعة",         en: "Radiology",        icon: Scan,        desc_ar: "قريبًا",              desc_en: "Coming soon", disabled: true },
    { id: "lab",       ar: "المختبر",        en: "Laboratory",       icon: TestTube,    desc_ar: "قريبًا",              desc_en: "Coming soon", disabled: true },
  ];
  return (
    <StepShell lang={lang} title={lang === "ar" ? "اختر نوع الخدمة" : "Choose service type"}>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it) => {
          const active = value === it.id;
          return (
            <button
              key={it.id}
              onClick={() => !it.disabled && onPick(it.id)}
              disabled={it.disabled}
              className={`text-start rounded-xl border-2 p-4 transition ${
                active ? "border-primary bg-primary/5"
                : it.disabled ? "border-border bg-muted/50 opacity-60 cursor-not-allowed"
                : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-lg grid place-items-center ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                  <it.icon className="h-5 w-5"/>
                </div>
                <div>
                  <div className="font-semibold">{lang === "ar" ? it.ar : it.en}</div>
                  <div className="text-xs text-muted-foreground">{lang === "ar" ? it.desc_ar : it.desc_en}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function StepBranch({ lang, branches, value, onPick }: { lang: "ar"|"en"; branches: any[]; value: string | null; onPick: (v: string) => void }) {
  return (
    <StepShell lang={lang} title={lang === "ar" ? "اختر الفرع" : "Choose branch"}>
      <div className="grid gap-3 sm:grid-cols-2">
        {branches.map((b) => {
          const active = value === b.id;
          return (
            <button
              key={b.id}
              onClick={() => onPick(b.id)}
              className={`text-start rounded-xl border-2 p-4 transition ${
                active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-lg grid place-items-center ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                  <Building2 className="h-5 w-5"/>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{lang === "ar" ? b.name_ar : b.name_en}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3"/>
                    {lang === "ar" ? b.city_ar : b.city_en}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function StepSpecialty({ lang, specialties, value, onPick }: { lang: "ar"|"en"; specialties: any[]; value: string | null; onPick: (v: string) => void }) {
  return (
    <StepShell lang={lang} title={lang === "ar" ? "اختر التخصص" : "Choose specialty"}>
      <div className="grid gap-3 sm:grid-cols-3">
        {specialties.map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className={`rounded-xl border-2 p-4 text-center transition ${
                active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
              }`}
            >
              <div className={`h-12 w-12 mx-auto rounded-full grid place-items-center mb-2 ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                <Stethoscope className="h-5 w-5"/>
              </div>
              <div className="text-sm font-semibold">{lang === "ar" ? s.name_ar : s.name_en}</div>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function StepDoctor({ lang, doctors, value, onPick }: { lang: "ar"|"en"; doctors: any[]; value: string | null; onPick: (v: string) => void }) {
  return (
    <StepShell lang={lang} title={lang === "ar" ? "اختر الطبيب" : "Choose doctor"}>
      {doctors.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {lang === "ar" ? "لا يوجد أطباء متاحون بهذا التخصص/الفرع." : "No doctors available for this specialty/branch."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {doctors.map((d) => {
            const active = value === d.id;
            const name = lang === "ar" ? d.name_ar : d.name_en;
            return (
              <button
                key={d.id}
                onClick={() => onPick(d.id)}
                disabled={!d.booking_enabled}
                className={`text-start rounded-xl border-2 p-4 transition ${
                  active ? "border-primary bg-primary/5"
                  : !d.booking_enabled ? "border-border bg-muted/50 opacity-60 cursor-not-allowed"
                  : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center font-bold overflow-hidden">
                    {d.photo_url ? <img src={d.photo_url} alt={name} className="h-full w-full object-cover"/> : name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {lang === "ar" ? d.specialty_name_ar : d.specialty_name_en}
                    </div>
                    {d.ratings_count > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400"/>
                        <span>{Number(d.avg_rating).toFixed(1)}</span>
                        <span className="text-muted-foreground">({d.ratings_count})</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </StepShell>
  );
}

/* ------------ Calendar / Date step ------------ */

function StepDate({
  lang, value, onPick, doctorId, specialtyId, branchId,
}: {
  lang: "ar"|"en"; value: string | null; onPick: (v: string) => void;
  doctorId: string | null; specialtyId: string | null; branchId: string | null;
}) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [monthStart, setMonthStart] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const firstWeekday = monthStart.getDay(); // 0..6, Sun..Sat
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), d));

  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const monthLabel = monthStart.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { month: "long", year: "numeric" });
  const weekdayNames = lang === "ar"
    ? ["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"]
    : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 60);

  return (
    <StepShell lang={lang} title={lang === "ar" ? "اختر التاريخ" : "Choose date"}>
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm"
            onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
            disabled={monthStart <= new Date(today.getFullYear(), today.getMonth(), 1)}
          ><ChevronRight className="h-4 w-4"/></Button>
          <div className="font-semibold">{monthLabel}</div>
          <Button variant="outline" size="sm"
            onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
          ><ChevronLeft className="h-4 w-4"/></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
          {weekdayNames.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i}/>;
            const isPast = d < today;
            const isTooFar = d > maxDate;
            const disabled = isPast || isTooFar;
            const s = iso(d);
            const active = value === s;
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => onPick(s)}
                className={`aspect-square rounded-lg text-sm font-medium transition ${
                  active ? "bg-primary text-primary-foreground shadow"
                  : disabled ? "text-muted-foreground/40 cursor-not-allowed"
                  : "bg-muted hover:bg-primary/10 hover:text-primary"
                }`}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {lang === "ar" ? "تُعرض الأوقات المتاحة في الخطوة التالية" : "Available times shown in next step"}
        </p>
      </div>
    </StepShell>
  );
}

/* ------------ Time slots ------------ */

function StepTime({ lang, value, avail, onPick }: { lang: "ar"|"en"; value: string | null; avail: AvailResp | undefined; onPick: (v: string) => void }) {
  const times = avail?.times ?? [];
  const booked = new Set(avail?.booked ?? []);
  const groups = useMemo(() => {
    const morning: string[] = [], afternoon: string[] = [], evening: string[] = [];
    for (const t of times) {
      const h = parseInt(t.slice(0,2), 10);
      if (h < 12) morning.push(t);
      else if (h < 17) afternoon.push(t);
      else evening.push(t);
    }
    return { morning, afternoon, evening };
  }, [times]);

  if (!avail) return (
    <StepShell lang={lang} title={lang === "ar" ? "اختر الوقت" : "Choose time"}>
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2"/>
        {lang === "ar" ? "جارٍ تحميل المواعيد…" : "Loading slots…"}
      </div>
    </StepShell>
  );

  if (times.length === 0 && booked.size === 0) return (
    <StepShell lang={lang} title={lang === "ar" ? "اختر الوقت" : "Choose time"}>
      <p className="text-center text-muted-foreground py-10">
        {lang === "ar" ? "لا توجد مواعيد متاحة في هذا اليوم — اختر تاريخًا آخر." : "No slots for this date — pick another day."}
      </p>
    </StepShell>
  );

  const renderGroup = (label_ar: string, label_en: string, items: string[]) => items.length > 0 && (
    <div>
      <h4 className="font-semibold text-sm mb-2 text-muted-foreground">{lang === "ar" ? label_ar : label_en}</h4>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {items.map((t) => {
          const active = value === t;
          const isBooked = booked.has(t);
          return (
            <button
              key={t}
              disabled={isBooked}
              onClick={() => onPick(t)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? "bg-primary text-primary-foreground shadow"
                : isBooked ? "bg-muted text-muted-foreground line-through cursor-not-allowed"
                : "bg-muted hover:bg-primary/10 hover:text-primary"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <StepShell lang={lang} title={lang === "ar" ? "اختر الوقت" : "Choose time"}>
      <div className="space-y-5">
        {renderGroup("صباحًا", "Morning", groups.morning)}
        {renderGroup("عصرًا", "Afternoon", groups.afternoon)}
        {renderGroup("مساءً", "Evening", groups.evening)}
      </div>
    </StepShell>
  );
}

/* ------------ Patient info ------------ */

function StepPatient({ lang, value, onChange }: { lang: "ar"|"en"; value: State["patient"]; onChange: (p: Partial<State["patient"]>) => void }) {
  return (
    <StepShell lang={lang} title={lang === "ar" ? "بياناتك" : "Your details"}>
      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto">
        <Field label={lang === "ar" ? "الاسم الرباعي" : "Full name"} required>
          <input
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value.slice(0, NAME_MAX) })}
            className="input"
            placeholder={lang === "ar" ? "الاسم كما في الهوية" : "Full name"}
          />
        </Field>
        <Field label={lang === "ar" ? "رقم الجوال" : "Mobile"} required>
          <input
            value={value.phone}
            onChange={(e) => onChange({ phone: e.target.value.slice(0, PHONE_MAX) })}
            className="input"
            placeholder="05XXXXXXXX"
            dir="ltr"
            inputMode="tel"
          />
        </Field>
        <Field label={lang === "ar" ? "رقم الهوية / الإقامة" : "National ID"}>
          <input
            value={value.nationalId}
            onChange={(e) => onChange({ nationalId: e.target.value.slice(0, NID_MAX) })}
            className="input"
            dir="ltr"
            inputMode="numeric"
          />
        </Field>
        <Field label={lang === "ar" ? "الجنس" : "Gender"} required>
          <div className="grid grid-cols-2 gap-2">
            {(["male","female"] as const).map((g) => (
              <button key={g} type="button"
                onClick={() => onChange({ gender: g })}
                className={`rounded-lg border-2 py-2 text-sm font-medium transition ${
                  value.gender === g ? "border-primary bg-primary/5 text-primary" : "border-border bg-card hover:border-primary/50"
                }`}
              >
                {g === "male" ? (lang === "ar" ? "ذكر" : "Male") : (lang === "ar" ? "أنثى" : "Female")}
              </button>
            ))}
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Field label={lang === "ar" ? "سبب الزيارة (اختياري)" : "Reason (optional)"}>
            <textarea
              value={value.reason}
              onChange={(e) => onChange({ reason: e.target.value.slice(0, REASON_MAX) })}
              className="input min-h-[80px]"
              placeholder={lang === "ar" ? "وصف مختصر…" : "Short description…"}
            />
          </Field>
        </div>
        <div className="sm:col-span-2 rounded-xl bg-muted/50 p-4 space-y-2">
          <div className="font-semibold text-sm">{lang === "ar" ? "التذكيرات" : "Reminders"}</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.reminder24h} onChange={(e) => onChange({ reminder24h: e.target.checked })} className="accent-primary"/>
            {lang === "ar" ? "قبل 24 ساعة" : "24 hours before"}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.reminder2h} onChange={(e) => onChange({ reminder2h: e.target.checked })} className="accent-primary"/>
            {lang === "ar" ? "قبل ساعتين" : "2 hours before"}
          </label>
        </div>
      </div>
      <style>{`.input{width:100%;border:1px solid hsl(var(--border));background:hsl(var(--background));border-radius:.5rem;padding:.55rem .75rem;font-size:.875rem}.input:focus{outline:none;box-shadow:0 0 0 2px hsl(var(--primary)/.4)}`}</style>
    </StepShell>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold mb-1.5">{label}{required && <span className="text-destructive">*</span>}</div>
      {children}
    </label>
  );
}

/* ------------ Review + submit ------------ */

function StepReview({
  lang, state, branches, specialties, doctors, errorMsg, submitting, onSubmit,
}: {
  lang: "ar"|"en"; state: State; branches: any[]; specialties: any[]; doctors: any[];
  errorMsg: string | null; submitting: boolean; onSubmit: () => void;
}) {
  const branch = branches.find((b) => b.id === state.branchId);
  const spec   = specialties.find((s) => s.id === state.specialtyId);
  const doc    = doctors.find((d: any) => d.id === state.doctorId);
  const rows = [
    { label: lang === "ar" ? "الفرع" : "Branch", value: branch ? (lang === "ar" ? branch.name_ar : branch.name_en) : "—" },
    { label: lang === "ar" ? "التخصص" : "Specialty", value: spec ? (lang === "ar" ? spec.name_ar : spec.name_en) : "—" },
    { label: lang === "ar" ? "الطبيب" : "Doctor", value: doc ? (lang === "ar" ? doc.name_ar : doc.name_en) : "—" },
    { label: lang === "ar" ? "التاريخ" : "Date", value: state.date ?? "—" },
    { label: lang === "ar" ? "الوقت" : "Time", value: state.time ?? "—" },
    { label: lang === "ar" ? "الاسم" : "Name", value: state.patient.name },
    { label: lang === "ar" ? "الجوال" : "Phone", value: state.patient.phone },
  ];
  return (
    <StepShell lang={lang} title={lang === "ar" ? "مراجعة الحجز" : "Review your booking"}>
      <div className="max-w-xl mx-auto">
        <dl className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-3 p-3 text-sm">
              <dt className="text-muted-foreground col-span-1">{r.label}</dt>
              <dd className="col-span-2 font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>

        {errorMsg && <div className="mt-4"><SubmitErrorBanner kind="unknown" message={errorMsg}/></div>}

        <Button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full mt-6 gap-2 h-12 text-base"
        >
          {submitting
            ? <><Loader2 className="h-4 w-4 animate-spin"/> {lang === "ar" ? "جارٍ الحجز…" : "Booking…"}</>
            : <><CheckCircle2 className="h-5 w-5"/> {lang === "ar" ? "تأكيد الحجز" : "Confirm booking"}</>}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {lang === "ar"
            ? "بالضغط على التأكيد، فأنت توافق على شروط الاستخدام."
            : "By confirming, you agree to our terms of use."}
        </p>
      </div>
    </StepShell>
  );
}

/* ------------ Shared shell ------------ */

function StepShell({ lang, title, children }: { lang: "ar"|"en"; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold mb-5 text-center">{title}</h2>
      {children}
    </div>
  );
}
