import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Stethoscope } from "lucide-react";

const SITE_URL = "https://happy-hugger-fluff.lovable.app";
const PAGE_URL = `${SITE_URL}/specialties`;
const PAGE_TITLE_AR = "التخصصات الطبية — مجمع باعشن الطبي بصبيا، جازان";
const PAGE_DESC_AR =
  "تخصصات طبية شاملة في مجمع باعشن الطبي بصبيا، جازان: الباطنة، الأطفال، النساء والولادة، الأسنان، العيون، الجراحة والمزيد. احجز موعدك أونلاين مع نخبة من الاستشاريين والأخصائيين.";

type Specialty = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  sort_order: number | null;
};

async function fetchSpecialties(): Promise<Specialty[]> {
  const { data, error } = await supabase
    .from("specialties")
    .select("id, slug, name_ar, name_en, description_ar, description_en, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Specialty[];
}

export const Route = createFileRoute("/specialties/")({
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["specialties"],
      queryFn: fetchSpecialties,
    }),
  head: ({ loaderData }) => {
    const list = (loaderData as Specialty[] | undefined) ?? [];
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: list.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: s.name_ar,
        url: `${SITE_URL}/specialties/${encodeURIComponent(s.slug)}`,
      })),
    };
    return {
      meta: [
        { title: PAGE_TITLE_AR },
        { name: "description", content: PAGE_DESC_AR },
        { property: "og:title", content: PAGE_TITLE_AR },
        { property: "og:description", content: PAGE_DESC_AR },
        { property: "og:type", content: "website" },
        { property: "og:url", content: PAGE_URL },
        { property: "og:locale", content: "ar_SA" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: PAGE_TITLE_AR },
        { name: "twitter:description", content: PAGE_DESC_AR },
      ],
      links: [{ rel: "canonical", href: PAGE_URL }],
      scripts:
        list.length > 0
          ? [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }]
          : [],
    };
  },
  component: SpecialtiesPage,
});

function SpecialtiesPage() {
  const { lang, t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["specialties"],
    queryFn: fetchSpecialties,
  });
  return (
    <div className="container-app py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-bold">{t("specialties_title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("specialties_sub")}</p>
      </header>
      {isLoading && <p className="text-muted-foreground">{t("loading")}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((s) => (
          <div
            key={s.id}
            className="rounded-2xl border border-border bg-card p-6 hover:border-primary hover:shadow-md transition"
          >
            <div className="h-12 w-12 rounded-xl bg-primary/10 grid place-items-center text-primary">
              <Stethoscope className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-bold text-lg">
              <Link
                to="/specialties/$slug"
                params={{ slug: s.slug }}
                className="hover:text-primary"
              >
                {lang === "ar" ? s.name_ar : s.name_en}
              </Link>
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-6">
              {lang === "ar" ? s.description_ar : s.description_en}
            </p>
            <div className="mt-5 flex gap-2">
              <Link
                to="/specialties/$slug"
                params={{ slug: s.slug }}
                className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {lang === "ar" ? "المزيد" : "Read more"}
              </Link>
              <Link
                to="/book"
                search={{ specialty: s.slug }}
                className="inline-flex items-center rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                {t("cta_book")}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
