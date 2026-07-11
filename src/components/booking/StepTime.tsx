import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { StepShell } from "./StepShell";
import type { AvailResp } from "./types";

export function StepTime({ lang, value, avail, onPick }: { lang: "ar" | "en"; value: string | null; avail: AvailResp | undefined; onPick: (v: string) => void }) {
  const times = avail?.times ?? [];
  const booked = new Set(avail?.booked ?? []);
  const groups = useMemo(() => {
    const morning: string[] = [], afternoon: string[] = [], evening: string[] = [];
    for (const t of times) {
      const h = parseInt(t.slice(0, 2), 10);
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
