import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Stethoscope } from "lucide-react";

export const Route = createFileRoute("/specialties")({
  head: () => ({
    meta: [
      { title: "التخصصات الطبية | مجمع باعشن الطبي" },
      { name: "description", content: "تخصصات طبية شاملة: الباطنة، الأطفال، النساء والولادة، الأسنان، العيون، الجراحة والمزيد في صبيا، جازان." },
      { property: "og:title", content: "التخصصات الطبية — مجمع باعشن الطبي" },
    ],
  }),
  component: SpecialtiesPage,
});

function SpecialtiesPage() {
  const { lang, t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("specialties").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
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
          <div key={s.id} className="rounded-2xl border border-border bg-card p-6 hover:border-primary hover:shadow-md transition">
            <div className="h-12 w-12 rounded-xl bg-primary/10 grid place-items-center text-primary">
              <Stethoscope className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-bold text-lg">{lang === "ar" ? s.name_ar : s.name_en}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-6">{lang === "ar" ? s.description_ar : s.description_en}</p>
            <div className="mt-5 flex gap-2">
              <Link to="/book" search={{ specialty: s.slug }} className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                {t("cta_book")}
              </Link>
              <Link to="/doctors" search={{ specialty: s.slug }} className="inline-flex items-center rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                {t("nav_doctors")}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
