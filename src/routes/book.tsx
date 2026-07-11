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
 *
 * Wizard step components live in src/components/booking/*.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { submitBooking } from "@/lib/booking-submit";
import { Button } from "@/components/ui/button";

import { fallback } from "@tanstack/zod-adapter";
import {
  loadDraft, reducer, STORAGE_KEY, validatePatient, maxReachableStep, type AvailResp,
} from "@/components/booking/types";
import { Stepper } from "@/components/booking/Stepper";
import { StepService } from "@/components/booking/StepService";
import { StepBranch } from "@/components/booking/StepBranch";
import { StepSpecialty } from "@/components/booking/StepSpecialty";
import { StepDoctor } from "@/components/booking/StepDoctor";
import { StepDate } from "@/components/booking/StepDate";
import { StepTime } from "@/components/booking/StepTime";
import { StepPatient } from "@/components/booking/StepPatient";
import { StepReview } from "@/components/booking/StepReview";
import { StepSuccess } from "@/components/booking/StepSuccess";
import { SummarySidebar } from "@/components/booking/SummarySidebar";

const search = z.object({
  specialty: z.string().optional(),
  doctor: z.string().optional(),
  branch: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  step: fallback(z.number().int(), 0).default(0),
});

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
      date: searchParams.date ?? null,
      time: searchParams.time ?? null,
      // Prefer explicit ?step= (browser back/forward, refresh). Otherwise derive from deep-link.
      step: searchParams.step && searchParams.step >= 1 && searchParams.step <= 9
        ? searchParams.step
        : searchParams.doctor && searchParams.date && searchParams.time
        ? 8
        : searchParams.doctor && searchParams.date
        ? 6
        : searchParams.doctor
        ? 5
        : searchParams.specialty
        ? 4
        : 1,
    }),
  );

  // Persist draft to sessionStorage.
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  // Explicit step→URL sync helper: bumps state and pushes an entry so the
  // browser Back/Forward buttons walk the wizard naturally. Also called from
  // popstate below with `pushUrl=false` (browser already moved the URL).
  const goto = (step: number) => {
    dispatch({ t: "goto", step });
    if (step === 9) return; // success page: don't push
    if (typeof window === "undefined") return;
    navigate({
      to: "/book",
      search: (prev: Record<string, unknown>) => ({ ...prev, step }),
    });
  };




  // Deep-link fill-in: when the URL has no explicit step (schema default 0)
  // but state derived a step (e.g. 5 from ?doctor=&specialty=), REPLACE the
  // current entry so step appears in the URL without creating a duplicate.
  const didInitialFillRef = useRef(false);
  useEffect(() => {
    if (didInitialFillRef.current) return;
    didInitialFillRef.current = true;
    if (state.step !== 9 && searchParams.step === 0 && state.step >= 1) {
      navigate({
        to: "/book",
        search: (prev: Record<string, unknown>) => ({ ...prev, step: state.step }),
        replace: true,
      });
    }
  }, [state.step, searchParams.step, navigate]);

  // Restore state from URL on browser Back/Forward (popstate). URL is
  // authoritative here — dispatch without re-pushing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      if (window.location.pathname !== "/book") return;
      const params = new URLSearchParams(window.location.search);
      const s = parseInt(params.get("step") ?? "0", 10);
      if (s >= 1 && s <= 9) dispatch({ t: "goto", step: s });

    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);







  // Scroll to top of the wizard card whenever the step changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [state.step]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string | null; phone: string } | null>(null);

  const { data: branches = [] }    = useQuery({ queryKey: ["branches"], queryFn: fetchBranches, staleTime: 5 * 60_000 });
  const { data: specialties = [] } = useQuery({ queryKey: ["specialties-active"], queryFn: fetchSpecialties, staleTime: 5 * 60_000 });
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

  const patientValidation = useMemo(() => validatePatient(state.patient), [state.patient]);

  // Consistency guard: clamp state.step to the highest step whose
  // prerequisites are actually met. Runs on every state change so a
  // deep link (?step=8 with no doctor), a stale sessionStorage draft, or
  // a manual URL edit always renders a valid step and the URL is
  // rewritten to match. Step 9 (success) is preserved — it's set only
  // after a real submit and never inferred from the URL.
  useEffect(() => {
    if (state.step === 9) return;
    const max = maxReachableStep(state, patientValidation.ok);
    if (state.step > max) {
      dispatch({ t: "goto", step: max });
      if (typeof window !== "undefined") {
        navigate({
          to: "/book",
          search: (prev: Record<string, unknown>) => ({ ...prev, step: max }),
          replace: true,
        });
      }
    }
  }, [state, patientValidation.ok, navigate]);

  const canNext = useMemo(() => {
    switch (state.step) {
      case 1: return !!state.serviceType;
      case 2: return !!state.branchId;
      case 3: return !!state.specialtyId;
      case 4: return !!state.doctorId;
      case 5: return !!state.date;
      case 6: return !!state.time;
      case 7: return patientValidation.ok;
      default: return true;
    }
  }, [state, patientValidation]);

  async function handleSubmit() {
    setErrorMsg(null);
    if (!patientValidation.ok) {
      setErrorMsg(lang === "ar" ? "يرجى تصحيح بيانات المريض قبل التأكيد" : "Please fix patient info before confirming");
      goto(7);
      return;
    }
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
      goto(9);
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

  // Displayed step for the indicator/progress bar — never allowed to exceed
  // the highest step whose prerequisites are met. Prevents a transient flash
  // where the URL/state briefly asks for step N but doctor/specialty/branch
  // are missing. The clamp effect further up rewrites state + URL to match;
  // this memo keeps the visual indicator honest until it runs.
  const displayedStep = state.step === 9
    ? 9
    : Math.min(state.step, maxReachableStep(state, patientValidation.ok));

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

        <Stepper steps={STEPS} current={displayedStep} onJump={(i) => {
          if (state.step === 9) return;
          if (i + 1 < state.step) goto(i + 1);
        }}/>

        {state.step < 9 && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round(((displayedStep - 1) / 7) * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground text-center">
              {lang === "ar"
                ? `الخطوة ${displayedStep} من 8`
                : `Step ${displayedStep} of 8`}
            </div>
          </div>
        )}

        <div className={`mt-6 grid gap-6 ${state.step >= 2 && state.step <= 8 ? "md:grid-cols-[1fr,300px]" : ""}`}>
          <div className="rounded-2xl bg-card border border-border shadow-sm p-5 md:p-8 min-h-[420px]">
            {state.step === 1 && <StepService lang={lang} value={state.serviceType} onPick={(v) => { dispatch({ t: "set", p: { serviceType: v } }); goto(2); }}/>}
            {state.step === 2 && <StepBranch lang={lang} branches={branches} value={state.branchId} onPick={(v) => { dispatch({ t: "set", p: { branchId: v } }); goto(3); }}/>}
            {state.step === 3 && <StepSpecialty lang={lang} specialties={specialties} value={state.specialtyId} onPick={(v) => { dispatch({ t: "set", p: { specialtyId: v, doctorId: null } }); goto(4); }}/>}
            {state.step === 4 && <StepDoctor lang={lang} doctors={doctors} value={state.doctorId} onPick={(v) => { dispatch({ t: "set", p: { doctorId: v, date: null, time: null } }); goto(5); }}/>}
            {state.step === 5 && <StepDate lang={lang} value={state.date} onPick={(v) => { dispatch({ t: "set", p: { date: v, time: null } }); goto(6); }} doctorId={state.doctorId} specialtyId={state.specialtyId} branchId={state.branchId} onChangeDoctor={() => goto(4)} onChangeBranch={() => goto(2)}/>}
            {state.step === 6 && <StepTime lang={lang} value={state.time} avail={avail} onPick={(v) => { dispatch({ t: "set", p: { time: v } }); goto(7); }}/>}
            {state.step === 7 && <StepPatient lang={lang} value={state.patient} errors={patientValidation.errors} onChange={(p) => dispatch({ t: "setPatient", p })}/>}
            {state.step === 8 && <StepReview lang={lang} state={state} branches={branches} specialties={specialties} doctors={doctors} errorMsg={errorMsg} submitting={submitting} onSubmit={handleSubmit} patientValid={patientValidation.ok} onEditPatient={() => goto(7)}/>}
            {state.step === 9 && result && <StepSuccess lang={lang} state={state} branches={branches} specialties={specialties} doctors={doctors} reference={result.reference} phone={result.phone} onNewBooking={handleReset}/>}
          </div>

          {state.step >= 2 && state.step <= 8 && (
            <SummarySidebar
              lang={lang}
              state={state}
              branches={branches}
              specialties={specialties}
              doctors={doctors}
              onEdit={(step: number) => goto(step)}
            />
          )}
        </div>

        {state.step < 9 && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              disabled={state.step === 1}
              onClick={() => goto(state.step - 1)}
              className="gap-1"
            >
              {lang === "ar" ? <><ChevronRight className="h-4 w-4"/>السابق</> : <><ChevronLeft className="h-4 w-4"/>Back</>}
            </Button>

            {state.step < 8 && (
              <Button
                disabled={!canNext}
                onClick={() => goto(state.step + 1)}
                className="gap-1"
              >
                {lang === "ar" ? <>التالي<ChevronLeft className="h-4 w-4"/></> : <>Next<ChevronRight className="h-4 w-4"/></>}
              </Button>
            )}
          </div>
        )}

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
