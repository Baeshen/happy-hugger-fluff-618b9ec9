import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { toast } from "sonner";
import { Check, CalendarPlus, Loader2, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { friendlyInsertError } from "@/lib/insert-errors";
import type { BranchSpecialty } from "@/lib/branches.functions";

const NAME_MIN = 2, NAME_MAX = 120;
const PHONE_MIN = 6, PHONE_MAX = 32;
const REASON_MAX = 500;
const PHONE_RE = /^[+0-9\s\-()]+$/;

const schema = z.object({
  name: z.string().trim().min(NAME_MIN, "الاسم قصير جدًا").max(NAME_MAX, "الاسم طويل جدًا"),
  phone: z.string().trim().min(PHONE_MIN, "رقم الهاتف قصير").max(PHONE_MAX, "رقم الهاتف طويل").regex(PHONE_RE, "رقم غير صالح"),
  gender: z.enum(["male", "female"]),
  reason: z.string().trim().max(REASON_MAX).optional().or(z.literal("")),
});

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

type Props = {
  branchId: string;
  branchNameAr: string;
  specialties: BranchSpecialty[];
  preselectedSpecialtyId?: string | null;
  preselectToken?: number;
};

export function BranchBookingForm({ branchId, branchNameAr, specialties, preselectedSpecialtyId, preselectToken }: Props) {
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [doctorId, setDoctorId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [form, setForm] = useState({ name: "", phone: "", gender: "male" as "male" | "female", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!preselectedSpecialtyId) return;
    if (!specialties.some((s) => s.id === preselectedSpecialtyId)) return;
    setRef(null);
    setSpecialtyId(preselectedSpecialtyId);
    setDoctorId("");
    setDate("");
    setTime("");
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [preselectedSpecialtyId, preselectToken, specialties]);

  const { data: doctors } = useQuery({
    queryKey: ["branch-doctors", branchId, specialtyId],
    enabled: !!specialtyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, name_ar, name_en, specialty_id")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .eq("specialty_id", specialtyId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: availability } = useQuery({
    queryKey: ["branch-availability", doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase.from("availability").select("*").eq("doctor_id", doctorId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const availableDates = useMemo(() => {
    if (!availability?.length) return [];
    const wds = new Set(availability.map((a) => a.weekday));
    const out: { date: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 21 && out.length < 14; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      if (wds.has(d.getDay())) {
        out.push({ date: d.toISOString().slice(0, 10), label: `${d.getDate()}/${d.getMonth() + 1}` });
      }
    }
    return out;
  }, [availability]);

  const availableTimes = useMemo(() => {
    if (!date || !availability) return [];
    const wd = new Date(date).getDay();
    const slots = new Set<string>();
    availability.filter((a) => a.weekday === wd).forEach((a) => {
      const [sh, sm] = a.start_time.split(":").map(Number);
      const [eh, em] = a.end_time.split(":").map(Number);
      let m = sh * 60 + sm; const end = eh * 60 + em;
      while (m + a.slot_minutes <= end) {
        slots.add(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
        m += a.slot_minutes;
      }
    });
    return Array.from(slots).sort();
  }, [date, availability]);

  const submit = async () => {
    if (!specialtyId) return toast.error("اختر التخصص");
    if (!doctorId) return toast.error("اختر الطبيب");
    if (!date || !time) return toast.error("اختر التاريخ والوقت");
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
    const v = parsed.data;
    setSubmitting(true);
    const id = randomId();
    const { error } = await supabase.from("appointments").insert({
      id,
      patient_name: v.name,
      patient_phone: v.phone,
      gender: v.gender,
      branch_id: branchId,
      specialty_id: specialtyId,
      doctor_id: doctorId,
      appointment_date: date,
      appointment_time: time,
      reason: v.reason || null,
      reminder_24h: true,
      reminder_2h: true,
    });
    setSubmitting(false);
    if (error) return toast.error(friendlyInsertError(error));
    setRef(id.slice(0, 8).toUpperCase());
  };

  if (ref) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-primary/15 text-primary grid place-items-center">
          <Check className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-bold">تم استلام حجزك في {branchNameAr}</h3>
        <p className="mt-1 text-sm text-muted-foreground">سنتواصل معك لتأكيد الموعد.</p>
        <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
          رقم الحجز: <span className="font-mono font-bold text-primary">{ref}</span>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/lookup" className="inline-flex items-center gap-1 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
            <Search className="h-4 w-4" /> تتبّع الحجز
          </Link>
          <button onClick={() => { setRef(null); setDate(""); setTime(""); setForm({ name: "", phone: "", gender: "male", reason: "" }); }}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
            حجز جديد
          </button>
        </div>
      </div>
    );
  }

  const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
        <CalendarPlus className="h-5 w-5 text-primary" /> احجز موعد في {branchNameAr}
      </h3>

      <div className="grid gap-4">
        {/* Specialty */}
        <div>
          <label className="block text-xs font-semibold mb-1">التخصص</label>
          {specialties.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد تخصصات متاحة في هذا الفرع حالياً.</p>
          ) : (
            <select className={inputCls} value={specialtyId} onChange={(e) => { setSpecialtyId(e.target.value); setDoctorId(""); setDate(""); setTime(""); }}>
              <option value="">— اختر تخصصاً —</option>
              {specialties.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
            </select>
          )}
        </div>

        {/* Doctor */}
        {specialtyId && (
          <div>
            <label className="block text-xs font-semibold mb-1">الطبيب</label>
            <select className={inputCls} value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setDate(""); setTime(""); }}>
              <option value="">— اختر طبيباً —</option>
              {(doctors ?? []).map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
            </select>
            {doctors && doctors.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">لا يوجد أطباء متاحون لهذا التخصص في الفرع.</p>
            )}
          </div>
        )}

        {/* Date */}
        {doctorId && (
          <div>
            <label className="block text-xs font-semibold mb-1">التاريخ</label>
            {availableDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مواعيد متاحة قريباً.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableDates.map((d) => (
                  <button key={d.date} type="button"
                    onClick={() => { setDate(d.date); setTime(""); }}
                    className={`rounded-md border px-3 py-1.5 text-sm ${date === d.date ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Time */}
        {date && (
          <div>
            <label className="block text-xs font-semibold mb-1">الوقت</label>
            {availableTimes.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أوقات متاحة في هذا اليوم.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTimes.map((tm) => (
                  <button key={tm} type="button" dir="ltr"
                    onClick={() => setTime(tm)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${time === tm ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
                    {tm}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Patient info */}
        {time && (
          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">الاسم الكامل</label>
              <input className={inputCls} value={form.name} maxLength={NAME_MAX}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">رقم الجوال</label>
              <input dir="ltr" className={inputCls} value={form.phone} maxLength={PHONE_MAX}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xxxxxxxx" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">الجنس</label>
              <select className={inputCls} value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as "male" | "female" })}>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">سبب الزيارة (اختياري)</label>
              <textarea className={inputCls} rows={2} maxLength={REASON_MAX} value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>

            <button type="button" disabled={submitting} onClick={submit}
              className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-95 disabled:opacity-60">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              تأكيد الحجز
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
