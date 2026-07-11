import {
  Building2, Calendar as CalIcon, ClipboardList, Clock, Stethoscope, User, UserCircle2,
} from "lucide-react";
import { formatArDate, type ServiceType, type State } from "./types";

export function SummarySidebar({
  lang, state, branches, specialties, doctors, onEdit,
}: {
  lang: "ar" | "en";
  state: State;
  branches: any[];
  specialties: any[];
  doctors: any[];
  onEdit: (step: number) => void;
}) {
  const branch = branches.find((b) => b.id === state.branchId);
  const spec = specialties.find((s) => s.id === state.specialtyId);
  const doc = doctors.find((d: any) => d.id === state.doctorId);

  const serviceLabels: Record<ServiceType, { ar: string; en: string }> = {
    clinic: { ar: "عيادات تخصصية", en: "Specialty Clinics" },
    followup: { ar: "متابعة", en: "Follow-up" },
    radiology: { ar: "الأشعة", en: "Radiology" },
    lab: { ar: "المختبر", en: "Laboratory" },
  };

  const rows: { label: string; value: string | null; step: number; icon: any }[] = [
    {
      label: lang === "ar" ? "الخدمة" : "Service",
      value: state.serviceType ? (lang === "ar" ? serviceLabels[state.serviceType].ar : serviceLabels[state.serviceType].en) : null,
      step: 1, icon: ClipboardList,
    },
    {
      label: lang === "ar" ? "الفرع" : "Branch",
      value: branch ? (lang === "ar" ? branch.name_ar : branch.name_en) : null,
      step: 2, icon: Building2,
    },
    {
      label: lang === "ar" ? "التخصص" : "Specialty",
      value: spec ? (lang === "ar" ? spec.name_ar : spec.name_en) : null,
      step: 3, icon: Stethoscope,
    },
    {
      label: lang === "ar" ? "الطبيب" : "Doctor",
      value: doc ? (lang === "ar" ? doc.name_ar : doc.name_en) : null,
      step: 4, icon: UserCircle2,
    },
    {
      label: lang === "ar" ? "التاريخ" : "Date",
      value: state.date ? formatArDate(state.date, lang) : null,
      step: 5, icon: CalIcon,
    },
    {
      label: lang === "ar" ? "الوقت" : "Time",
      value: state.time,
      step: 6, icon: Clock,
    },
    {
      label: lang === "ar" ? "المريض" : "Patient",
      value: state.patient.name || null,
      step: 7, icon: User,
    },
  ];

  const filled = rows.filter((r) => r.value);
  if (filled.length === 0) return null;

  return (
    <aside className="md:sticky md:top-6 h-fit">
      <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          {lang === "ar" ? "ملخّص الحجز" : "Booking summary"}
        </h3>
        <ul className="space-y-2.5">
          {filled.map((r) => (
            <li key={r.label} className="flex items-start gap-2 text-sm group">
              <r.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-muted-foreground">{r.label}</div>
                <div className="font-medium truncate">{r.value}</div>
              </div>
              {state.step > r.step && (
                <button
                  type="button"
                  onClick={() => onEdit(r.step)}
                  className="text-[11px] text-primary opacity-0 group-hover:opacity-100 hover:underline shrink-0"
                >
                  {lang === "ar" ? "تعديل" : "Edit"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
