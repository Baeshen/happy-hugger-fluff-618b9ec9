import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Calendar as CalIcon, CheckCircle2, ClipboardList, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { formatArDate, type State } from "./types";

export function StepSuccess({
  lang, state, branches, specialties, doctors, reference, phone, onNewBooking,
}: {
  lang: "ar" | "en"; state: State; branches: any[]; specialties: any[]; doctors: any[];
  reference: string | null; phone: string; onNewBooking: () => void;
}) {
  const branch = branches.find((b) => b.id === state.branchId);
  const spec   = specialties.find((s) => s.id === state.specialtyId);
  const doc    = doctors.find((d: any) => d.id === state.doctorId);
  const timeReadable = useMemo(() => {
    if (!state.time) return "—";
    const m = /^(\d{1,2}):(\d{2})/.exec(state.time);
    if (!m) return state.time;
    const h = Number(m[1]);
    const min = m[2];
    const h12 = ((h + 11) % 12) + 1;
    const suffix = lang === "ar" ? (h < 12 ? "صباحًا" : "مساءً") : (h < 12 ? "AM" : "PM");
    return `${h12}:${min} ${suffix} (${String(h).padStart(2, "0")}:${min})`;
  }, [state.time, lang]);

  const rows = [
    { label: lang === "ar" ? "الفرع" : "Branch", value: branch ? (lang === "ar" ? branch.name_ar : branch.name_en) : "—" },
    { label: lang === "ar" ? "التخصص" : "Specialty", value: spec ? (lang === "ar" ? spec.name_ar : spec.name_en) : "—" },
    { label: lang === "ar" ? "الطبيب" : "Doctor", value: doc ? (lang === "ar" ? doc.name_ar : doc.name_en) : "—" },
    { label: lang === "ar" ? "التاريخ" : "Date", value: formatArDate(state.date, lang) },
    { label: lang === "ar" ? "الوقت" : "Time", value: timeReadable },
    { label: lang === "ar" ? "الاسم" : "Name", value: state.patient.name },
    { label: lang === "ar" ? "الجوال" : "Phone", value: phone },
  ];

  async function copyRef() {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      toast.success(lang === "ar" ? "تم نسخ رقم الحجز" : "Reference copied");
    } catch {
      toast.error(lang === "ar" ? "تعذّر النسخ" : "Copy failed");
    }
  }

  const detailsText = useMemo(() => {
    const SEP = "────────────────────────────";
    const header = lang === "ar"
      ? "🏥 تأكيد حجز — مجمع باعشن الطبي"
      : "🏥 Booking confirmation — Baeshen Medical Complex";
    const footer = lang === "ar"
      ? "احتفظ برقم الحجز لأي استفسار."
      : "Keep the reference for any inquiry.";
    const stamp = new Date().toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const labelWidth = Math.max(...rows.map((r) => r.label.length));
    const pad = (s: string) => s + " ".repeat(Math.max(0, labelWidth - s.length));

    const lines: string[] = [];
    lines.push(header);
    lines.push(SEP);
    if (reference) {
      lines.push(`${lang === "ar" ? "رقم الحجز" : "Reference"}: ${reference}`);
      lines.push(SEP);
    }
    for (const r of rows) lines.push(`${pad(r.label)} : ${r.value}`);
    lines.push(SEP);
    lines.push(`${lang === "ar" ? "تاريخ النسخ" : "Copied at"}: ${stamp}`);
    lines.push(footer);
    return lines.join("\n");
  }, [rows, reference, lang]);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(detailsText);
      toast.success(lang === "ar" ? "تم نسخ تفاصيل الحجز" : "Booking details copied");
    } catch {
      toast.error(lang === "ar" ? "تعذّر النسخ" : "Copy failed");
    }
  }

  async function copyRow(value: string) {
    if (!value || value === "—") return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(lang === "ar" ? "تم النسخ" : "Copied");
    } catch {
      toast.error(lang === "ar" ? "تعذّر النسخ" : "Copy failed");
    }
  }

  const phone4 = (phone.match(/\d/g) ?? []).slice(-4).join("");

  const waMessage = useMemo(() => {
    const header = lang === "ar"
      ? "مرحبًا، لدي حجز في مجمع باعشن الطبي وأحتاج للمساعدة:"
      : "Hello, I have a booking at Baeshen Medical Complex and need assistance:";
    const parts: string[] = [header, ""];
    if (reference) {
      parts.push(`${lang === "ar" ? "رقم الحجز" : "Reference"}: ${reference}`);
    }
    for (const r of rows) parts.push(`${r.label}: ${r.value}`);
    return parts.join("\n");
  }, [rows, reference, lang]);
  const waHref = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(waMessage)}`;

  return (
    <div className="max-w-xl mx-auto text-center">
      <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 grid place-items-center mb-4">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400"/>
      </div>
      <h2 className="text-2xl md:text-3xl font-bold">
        {lang === "ar" ? "تم تأكيد حجزك" : "Your booking is confirmed"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {lang === "ar"
          ? "سنتواصل معك لتأكيد الموعد. احتفظ برقم الحجز لأي استفسار."
          : "We'll contact you to confirm. Keep your reference for any inquiry."}
      </p>

      {reference && (
        <div className="mt-6 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-4">
          <div className="text-xs text-muted-foreground mb-1">
            {lang === "ar" ? "رقم الحجز" : "Booking reference"}
          </div>
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl md:text-3xl font-mono font-bold tracking-wider text-primary">
              {reference}
            </span>
            <Button variant="outline" size="sm" onClick={copyRef} className="gap-1">
              <ClipboardList className="h-4 w-4"/>
              {lang === "ar" ? "نسخ" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          {lang === "ar" ? "تفاصيل الحجز" : "Booking details"}
        </div>
        <Button variant="ghost" size="sm" onClick={copyAll} className="gap-1 text-primary">
          <ClipboardList className="h-4 w-4"/>
          {lang === "ar" ? "نسخ الكل" : "Copy all"}
        </Button>
      </div>
      <dl className="rounded-xl border border-border divide-y divide-border overflow-hidden text-start">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr,2fr,auto] items-center p-3 text-sm gap-2">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="font-medium break-words">{r.value}</dd>
            <button
              type="button"
              onClick={() => copyRow(String(r.value ?? ""))}
              aria-label={lang === "ar" ? `نسخ ${r.label}` : `Copy ${r.label}`}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            >
              <ClipboardList className="h-3.5 w-3.5"/>
            </button>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          to="/track"
          search={{ ref: reference ?? undefined, phone4: phone4 || undefined } as never}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-3 text-sm font-bold hover:opacity-90"
        >
          <ClipboardList className="h-4 w-4"/>
          {lang === "ar" ? "متابعة في حجوزاتي" : "Track in my bookings"}
        </Link>
        <Link
          to="/booking-confirmation"
          search={{ ref: reference ?? undefined, phone } as never}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-bold hover:bg-muted"
        >
          <CheckCircle2 className="h-4 w-4"/>
          {lang === "ar" ? "عرض التفاصيل الكاملة" : "View full details"}
        </Link>
      </div>
      <div className="mt-3">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-sm font-bold text-white hover:bg-[#1ebe5b] transition"
        >
          <MessageCircle className="h-4 w-4"/>
          {lang === "ar" ? "تواصل عبر واتساب بتفاصيل الحجز" : "Contact via WhatsApp with booking details"}
        </a>
      </div>
      <div className="mt-3">
        <Button variant="outline" onClick={onNewBooking} className="gap-2 h-auto py-2 w-full">
          <CalIcon className="h-4 w-4"/>
          {lang === "ar" ? "حجز جديد" : "New booking"}
        </Button>
      </div>
    </div>
  );
}
