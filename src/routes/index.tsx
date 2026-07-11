import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { QuickBar } from "@/components/QuickBar";
import { SITE } from "@/lib/site";
import { ShieldCheck, Pill, Users, ArrowLeft, Stethoscope } from "lucide-react";
import { buildLocalBusinessSchema, SITE_URL } from "@/lib/localBusinessSchema";
import { clinicSettingsQuery, type ClinicSettings } from "@/lib/clinicSettings";
import { StatsBar } from "@/components/home/StatsBar";
import { AwardsMarquee } from "@/components/home/AwardsMarquee";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clinicSettingsQuery()),
  head: ({ loaderData }) => ({
    meta: [
      { title: "مجمع باعشن الطبي — رعايتك تبدأ هنا | Baeshen Medical" },
      {
        name: "description",
        content:
          "احجز موعدك مع أطباء استشاريين في صبيا، جازان أو اطلب دواءك من صيدليات باعشن. مجمع طبي معتمد من CBAHI.",
      },
      { property: "og:title", content: "مجمع باعشن الطبي — رعايتك تبدأ هنا" },
      { property: "og:description", content: "خدمات طبية تخصصية وصيدلية داخلية في صبيا، جازان." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildLocalBusinessSchema({
            pageUrl: SITE_URL,
            settings: loaderData as ClinicSettings | undefined,
          }),
        ),
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { t, lang } = useI18n();
  const { data: specialties } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors_featured"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("*, specialties(*)")
        .eq("is_active", true)
        .limit(4);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      {/* Hero */}
      <section className="hero-gradient text-white pb-20 pt-16">
        <div className="container-app grid gap-10 md:grid-cols-2 items-center">
          <div>
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              {lang === "ar" ? "معتمد من CBAHI · صبيا – جازان" : "CBAHI Accredited · Sabya – Jazan"}
            </span>
            <h1 className="mt-4 text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight">
              {t("hero_title")}
            </h1>
            <p className="mt-4 text-white/90 text-lg leading-8 max-w-xl">{t("hero_sub")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/book"
                className="inline-flex items-center gap-2 rounded-lg bg-white text-primary px-5 py-3 text-sm font-bold hover:bg-white/90"
              >
                {t("cta_book")} <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </Link>
              <Link
                to="/pharmacy"
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 border border-white/25 backdrop-blur px-5 py-3 text-sm font-bold hover:bg-white/20"
              >
                <Pill className="h-4 w-4" /> {t("cta_medicine")}
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="relative aspect-[4/3] rounded-3xl bg-white/10 border border-white/20 backdrop-blur overflow-hidden shadow-2xl">
              <div className="absolute inset-0 grid place-items-center opacity-30 text-white">
                <Stethoscope className="h-40 w-40" />
              </div>
              <div className="absolute bottom-6 start-6 end-6 grid grid-cols-3 gap-3">
                {[
                  { n: "14+", l: lang === "ar" ? "تخصص" : "Specialties" },
                  { n: "24/7", l: lang === "ar" ? "طوارئ" : "Emergency" },
                  { n: "CBAHI", l: lang === "ar" ? "اعتماد" : "Accredited" },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl bg-white/15 backdrop-blur p-3 text-center">
                    <div className="text-lg font-bold">{s.n}</div>
                    <div className="text-[11px] opacity-90">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <QuickBar />

      <StatsBar />

      {/* Specialties grid */}
      <section className="py-16">
        <div className="container-app">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold">{t("specialties_title")}</h2>
              <p className="mt-2 text-muted-foreground">{t("specialties_sub")}</p>
            </div>
            <Link
              to="/specialties"
              className="hidden md:inline text-sm font-semibold text-primary hover:underline"
            >
              {t("all_specialties")} →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {specialties?.slice(0, 12).map((s) => (
              <Link
                key={s.id}
                to="/book"
                search={{ specialty: s.slug }}
                className="group rounded-2xl border border-border bg-card p-5 hover:border-primary hover:shadow-md transition"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary group-hover:bg-primary group-hover:text-white transition">
                  <Stethoscope className="h-5 w-5" />
                </div>
                <div className="mt-3 font-semibold text-sm">
                  {lang === "ar" ? s.name_ar : s.name_en}
                </div>
                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {lang === "ar" ? s.description_ar : s.description_en}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why Baeshen */}
      <section className="py-16 bg-muted/40">
        <div className="container-app">
          <h2 className="text-3xl font-bold text-center">{t("why_title")}</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { icon: ShieldCheck, title: t("why_1_title"), desc: t("why_1_desc") },
              { icon: Pill, title: t("why_2_title"), desc: t("why_2_desc") },
              { icon: Users, title: t("why_3_title"), desc: t("why_3_desc") },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl bg-card border border-border p-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-bold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-6">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured doctors */}
      <section className="py-16">
        <div className="container-app">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold">{t("doctors_title")}</h2>
              <p className="mt-2 text-muted-foreground">{t("doctors_sub")}</p>
            </div>
            <Link
              to="/doctors"
              className="hidden md:inline text-sm font-semibold text-primary hover:underline"
            >
              {t("nav_doctors")} →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {doctors?.map((d) => (
              <div key={d.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="h-20 w-20 rounded-full bg-primary/10 text-primary grid place-items-center text-2xl font-bold mx-auto">
                  {(lang === "ar" ? d.name_ar : d.name_en).charAt(0)}
                </div>
                <div className="mt-4 text-center">
                  <div className="font-bold">{lang === "ar" ? d.name_ar : d.name_en}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {lang === "ar" ? d.title_ar : d.title_en}
                  </div>
                </div>
                <Link
                  to="/book"
                  search={{ doctor: d.id }}
                  className="mt-4 block text-center rounded-lg bg-primary/10 text-primary px-3 py-2 text-xs font-semibold hover:bg-primary hover:text-white transition"
                >
                  {t("book_with_doctor")}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Map/Location */}
      <section className="py-16 bg-muted/40">
        <div className="container-app grid gap-8 md:grid-cols-2 items-center">
          <div>
            <h2 className="text-3xl font-bold">{lang === "ar" ? "موقعنا" : "Find us"}</h2>
            <p className="mt-3 text-muted-foreground">
              {lang === "ar" ? SITE.addressAr : SITE.addressEn}
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              {lang === "ar"
                ? `الرمز البريدي ${SITE.postalCode}`
                : `Postal code ${SITE.postalCode}`}
            </p>
            <a
              href={SITE.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {lang === "ar" ? "الخريطة" : "Open in Maps"}
            </a>
          </div>
          <div className="aspect-video rounded-2xl overflow-hidden border border-border shadow-sm">
            <iframe
              title="map"
              className="w-full h-full"
              loading="lazy"
              src={`https://maps.google.com/maps?q=${SITE.lat},${SITE.lng}&z=15&output=embed`}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
