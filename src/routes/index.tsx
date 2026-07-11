import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { QuickBar } from "@/components/QuickBar";
import { SITE } from "@/lib/site";
import { Stethoscope } from "lucide-react";
import { buildLocalBusinessSchema } from "@/lib/localBusinessSchema";
import { clinicSettingsQuery, type ClinicSettings } from "@/lib/clinicSettings";
import { StatsBar } from "@/components/home/StatsBar";
import { AwardsMarquee } from "@/components/home/AwardsMarquee";
import { HeroSlider } from "@/components/home/HeroSlider";
import { WhyChooseUs } from "@/components/home/WhyChooseUs";

const HOME_URL = "https://bashenmedical.com/";
const HOME_TITLE =
  "مجمع باعشن الطبي بصبيا جازان — حجز أطباء استشاريين وصيدلية | Baeshen Medical";
const HOME_DESC =
  "مجمع باعشن الطبي في صبيا، جازان — معتمد من CBAHI. احجز موعدك مع استشاريين في الباطنة والأطفال والنساء والولادة والأسنان والعيون، واطلب دواءك من صيدلياتنا مع خدمة رعاية منزلية.";
const HOME_OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/da5ecdb6-8fc6-4806-a4f3-419040820761/id-preview-7a856abf--550c7bc5-80b4-4118-853f-28cc7bd42f26.lovable.app-1783385951418.png";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clinicSettingsQuery()),
  head: ({ loaderData }) => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESC },
      {
        name: "keywords",
        content:
          "مجمع باعشن الطبي, باعشن, مستشفى صبيا, أطباء جازان, حجز طبيب صبيا, صيدلية صبيا, رعاية منزلية جازان, CBAHI, Baeshen Medical, Sabya, Jazan",
      },
      { name: "author", content: "Baeshen Medical Complex" },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { name: "theme-color", content: "#0f766e" },
      // Open Graph
      { property: "og:site_name", content: "Baeshen Medical" },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: HOME_URL },
      { property: "og:locale", content: "ar_SA" },
      { property: "og:locale:alternate", content: "en_US" },
      { property: "og:image", content: HOME_OG_IMAGE },
      { property: "og:image:alt", content: "مجمع باعشن الطبي بصبيا، جازان" },
      // Twitter
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: HOME_TITLE },
      { name: "twitter:description", content: HOME_DESC },
      { name: "twitter:image", content: HOME_OG_IMAGE },
      { name: "twitter:image:alt", content: "مجمع باعشن الطبي بصبيا، جازان" },
    ],
    links: [
      { rel: "canonical", href: HOME_URL },
      { rel: "alternate", hrefLang: "ar-SA", href: HOME_URL },
      { rel: "alternate", hrefLang: "en", href: HOME_URL },
      { rel: "alternate", hrefLang: "x-default", href: HOME_URL },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildLocalBusinessSchema({
            pageUrl: HOME_URL,
            settings: loaderData as ClinicSettings | undefined,
          }),
        ),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Baeshen Medical",
          alternateName: "مجمع باعشن الطبي",
          url: HOME_URL,
          inLanguage: ["ar-SA", "en"],
          potentialAction: {
            "@type": "SearchAction",
            target: `${HOME_URL}health/search?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }),
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
      <HeroSlider />

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

      <WhyChooseUs />

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

      <AwardsMarquee />

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
