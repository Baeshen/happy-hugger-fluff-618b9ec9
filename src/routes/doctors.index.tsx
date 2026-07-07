import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Search } from "lucide-react";
import { z } from "zod";
import { buildLocalBusinessSchema, buildBreadcrumbs } from "@/lib/localBusinessSchema";

const search = z.object({ specialty: z.string().optional() });

const SITE_URL = "https://happy-hugger-fluff.lovable.app";
const PAGE_URL = `${SITE_URL}/doctors`;
const PAGE_TITLE = "أطباؤنا | مجمع باعشن الطبي";
const PAGE_DESC =
  "استشاريون وأخصائيون في مختلف التخصصات الطبية بمجمع باعشن الطبي – صبيا، جازان.";

type DoctorSlim = { slug: string | null; name_ar: string };

async function fetchDoctorSlugs(): Promise<DoctorSlim[]> {
  const { data } = await supabase
    .from("doctors")
    .select("slug, name_ar")
    .eq("is_active", true)
    .not("slug", "is", null)
    .order("sort_order");
  return (data ?? []) as DoctorSlim[];
}

export const Route = createFileRoute("/doctors/")({
  validateSearch: search,
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["doctors-slugs"],
      queryFn: fetchDoctorSlugs,
    }),
  head: ({ loaderData }) => {
    const list = (loaderData as DoctorSlim[] | undefined) ?? [];
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


function DoctorsPage() {
  const { specialty } = Route.useSearch();
  const { lang, t } = useI18n();
  const [q, setQ] = useState("");
  const [selSpec, setSelSpec] = useState<string>(specialty ?? "all");

  const { data: specialties } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () =>
      (await supabase.from("specialties").select("*").eq("is_active", true).order("sort_order"))
        .data ?? [],
  });
  const { data: doctors, isLoading } = useQuery({
    queryKey: ["doctors"],
    queryFn: async () =>
      (
        await supabase
          .from("doctors")
          .select("*, specialties(*)")
          .eq("is_active", true)
          .order("sort_order")
      ).data ?? [],
  });

  const filtered = (doctors ?? []).filter((d) => {
    const okSpec = selSpec === "all" || (d as any).specialties?.slug === selSpec;
    const name = (lang === "ar" ? d.name_ar : d.name_en).toLowerCase();
    const okQ = !q || name.includes(q.toLowerCase());
    return okSpec && okQ;
  });

  return (
    <div className="container-app py-12">
      <header className="mb-8">
        <h1 className="text-4xl font-bold">{t("doctors_title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("doctors_sub")}</p>
      </header>

      <div className="mb-8 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            className="w-full rounded-md border border-input bg-background ps-9 pe-3 py-2 text-sm"
          />
        </div>
        <select
          value={selSpec}
          onChange={(e) => setSelSpec(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[200px]"
        >
          <option value="all">{t("all_specialties")}</option>
          {specialties?.map((s) => (
            <option key={s.id} value={s.slug}>
              {lang === "ar" ? s.name_ar : s.name_en}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-muted-foreground">{t("loading")}</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-muted-foreground">{t("no_doctors")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => (
          <div key={d.id} className="rounded-2xl border border-border bg-card p-6 flex flex-col">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 text-primary grid place-items-center text-xl font-bold overflow-hidden">
                {(d as any).photo_url ? (
                  <img
                    src={(d as any).photo_url}
                    alt={lang === "ar" ? d.name_ar : d.name_en}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (lang === "ar" ? d.name_ar : d.name_en).charAt(0)
                )}
              </div>
              <div>
                <div className="font-bold">
                  {(d as any).slug ? (
                    <Link
                      to="/doctors/$slug"
                      params={{ slug: (d as any).slug }}
                      className="hover:text-primary"
                    >
                      {lang === "ar" ? d.name_ar : d.name_en}
                    </Link>
                  ) : (
                    <>{lang === "ar" ? d.name_ar : d.name_en}</>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lang === "ar" ? d.title_ar : d.title_en}
                </div>
                <div className="text-xs text-primary mt-1">
                  {lang === "ar"
                    ? (d as any).specialties?.name_ar
                    : (d as any).specialties?.name_en}
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground leading-6 line-clamp-3 flex-1">
              {lang === "ar" ? d.bio_ar : d.bio_en}
            </p>
            <div className="mt-4 flex gap-2">
              {(d as any).slug && (
                <Link
                  to="/doctors/$slug"
                  params={{ slug: (d as any).slug }}
                  className="flex-1 text-center rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  الملف الشخصي
                </Link>
              )}
              <Link
                to="/book"
                search={{ doctor: d.id }}
                className="flex-1 text-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {t("book_with_doctor")}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
