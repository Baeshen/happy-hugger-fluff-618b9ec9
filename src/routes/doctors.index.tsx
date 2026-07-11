/**
 * صفحة الأطباء — Doctors listing (UDH-style)
 * Hero + sidebar filters (specialty/branch/gender/language) + sort + pagination.
 * All filter/search/sort/page state is synced with URL for shareable links,
 * RTL-aware controls, and browser back/forward navigation.
 * Powered by public RPC list_public_doctors() (multi-branch aware).
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Star,
  MapPin,
  Languages,
  Award,
  Calendar,
  Stethoscope,
  Filter,
  X,
  Users,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { buildLocalBusinessSchema, buildBreadcrumbs } from "@/lib/localBusinessSchema";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const PER_PAGE = 12;
const SORT_KEYS = ["rating", "experience", "name"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  specialty: fallback(z.string(), "").default(""), // CSV of ids
  branch: fallback(z.string(), "").default(""),    // CSV of ids
  gender: fallback(z.string(), "").default(""),    // "male" | "female" | ""
  language: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "rating").default("rating"),
  page: fallback(z.number().int(), 1).default(1),
});

type SearchParams = z.infer<typeof searchSchema>;

const csvToList = (v: string): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
const listToCsv = (l: string[]): string => l.join(",");

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
  photo_url: string | null;
  gender: string | null;
  years_experience: number | null;
  languages: string[] | null;
  specialty_id: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  branch_ids: string[] | null;
  branch_names_ar: string[] | null;
  branch_slugs: string[] | null;
  avg_rating: number;
  ratings_count: number;
  booking_enabled: boolean;
  total_count: number;
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
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["public-doctors"],
      queryFn: fetchDoctors,
    }),
  head: ({ loaderData }) => {
    const list = (loaderData as DoctorRow[] | undefined) ?? [];
    const listed = list.filter((d) => d.slug);

    const buildPhysician = (d: DoctorRow) => {
      const url = `${SITE_URL}/doctors/${encodeURIComponent(d.slug!)}`;
      const node: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Physician",
        "@id": url,
        name: d.name_ar,
        alternateName: d.name_en || undefined,
        url,
      };
      if (d.photo_url) node.image = d.photo_url;
      if (d.specialty_name_ar || d.specialty_name_en) {
        node.medicalSpecialty = d.specialty_name_en || d.specialty_name_ar;
      }
      if (d.languages && d.languages.length > 0) node.knowsLanguage = d.languages;
      if (d.gender === "male" || d.gender === "female") node.gender = d.gender;
      if (d.branch_names_ar && d.branch_names_ar.length > 0) {
        node.affiliation = d.branch_names_ar.map((name) => ({
          "@type": "Hospital",
          name,
        }));
      }
      if (d.ratings_count > 0 && d.avg_rating > 0) {
        node.aggregateRating = {
          "@type": "AggregateRating",
          ratingValue: Number(d.avg_rating).toFixed(1),
          reviewCount: d.ratings_count,
          bestRating: "5",
          worstRating: "1",
        };
      }
      return node;
    };

    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: PAGE_TITLE,
      numberOfItems: listed.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: listed.map((d, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/doctors/${encodeURIComponent(d.slug!)}`,
        item: buildPhysician(d),
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
        {
          type: "application/ld+json",
          children: JSON.stringify(
            buildBreadcrumbs([
              { name: "الرئيسية", path: "/" },
              { name: "الأطباء", path: "/doctors" },
            ]),
          ),
        },
        ...(listed.length > 0
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
  const navigate = useNavigate({ from: "/doctors/" });
  const { lang } = useI18n();
  const ar = lang === "ar";

  // Clamp `sort` after read (schema uses fallback so `sort` is always string).
  const sort = (SORT_KEYS as readonly string[]).includes(params.sort)
    ? (params.sort as SortKey)
    : "rating";
  const page = Math.max(1, params.page);

  const selSpec = useMemo(() => csvToList(params.specialty), [params.specialty]);
  const selBranch = useMemo(() => csvToList(params.branch), [params.branch]);
  const selGender = params.gender === "male" || params.gender === "female" ? params.gender : "";
  const selLang = params.language;
  const qUrl = params.q;

  // Local search state so typing doesn't hit history on every keystroke.
  // We debounce writes to the URL to preserve back/forward semantics.
  const [qLocal, setQLocal] = useState(qUrl);
  useEffect(() => {
    // Sync from URL when it changes externally (browser back/forward).
    setQLocal(qUrl);
  }, [qUrl]);
  const qTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (qLocal === qUrl) return;
    if (qTimerRef.current) window.clearTimeout(qTimerRef.current);
    qTimerRef.current = window.setTimeout(() => {
      navigate({
        search: (prev: SearchParams) => ({ ...prev, q: qLocal, page: 1 }),
        replace: true,
      });
    }, 300);
    return () => {
      if (qTimerRef.current) window.clearTimeout(qTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  const setSearch = (patch: Record<string, unknown>) => {
    navigate({
      search: (prev: SearchParams) => ({ ...prev, ...patch, page: 1 }),
      replace: true,
    });
  };

  const toggleInCsv = (current: string[], id: string): string =>
    listToCsv(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  const { data: doctors = [], isLoading } = useQuery({
    queryKey: ["public-doctors"],
    queryFn: fetchDoctors,
    staleTime: 60_000,
  });

  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties-active"],
    queryFn: async () =>
      (
        await supabase
          .from("specialties")
          .select("id,slug,name_ar,name_en")
          .eq("is_active", true)
          .order("sort_order")
      ).data ?? [],
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
    // Filter uses the URL-persisted `q` so bookmarks/shares work; the local
    // input value stays in sync via the debounce effect above.
    const query = qUrl.trim().toLowerCase();
    const list = doctors.filter((d) => {
      if (selSpec.length && (!d.specialty_id || !selSpec.includes(d.specialty_id))) return false;
      if (selBranch.length) {
        const ids = d.branch_ids ?? [];
        if (!ids.some((b) => selBranch.includes(b))) return false;
      }
      if (selGender && d.gender !== selGender) return false;
      if (selLang && !(d.languages ?? []).includes(selLang)) return false;
      if (query) {
        const name = `${d.name_ar} ${d.name_en}`.toLowerCase();
        const spec = `${d.specialty_name_ar ?? ""} ${d.specialty_name_en ?? ""}`.toLowerCase();
        if (!name.includes(query) && !spec.includes(query)) return false;
      }
      return true;
    });

    // Sort (RTL-safe locale-aware compare for names).
    const collator = new Intl.Collator(ar ? "ar" : "en", { sensitivity: "base" });
    list.sort((a, b) => {
      if (sort === "rating") {
        const diff = Number(b.avg_rating ?? 0) - Number(a.avg_rating ?? 0);
        if (diff !== 0) return diff;
        return (b.ratings_count ?? 0) - (a.ratings_count ?? 0);
      }
      if (sort === "experience") {
        return (b.years_experience ?? 0) - (a.years_experience ?? 0);
      }
      // name
      const an = ar ? a.name_ar : a.name_en || a.name_ar;
      const bn = ar ? b.name_ar : b.name_en || b.name_ar;
      return collator.compare(an, bn);
    });
    return list;
  }, [doctors, qUrl, selSpec, selBranch, selGender, selLang, sort, ar]);

  // Pagination — clamp page to available range after filters change.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (safePage !== page) {
      navigate({ search: (prev: SearchParams) => ({ ...prev, page: safePage }), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, page]);
  const start = (safePage - 1) * PER_PAGE;
  const paged = filtered.slice(start, start + PER_PAGE);

  // Fetch next available slot for currently visible doctors only.
  const pagedIds = useMemo(() => paged.map((d) => d.id).sort(), [paged]);
  const { data: nextSlotMap = {} as Record<string, string> } = useQuery({
    queryKey: ["doctors-next-slots", pagedIds],
    enabled: pagedIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_doctors_next_slot", {
        _doctor_ids: pagedIds,
      });
      if (error) return {};
      const out: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ doctor_id: string; next_slot_at: string }>) {
        out[row.doctor_id] = row.next_slot_at;
      }
      return out;
    },
  });

  const goPage = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    navigate({ search: (prev: SearchParams) => ({ ...prev, page: clamped }) });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const clearAll = () =>
    navigate({
      search: () => ({ q: "", specialty: "", branch: "", gender: "", language: "", sort, page: 1 }),
      replace: true,
    });

  const activeCount =
    selSpec.length +
    selBranch.length +
    (selGender ? 1 : 0) +
    (selLang ? 1 : 0) +
    (qUrl ? 1 : 0);

  const FiltersPanel = (
    <div className="space-y-6">
      {activeCount > 0 && (
        <button
          onClick={clearAll}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <X className="h-3.5 w-3.5" />
          {ar ? `مسح كل الفلاتر (${activeCount})` : `Clear filters (${activeCount})`}
        </button>
      )}

      <FilterGroup title={ar ? "التخصص" : "Specialty"}>
        {specialties.map((s) => (
          <CheckItem
            key={s.id}
            checked={selSpec.includes(s.id)}
            onChange={() => setSearch({ specialty: toggleInCsv(selSpec, s.id) })}
            label={ar ? s.name_ar : s.name_en}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={ar ? "الفرع" : "Branch"}>
        {branches.map((b) => (
          <CheckItem
            key={b.id}
            checked={selBranch.includes(b.id)}
            onChange={() => setSearch({ branch: toggleInCsv(selBranch, b.id) })}
            label={ar ? b.name_ar : b.name_en}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={ar ? "الجنس" : "Gender"}>
        {(["male", "female"] as const).map((g) => (
          <CheckItem
            key={g}
            checked={selGender === g}
            onChange={(v) => setSearch({ gender: v ? g : "" })}
            label={g === "male" ? (ar ? "طبيب" : "Male") : ar ? "طبيبة" : "Female"}
          />
        ))}
      </FilterGroup>

      {allLangs.length > 0 && (
        <FilterGroup title={ar ? "اللغة" : "Language"}>
          {allLangs.map((l) => (
            <CheckItem
              key={l}
              checked={selLang === l}
              onChange={(v) => setSearch({ language: v ? l : "" })}
              label={LANG_LABELS[l]?.[lang] ?? l}
            />
          ))}
        </FilterGroup>
      )}
    </div>
  );

  const totalDoctors = doctors.length;
  const totalSpecs = specialties.length;

  const sortLabel = (s: SortKey): string =>
    ar
      ? s === "rating"
        ? "الأعلى تقييمًا"
        : s === "experience"
          ? "الأكثر خبرة"
          : "الاسم (أ-ي)"
      : s === "rating"
        ? "Top rated"
        : s === "experience"
          ? "Most experienced"
          : "Name (A-Z)";

  return (
    <div className="bg-muted/30 min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />
        <div className="container-app relative py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              <Users className="h-3.5 w-3.5" />
              {ar ? "الفريق الطبي" : "Medical team"}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1]">
              {ar ? "أطباؤنا الاستشاريون" : "Our Consultant Doctors"}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
              {ar
                ? "نخبة من الأطباء الاستشاريين والأخصائيين في مختلف التخصصات. ابحث عن طبيبك، تعرف على خبرته، واحجز موعدك في دقائق."
                : "A selection of consultants and specialists across many specialties. Find your doctor, review their expertise, and book in minutes."}
            </p>

            <div className="mt-8 relative">
              <Search className="absolute top-1/2 -translate-y-1/2 start-5 h-5 w-5 text-muted-foreground pointer-events-none" />
              <input
                value={qLocal}
                onChange={(e) => setQLocal(e.target.value)}
                placeholder={ar ? "ابحث بالاسم أو التخصص…" : "Search by name or specialty…"}
                className="w-full h-16 rounded-2xl border border-border bg-card shadow-md ps-14 pe-4 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label={ar ? "بحث" : "Search"}
              />
              {qLocal && (
                <button
                  onClick={() => setQLocal("")}
                  className="absolute top-1/2 -translate-y-1/2 end-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label={ar ? "مسح" : "Clear"}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">{totalDoctors}+</span>
                <span className="text-muted-foreground">
                  {ar ? "طبيب واستشاري" : "Doctors & consultants"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">{totalSpecs}+</span>
                <span className="text-muted-foreground">{ar ? "تخصص طبي" : "Specialties"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">{branches.length}</span>
                <span className="text-muted-foreground">{ar ? "فروع" : "Branches"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container-app py-8">
        <div className="grid lg:grid-cols-[300px_1fr] gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  {ar ? "تصفية النتائج" : "Filter results"}
                </h3>
              </div>
              {FiltersPanel}
            </div>
          </aside>

          <main>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <p className="text-sm text-muted-foreground">
                {ar ? (
                  <>
                    عرض{" "}
                    <span className="font-semibold text-foreground">
                      {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + PER_PAGE, filtered.length)}
                    </span>{" "}
                    من أصل <span className="font-semibold text-foreground">{filtered.length}</span>
                  </>
                ) : (
                  <>
                    Showing{" "}
                    <span className="font-semibold text-foreground">
                      {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + PER_PAGE, filtered.length)}
                    </span>{" "}
                    of <span className="font-semibold text-foreground">{filtered.length}</span>
                  </>
                )}
              </p>

              <div className="flex items-center gap-2">
                {/* Sort */}
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowUpDown className="h-4 w-4" />
                  <span className="hidden sm:inline">{ar ? "الترتيب" : "Sort"}</span>
                  <select
                    value={sort}
                    onChange={(e) => setSearch({ sort: e.target.value })}
                    className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label={ar ? "الترتيب" : "Sort"}
                  >
                    {SORT_KEYS.map((s) => (
                      <option key={s} value={s}>
                        {sortLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Mobile filters trigger */}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="lg:hidden gap-2">
                      <Filter className="h-4 w-4" />
                      {ar ? "تصفية" : "Filters"}
                      {activeCount > 0 && (
                        <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">
                          {activeCount}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side={ar ? "right" : "left"} className="overflow-y-auto">
                    <h3 className="font-bold mb-4 mt-4 flex items-center gap-2">
                      <Filter className="h-4 w-4 text-primary" />
                      {ar ? "تصفية النتائج" : "Filter results"}
                    </h3>
                    {FiltersPanel}
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {isLoading && (
              <div className="grid gap-5 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-64 rounded-2xl bg-card border border-border animate-pulse"
                    aria-hidden
                  />
                ))}
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
                {ar ? "لا يوجد أطباء يطابقون معايير البحث." : "No doctors match your filters."}
                {activeCount > 0 && (
                  <button
                    onClick={clearAll}
                    className="block mx-auto mt-3 text-sm text-primary hover:underline"
                  >
                    {ar ? "مسح الفلاتر" : "Clear filters"}
                  </button>
                )}
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              {paged.map((d) => (
                <DoctorCard key={d.id} d={d} lang={lang} nextSlotIso={nextSlotMap[d.id]} />
              ))}
            </div>

            {totalPages > 1 && (
              <Pagination
                page={safePage}
                totalPages={totalPages}
                onGo={goPage}
                ar={ar}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onGo,
  ar,
}: {
  page: number;
  totalPages: number;
  onGo: (p: number) => void;
  ar: boolean;
}) {
  // Build a compact page list: [1, …, page-1, page, page+1, …, total]
  const pages = useMemo(() => {
    const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    return Array.from(set)
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [page, totalPages]);

  // In RTL, keep visual order matching reading order — a horizontal flex
  // in an RTL container already flips; icons use dir-safe rotation.
  return (
    <nav
      className="mt-8 flex items-center justify-center gap-1"
      role="navigation"
      aria-label={ar ? "التنقل بين الصفحات" : "Pagination"}
    >
      <button
        type="button"
        onClick={() => onGo(page - 1)}
        disabled={page <= 1}
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition"
        aria-label={ar ? "السابق" : "Previous"}
      >
        {ar ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        <span className="hidden sm:inline">{ar ? "السابق" : "Previous"}</span>
      </button>

      {pages.map((p, i) => {
        const prev = pages[i - 1];
        const gap = prev != null && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1">
            {gap && <span className="px-1 text-muted-foreground">…</span>}
            <button
              type="button"
              onClick={() => onGo(p)}
              aria-current={p === page ? "page" : undefined}
              className={`h-9 min-w-9 rounded-lg border px-3 text-sm font-semibold transition ${
                p === page
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary hover:text-primary"
              }`}
            >
              {p.toLocaleString(ar ? "ar-SA" : "en-US")}
            </button>
          </span>
        );
      })}

      <button
        type="button"
        onClick={() => onGo(page + 1)}
        disabled={page >= totalPages}
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition"
        aria-label={ar ? "التالي" : "Next"}
      >
        <span className="hidden sm:inline">{ar ? "التالي" : "Next"}</span>
        {ar ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </nav>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-sm mb-2.5 text-foreground/90">{title}</div>
      <div className="space-y-2 max-h-56 overflow-y-auto pe-1">{children}</div>
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
    <label className="flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border accent-primary h-4 w-4"
      />
      <span className={checked ? "font-medium text-primary" : ""}>{label}</span>
    </label>
  );
}

function DoctorCard({ d, lang }: { d: DoctorRow; lang: "ar" | "en" }) {
  const name = lang === "ar" ? d.name_ar : d.name_en;
  const title = lang === "ar" ? d.title_ar : d.title_en;
  const specName = lang === "ar" ? d.specialty_name_ar : d.specialty_name_en;
  const branchNames = (d.branch_names_ar ?? []).filter(Boolean);
  const branchLabel = branchNames.length
    ? branchNames.length === 1
      ? branchNames[0]
      : `${branchNames[0]} +${branchNames.length - 1}`
    : null;

  return (
    <article className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-xl hover:border-primary/30 transition-all flex flex-col">
      <div className="p-5 flex gap-4">
        <div className="h-24 w-24 shrink-0 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-2xl font-bold overflow-hidden ring-1 ring-primary/10">
          {d.photo_url ? (
            <img
              src={d.photo_url}
              alt={name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span aria-hidden>{name.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-lg leading-tight truncate">
            {d.slug ? (
              <Link
                to="/doctors/$slug"
                params={{ slug: d.slug }}
                className="hover:text-primary transition-colors"
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </h3>
          {title && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{title}</div>
          )}
          {specName && (
            <div className="text-sm text-primary mt-1 flex items-center gap-1 truncate">
              <Stethoscope className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{specName}</span>
            </div>
          )}
          {d.ratings_count > 0 && (
            <div className="flex items-center gap-1 mt-2 text-sm">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">{Number(d.avg_rating).toFixed(1)}</span>
              <span className="text-muted-foreground text-xs">({d.ratings_count})</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-4 space-y-1.5 text-xs text-muted-foreground">
        {branchLabel && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={branchNames.join(" • ")}>
              {branchLabel}
            </span>
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
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-center hover:bg-muted transition-colors"
          >
            {lang === "ar" ? "الملف الشخصي" : "View profile"}
          </Link>
        ) : (
          <div />
        )}
        {d.booking_enabled ? (
          d.slug ? (
            <Link
              to="/doctors/$slug"
              params={{ slug: d.slug }}
              hash="book"
              className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold text-center hover:bg-primary/90 flex items-center justify-center gap-1 transition-colors"
            >
              <Calendar className="h-3.5 w-3.5" />
              {lang === "ar" ? "احجز موعد" : "Book"}
            </Link>
          ) : (
            <Link
              to="/book"
              search={{ doctor: d.id }}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold text-center hover:bg-primary/90 flex items-center justify-center gap-1 transition-colors"
            >
              <Calendar className="h-3.5 w-3.5" />
              {lang === "ar" ? "احجز موعد" : "Book"}
            </Link>
          )
        ) : (
          <span className="rounded-lg bg-muted text-muted-foreground px-3 py-2 text-xs text-center">
            {lang === "ar" ? "الحجز غير متاح" : "Booking closed"}
          </span>
        )}
      </div>
    </article>
  );
}
