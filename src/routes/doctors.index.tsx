/**
 * صفحة الأطباء — Doctors listing (UDH-style)
 * Hero + sidebar filters (specialty/branch/gender/language) + big cards
 * Powered by public RPC list_public_doctors().
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { Search, Star, MapPin, Languages, Award, Calendar, Stethoscope, Filter } from "lucide-react";
import { z } from "zod";
import { buildLocalBusinessSchema, buildBreadcrumbs } from "@/lib/localBusinessSchema";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const search = z.object({
  specialty: z.string().optional(),
  branch: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  language: z.string().optional(),
  q: z.string().optional(),
});

const SITE_URL = "https://happy-hugger-fluff.lovable.app";
const PAGE_URL = `${SITE_URL}/doctors`;
const PAGE_TITLE = "أطباؤنا | مجمع باعشن الطبي";
const PAGE_DESC =
  "استشاريون وأخصائيون في مختلف التخصصات الطبية بمجمع باعشن الطبي — احجز موعدًا مع طبيبك في صبيا، جازان.";

type DoctorRow = {
  id: string;
  slug: string | null;
  name_ar: string;
  name_en: string;
  title_ar: string | null;
  title_en: string | null;
  bio_ar: string | null;
  bio_en: string | null;
  photo_url: string | null;
  gender: string | null;
  years_experience: number | null;
  languages: string[] | null;
  booking_enabled: boolean;
  branch_id: string | null;
  branch_name_ar: string | null;
  branch_name_en: string | null;
  specialty_id: string | null;
  specialty_slug: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  ratings_count: number;
  avg_rating: number;
};

async function fetchDoctors(): Promise<DoctorRow[]> {
  const { data, error } = await supabase.rpc("list_public_doctors", {
    _limit: 200,
    _offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as unknown as DoctorRow[];
}

export const Route = createFileRoute("/doctors/")({
  validateSearch: search,
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["public-doctors"],
      queryFn: fetchDoctors,
    }),
  head: ({ loaderData }) => {
    const list = (loaderData as DoctorRow[] | undefined) ?? [];
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: list
        .filter((d) => d.slug)
        .map((d, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: d.name_ar,
          url: `${SITE_URL}/doctors/${encodeURIComponent(d.slug!)}`,
        })),
    };
    return {
      meta: [
        { title: PAGE_TITLE },
        { name: "description", content: PAGE_DESC },
        { property: "og:title", content: PAGE_TITLE },
        { property: "og:description", content: PAGE_DESC },
        { property: "og:type", content: "website" },
        { property: "og:url", content: PAGE_URL },
        { property: "og:locale", content: "ar_SA" },
      ],
      links: [{ rel: "canonical", href: PAGE_URL }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(buildLocalBusinessSchema({ pageUrl: PAGE_URL })) },
        { type: "application/ld+json", children: JSON.stringify(buildBreadcrumbs([
          { name: "الرئيسية", path: "/" },
          { name: "الأطباء", path: "/doctors" },
        ])) },
        ...(itemList.itemListElement.length > 0
          ? [{ type: "application/ld+json", children: JSON.stringify(itemList) }]
          : []),
      ],
    };
  },
  component: DoctorsPage,
});

const LANG_LABELS: Record<string, { ar: string; en: string }> = {
  ar: { ar: "العربية", en: "Arabic" },
  en: { ar: "الإنجليزية", en: "English" },
  ur: { ar: "الأوردو", en: "Urdu" },
  hi: { ar: "الهندية", en: "Hindi" },
  fr: { ar: "الفرنسية", en: "French" },
};

function DoctorsPage() {
  const params = Route.useSearch();
  const { lang } = useI18n();
  const [q, setQ] = useState(params.q ?? "");
  const [selSpec, setSelSpec] = useState<string[]>(params.specialty ? [params.specialty] : []);
  const [selBranch, setSelBranch] = useState<string[]>(params.branch ? [params.branch] : []);
  const [selGender, setSelGender] = useState<string | null>(params.gender ?? null);
  const [selLang, setSelLang] = useState<string | null>(params.language ?? null);

  const { data: doctors = [], isLoading } = useQuery({
    queryKey: ["public-doctors"],
    queryFn: fetchDoctors,
    staleTime: 60_000,
  });

  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties-active"],
    queryFn: async () =>
      (await supabase.from("specialties").select("id,slug,name_ar,name_en").eq("is_active", true).order("sort_order"))
        .data ?? [],
    staleTime: 5 * 60_000,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["public-branches"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_public_branches");
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const allLangs = useMemo(() => {
    const s = new Set<string>();
    doctors.forEach((d) => (d.languages ?? []).forEach((l) => s.add(l)));
    return Array.from(s);
  }, [doctors]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return doctors.filter((d) => {
      if (selSpec.length && (!d.specialty_slug || !selSpec.includes(d.specialty_slug))) return false;
      if (selBranch.length && (!d.branch_id || !selBranch.includes(d.branch_id))) return false;
      if (selGender && d.gender !== selGender) return false;
      if (selLang && !(d.languages ?? []).includes(selLang)) return false;
      if (query) {
        const name = `${d.name_ar} ${d.name_en}`.toLowerCase();
        if (!name.includes(query)) return false;
      }
      return true;
    });
  }, [doctors, q, selSpec, selBranch, selGender, selLang]);

  const clearAll = () => {
    setSelSpec([]);
    setSelBranch([]);
    setSelGender(null);
    setSelLang(null);
    setQ("");
  };

  const activeCount =
    selSpec.length + selBranch.length + (selGender ? 1 : 0) + (selLang ? 1 : 0) + (q ? 1 : 0);

  const FiltersPanel = (
    <div className="space-y-6">
      {activeCount > 0 && (
        <button
          onClick={clearAll}
          className="text-xs text-primary hover:underline"
        >
          {lang === "ar" ? `مسح كل الفلاتر (${activeCount})` : `Clear filters (${activeCount})`}
        </button>
      )}

      <FilterGroup title={lang === "ar" ? "التخصص" : "Specialty"}>
        {specialties.map((s) => (
          <CheckItem
            key={s.id}
            checked={selSpec.includes(s.slug ?? "")}
            onChange={(v) =>
              setSelSpec((prev) =>
                v ? [...prev, s.slug ?? ""] : prev.filter((x) => x !== s.slug),
              )
            }
            label={lang === "ar" ? s.name_ar : s.name_en}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={lang === "ar" ? "الفرع" : "Branch"}>
        {branches.map((b) => (
          <CheckItem
            key={b.id}
            checked={selBranch.includes(b.id)}
            onChange={(v) =>
              setSelBranch((prev) => (v ? [...prev, b.id] : prev.filter((x) => x !== b.id)))
            }
            label={lang === "ar" ? b.name_ar : b.name_en}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={lang === "ar" ? "الجنس" : "Gender"}>
        {(["male", "female"] as const).map((g) => (
          <CheckItem
            key={g}
            checked={selGender === g}
            onChange={(v) => setSelGender(v ? g : null)}
            label={
              g === "male"
                ? lang === "ar" ? "طبيب" : "Male"
                : lang === "ar" ? "طبيبة" : "Female"
            }
          />
        ))}
      </FilterGroup>

      {allLangs.length > 0 && (
        <FilterGroup title={lang === "ar" ? "اللغة" : "Language"}>
          {allLangs.map((l) => (
            <CheckItem
              key={l}
              checked={selLang === l}
              onChange={(v) => setSelLang(v ? l : null)}
              label={LANG_LABELS[l]?.[lang] ?? l}
            />
          ))}
        </FilterGroup>
      )}
    </div>
  );

  return (
    <div className="bg-muted/30 min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-background border-b border-border">
        <div className="container-app py-14 md:py-20">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            {lang === "ar" ? "أطباؤنا" : "Our Doctors"}
          </h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            {lang === "ar"
              ? "نخبة من الأطباء الاستشاريين والأخصائيين في مختلف التخصصات. ابحث عن طبيبك واحجز موعدك بسهولة."
              : "A selection of consultants and specialists across specialties. Find your doctor and book easily."}
          </p>

          <div className="mt-8 max-w-xl relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-4 h-5 w-5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={lang === "ar" ? "ابحث بالاسم أو التخصص…" : "Search by name or specialty…"}
              className="w-full h-14 rounded-full border border-border bg-card shadow-sm ps-12 pe-4 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </section>

      <div className="container-app py-8">
        <div className="grid lg:grid-cols-[280px_1fr] gap-8">
          {/* Sidebar (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-6">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Filter className="h-4 w-4" />
                {lang === "ar" ? "تصفية" : "Filters"}
              </h3>
              {FiltersPanel}
            </div>
          </aside>

          {/* Results */}
          <main>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {lang === "ar"
                  ? `${filtered.length} طبيب${filtered.length === 1 ? "" : "/طبيبة"}`
                  : `${filtered.length} doctor${filtered.length === 1 ? "" : "s"}`}
              </p>

              {/* Mobile filters trigger */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden gap-2">
                    <Filter className="h-4 w-4" />
                    {lang === "ar" ? "تصفية" : "Filters"}
                    {activeCount > 0 && (
                      <span className="rounded-full bg-primary text-primary-foreground text-xs px-2">
                        {activeCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side={lang === "ar" ? "right" : "left"} className="overflow-y-auto">
                  <h3 className="font-bold mb-4 mt-4">
                    {lang === "ar" ? "تصفية" : "Filters"}
                  </h3>
                  {FiltersPanel}
                </SheetContent>
              </Sheet>
            </div>

            {isLoading && (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-52 rounded-2xl bg-card border border-border animate-pulse" />
                ))}
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
                {lang === "ar"
                  ? "لا يوجد أطباء يطابقون معايير البحث."
                  : "No doctors match your filters."}
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              {filtered.map((d) => (
                <DoctorCard key={d.id} d={d} lang={lang} />
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-sm mb-2">{title}</div>
      <div className="space-y-1.5 max-h-56 overflow-y-auto pe-1">{children}</div>
    </div>
  );
}

function CheckItem({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function DoctorCard({ d, lang }: { d: DoctorRow; lang: "ar" | "en" }) {
  const name = lang === "ar" ? d.name_ar : d.name_en;
  const title = lang === "ar" ? d.title_ar : d.title_en;
  const specName = lang === "ar" ? d.specialty_name_ar : d.specialty_name_en;
  const branchName = lang === "ar" ? d.branch_name_ar : d.branch_name_en;

  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
      <div className="p-5 flex gap-4">
        <div className="h-24 w-24 shrink-0 rounded-2xl bg-primary/10 text-primary grid place-items-center text-2xl font-bold overflow-hidden">
          {d.photo_url ? (
            <img src={d.photo_url} alt={name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            name.charAt(0)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-lg leading-tight truncate">
            {d.slug ? (
              <Link to="/doctors/$slug" params={{ slug: d.slug }} className="hover:text-primary">
                {name}
              </Link>
            ) : (
              name
            )}
          </h3>
          {title && <div className="text-xs text-muted-foreground mt-0.5">{title}</div>}
          {specName && (
            <div className="text-sm text-primary mt-1 flex items-center gap-1">
              <Stethoscope className="h-3.5 w-3.5" />
              {specName}
            </div>
          )}
          {d.ratings_count > 0 && (
            <div className="flex items-center gap-1 mt-2 text-sm">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">{d.avg_rating.toFixed(1)}</span>
              <span className="text-muted-foreground text-xs">({d.ratings_count})</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-4 space-y-1.5 text-xs text-muted-foreground">
        {branchName && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{branchName}</span>
          </div>
        )}
        {d.years_experience != null && (
          <div className="flex items-center gap-2">
            <Award className="h-3.5 w-3.5 shrink-0" />
            {lang === "ar"
              ? `خبرة ${d.years_experience}+ سنة`
              : `${d.years_experience}+ years experience`}
          </div>
        )}
        {d.languages && d.languages.length > 0 && (
          <div className="flex items-center gap-2">
            <Languages className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {d.languages.map((l) => LANG_LABELS[l]?.[lang] ?? l).join(" · ")}
            </span>
          </div>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 p-4 pt-3 border-t border-border">
        {d.slug ? (
          <Link
            to="/doctors/$slug"
            params={{ slug: d.slug }}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-center hover:bg-muted"
          >
            {lang === "ar" ? "الملف الشخصي" : "View profile"}
          </Link>
        ) : (
          <div />
        )}
        {d.booking_enabled ? (
          <Link
            to="/book"
            search={{ doctor: d.id }}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold text-center hover:bg-primary/90 flex items-center justify-center gap-1"
          >
            <Calendar className="h-3.5 w-3.5" />
            {lang === "ar" ? "احجز موعد" : "Book"}
          </Link>
        ) : (
          <span className="rounded-lg bg-muted text-muted-foreground px-3 py-2 text-xs text-center">
            {lang === "ar" ? "الحجز غير متاح" : "Booking closed"}
          </span>
        )}
      </div>
    </article>
  );
}
