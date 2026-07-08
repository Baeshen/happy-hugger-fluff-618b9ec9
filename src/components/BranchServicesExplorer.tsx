import { useMemo, useState } from "react";
import { Search, MapPin, Stethoscope, X, CalendarPlus } from "lucide-react";
import type { BranchSpecialty, ExcellenceCenter, PublicBranch } from "@/lib/branches.functions";

type Props = {
  branch: PublicBranch;
  specialties: BranchSpecialty[];
  centers: ExcellenceCenter[];
  onBookService?: (payload: { specialtyId: string | null; label: string; kind: "specialty" | "center" }) => void;
};

function baseMapEmbed(b: PublicBranch): string | null {
  if (b.map_embed_url) return b.map_embed_url;
  if (b.lat != null && b.lng != null) {
    return `https://www.google.com/maps?q=${b.lat},${b.lng}&hl=ar&z=15&output=embed`;
  }
  return null;
}

function serviceMapEmbed(b: PublicBranch, serviceLabel: string): string | null {
  const anchor = b.address_ar || b.name_ar;
  const q = encodeURIComponent(`${serviceLabel} - ${anchor}`);
  if (b.lat != null && b.lng != null) {
    return `https://www.google.com/maps?q=${q}&ll=${b.lat},${b.lng}&hl=ar&z=16&output=embed`;
  }
  if (b.map_embed_url) return b.map_embed_url;
  return `https://www.google.com/maps?q=${q}&hl=ar&z=15&output=embed`;
}

export function BranchServicesExplorer({ branch, specialties, centers, onBookService }: Props) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "specialty" | "center">("all");
  const [selected, setSelected] = useState<
    | {
        id: string;
        label: string;
        kind: "specialty" | "center";
        specialtyId: string | null;
      }
    | null
  >(null);

  const items = useMemo(() => {
    const specs = specialties.map((s) => ({
      id: `s:${s.id}`,
      label: s.name_ar,
      sub: s.name_en,
      kind: "specialty" as const,
      specialtyId: s.id,
    }));
    const cs = centers.map((c) => ({
      id: `c:${c.id}`,
      label: c.name_ar,
      sub: c.short_ar ?? c.name_en,
      kind: "center" as const,
      specialtyId: c.specialty_id ?? null,
    }));
    const all = [...cs, ...specs];
    const filtered = all
      .filter((x) => (tab === "all" ? true : x.kind === tab))
      .filter((x) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          x.label.toLowerCase().includes(q) || (x.sub ?? "").toLowerCase().includes(q)
        );
      });
    return filtered;
  }, [specialties, centers, tab, query]);

  const embed = selected ? serviceMapEmbed(branch, selected.label) : baseMapEmbed(branch);
  const hasCoords = branch.lat != null && branch.lng != null;
  const canBookSelected = !!(selected && selected.specialtyId && onBookService);


  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 font-bold">
          <Stethoscope className="h-5 w-5 text-primary" />
          الخدمات المتوفرة في {branch.name_ar}
        </h2>
        <span className="text-xs text-muted-foreground">
          {items.length} من {specialties.length + centers.length}
        </span>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Filter panel */}
        <div className="p-4 space-y-3 border-b lg:border-b-0 lg:border-l border-border">
          <div className="relative">
            <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن خدمة أو تخصص..."
              className="w-full ps-9 pe-3 py-2.5 rounded-lg border border-input bg-background text-sm outline-none focus:border-primary"
              aria-label="ابحث في خدمات الفرع"
            />
          </div>

          <div role="tablist" aria-label="تصفية الخدمات" className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
            {(
              [
                { k: "all", label: `الكل (${specialties.length + centers.length})` },
                { k: "center", label: `مراكز التميز (${centers.length})` },
                { k: "specialty", label: `التخصصات (${specialties.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                role="tab"
                aria-selected={tab === t.k}
                onClick={() => setTab(t.k)}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  tab === t.k ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <ul className="max-h-[420px] overflow-y-auto space-y-1.5 pr-1" role="list">
            {items.length === 0 ? (
              <li className="text-sm text-muted-foreground text-center py-8">لا توجد نتائج مطابقة.</li>
            ) : (
              items.map((it) => {
                const active = selected?.id === it.id;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected(
                          active
                            ? null
                            : { id: it.id, label: it.label, kind: it.kind, specialtyId: it.specialtyId },
                        )
                      }
                      className={`w-full text-start rounded-lg border px-3 py-2.5 text-sm transition-all flex items-center justify-between gap-2 ${
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                          : "border-border hover:border-primary/40 hover:bg-muted/40"
                      }`}
                      aria-pressed={active}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            it.kind === "center" ? "bg-primary" : "bg-accent"
                          }`}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{it.label}</span>
                          {it.sub && (
                            <span className="block text-xs text-muted-foreground truncate">{it.sub}</span>
                          )}
                        </span>
                      </span>
                      {active && <MapPin className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Map panel */}
        <div className="relative bg-muted min-h-[360px]">
          {embed ? (
            <iframe
              key={embed}
              title={selected ? `خريطة ${selected.label} - ${branch.name_ar}` : `خريطة ${branch.name_ar}`}
              src={embed}
              className="w-full h-full min-h-[360px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="h-full min-h-[360px] grid place-items-center text-sm text-muted-foreground">
              لا يوجد موقع محدد على الخريطة لهذا الفرع.
            </div>
          )}

          {selected && (
            <div className="absolute top-3 start-3 end-3 rounded-lg bg-background/95 backdrop-blur border border-border shadow-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <MapPin className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  {selected.kind === "center" ? "مركز تميز" : "تخصص"} — {branch.name_ar}
                </div>
                <div className="font-semibold truncate">{selected.label}</div>
                {!hasCoords && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    الموقع الدقيق للخدمة غير متوفر — يعرض موقع الفرع تقريبيًا.
                  </div>
                )}
                {selected.kind === "center" && !selected.specialtyId && onBookService && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    هذا المركز غير مرتبط بتخصص محدد — استخدم نموذج الحجز أدناه.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {canBookSelected && (
                  <button
                    type="button"
                    onClick={() =>
                      onBookService!({
                        specialtyId: selected!.specialtyId,
                        label: selected!.label,
                        kind: selected!.kind,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-95"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    احجز هذه الخدمة
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-md p-1.5 hover:bg-muted"
                  aria-label="إلغاء التحديد"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
