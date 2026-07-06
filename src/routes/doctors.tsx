import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Search } from "lucide-react";
import { z } from "zod";

const search = z.object({ specialty: z.string().optional() });

export const Route = createFileRoute("/doctors")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "أطباؤنا | مجمع باعشن الطبي" },
      {
        name: "description",
        content: "استشاريون وأخصائيون في مختلف التخصصات الطبية بمجمع باعشن الطبي – صبيا، جازان.",
      },
      { property: "og:title", content: "أطباؤنا — مجمع باعشن الطبي" },
    ],
  }),
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
              <div className="h-16 w-16 rounded-full bg-primary/10 text-primary grid place-items-center text-xl font-bold">
                {(lang === "ar" ? d.name_ar : d.name_en).charAt(0)}
              </div>
              <div>
                <div className="font-bold">{lang === "ar" ? d.name_ar : d.name_en}</div>
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
            <Link
              to="/book"
              search={{ doctor: d.id }}
              className="mt-4 inline-flex justify-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t("book_with_doctor")}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
