import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { buildLocalBusinessSchema, buildBreadcrumbs, CLINIC_ID, SITE_URL } from "@/lib/localBusinessSchema";
import { ArrowLeft, Phone, MapPin, Languages } from "lucide-react";

type Doctor = {
  id: string;
  slug: string | null;
  name_ar: string;
  name_en: string | null;
  title_ar: string | null;
  title_en: string | null;
  bio_ar: string | null;
  bio_en: string | null;
  photo_url: string | null;
  languages: string[] | null;
  specialties: {
    id: string;
    slug: string;
    name_ar: string;
    name_en: string | null;
  } | null;
};

const doctorQuery = (slug: string) => ({
  queryKey: ["doctor", slug],
  queryFn: async (): Promise<Doctor> => {
    const { data, error } = await supabase
      .from("doctors")
      .select(
        "id, slug, name_ar, name_en, title_ar, title_en, bio_ar, bio_en, photo_url, languages, specialties(id, slug, name_ar, name_en)",
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return data as unknown as Doctor;
  },
});

export const Route = createFileRoute("/doctors/$slug")({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(doctorQuery(params.slug)),
  head: ({ params, loaderData }) => {
    const d = loaderData as Doctor | undefined;
    if (!d) {
      return { meta: [{ title: "غير متوفر" }, { name: "robots", content: "noindex" }] };
    }
    const url = `${SITE_URL}/doctors/${params.slug}`;
    const specName = d.specialties?.name_ar ?? "";
    const title = `${d.name_ar}${specName ? ` — ${specName}` : ""} | مجمع باعشن الطبي`;
    const desc = (
      d.bio_ar ||
      `${d.name_ar} ${d.title_ar ?? ""} في ${specName} بمجمع باعشن الطبي بصبيا، جازان. احجز موعداً الآن.`
    ).slice(0, 155);

    const physician = {
      "@context": "https://schema.org",
      "@type": "Physician",
      "@id": url,
      name: d.name_ar,
      alternateName: d.name_en ?? undefined,
      jobTitle: d.title_ar ?? undefined,
      image: d.photo_url ?? undefined,
      description: d.bio_ar ?? undefined,
      url,
      knowsLanguage: d.languages ?? undefined,
      medicalSpecialty: d.specialties?.name_en ?? d.specialties?.name_ar ?? undefined,
      hospitalAffiliation: { "@id": CLINIC_ID },
      worksFor: { "@id": CLINIC_ID },
      address: {
        "@type": "PostalAddress",
        streetAddress: SITE.addressAr,
        addressLocality: "صبيا",
        addressRegion: "جازان",
        postalCode: SITE.postalCode,
        addressCountry: "SA",
      },
    };

    const clinic = buildLocalBusinessSchema({ pageUrl: url });
    const breadcrumbs = buildBreadcrumbs([
      { name: "الرئيسية", path: "/" },
      { name: "الأطباء", path: "/doctors" },
      { name: d.name_ar, path: `/doctors/${params.slug}` },
    ]);

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: url },
        { property: "og:locale", content: "ar_SA" },
        ...(d.photo_url ? [{ property: "og:image", content: d.photo_url }] : []),
        { name: "twitter:card", content: d.photo_url ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(clinic) },
        { type: "application/ld+json", children: JSON.stringify(physician) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbs) },
      ],
    };
  },
  notFoundComponent: DoctorNotFound,
  errorComponent: DoctorError,
  component: DoctorDetail,
});

function DoctorNotFound() {
  return (
    <div className="container-app py-20 text-center">
      <h1 className="text-3xl font-bold">الطبيب غير موجود</h1>
      <Link to="/doctors" className="mt-4 inline-block text-primary hover:underline">
        عرض جميع الأطباء
      </Link>
    </div>
  );
}

function DoctorError({ reset }: { reset: () => void }) {
  return (
    <div className="container-app py-20 text-center">
      <h1 className="text-3xl font-bold">حدث خطأ</h1>
      <button
        onClick={reset}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

function DoctorDetail() {
  const { slug } = Route.useParams();
  const { lang } = useI18n();
  const { data: d } = useSuspenseQuery(doctorQuery(slug));
  const name = lang === "ar" ? d.name_ar : d.name_en || d.name_ar;
  const jobTitle = lang === "ar" ? d.title_ar : d.title_en;
  const bio = lang === "ar" ? d.bio_ar : d.bio_en;
  const specName = d.specialties
    ? lang === "ar"
      ? d.specialties.name_ar
      : d.specialties.name_en || d.specialties.name_ar
    : null;

  return (
    <div>
      <section className="hero-gradient text-white py-14">
        <div className="container-app">
          <nav className="text-xs text-white/80 mb-4">
            <Link to="/" className="hover:underline">الرئيسية</Link>
            <span className="mx-2">/</span>
            <Link to="/doctors" className="hover:underline">الأطباء</Link>
            <span className="mx-2">/</span>
            <span className="text-white">{name}</span>
          </nav>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="h-28 w-28 rounded-full bg-white/15 grid place-items-center overflow-hidden shrink-0">
              {d.photo_url ? (
                <img src={d.photo_url} alt={name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-4xl font-bold">{name.charAt(0)}</span>
              )}
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold">{name}</h1>
              {jobTitle && <div className="mt-1 text-white/85">{jobTitle}</div>}
              {specName && d.specialties && (
                <Link
                  to="/specialties/$slug"
                  params={{ slug: d.specialties.slug }}
                  className="mt-2 inline-flex text-sm text-white underline underline-offset-4"
                >
                  {specName}
                </Link>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/book"
              search={{ doctor: d.id }}
              className="inline-flex items-center gap-2 rounded-lg bg-white text-primary px-5 py-3 text-sm font-bold hover:bg-white/90"
            >
              احجز موعداً <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
            <a
              href={`tel:${SITE.phone}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 border border-white/25 px-5 py-3 text-sm font-bold hover:bg-white/20"
            >
              <Phone className="h-4 w-4" /> {SITE.phoneDisplay}
            </a>
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="container-app grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            <h2 className="text-xl font-bold mb-3">نبذة</h2>
            <p className="text-muted-foreground leading-8 whitespace-pre-line">
              {bio || "لا توجد نبذة متاحة حالياً."}
            </p>
          </div>
          <aside className="rounded-2xl border border-border bg-card p-6 h-fit">
            <h3 className="font-bold mb-3">معلومات</h3>
            {specName && (
              <div className="text-sm mb-2">
                <span className="text-muted-foreground">التخصص: </span>
                <span className="font-medium">{specName}</span>
              </div>
            )}
            {d.languages && d.languages.length > 0 && (
              <div className="text-sm flex items-start gap-2 mb-2">
                <Languages className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>{d.languages.join("، ")}</span>
              </div>
            )}
            <div className="text-sm flex items-start gap-2 mb-2">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>{lang === "ar" ? SITE.addressAr : SITE.addressEn}</span>
            </div>
            <div className="text-sm flex items-start gap-2">
              <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <a href={`tel:${SITE.phone}`} className="hover:text-primary">
                {SITE.phoneDisplay}
              </a>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
