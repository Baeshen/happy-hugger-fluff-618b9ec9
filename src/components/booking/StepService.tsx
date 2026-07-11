import { Stethoscope, Activity, Scan, TestTube } from "lucide-react";
import { StepShell } from "./StepShell";
import type { ServiceType } from "./types";

export function StepService({ lang, value, onPick }: { lang: "ar" | "en"; value: ServiceType | null; onPick: (v: ServiceType) => void }) {
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
