import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { buildLocalBusinessSchema, buildBreadcrumbs, CLINIC_ID, SITE_URL } from "@/lib/localBusinessSchema";
import { clinicSettingsQuery, type ClinicSettings } from "@/lib/clinicSettings";
import { ArrowLeft, Phone, MapPin, Languages, GraduationCap, Briefcase, Award, Calendar, Clock, User, ClipboardCheck, XCircle, Info } from "lucide-react";

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
  gender: string | null;
  years_experience: number | null;
  education: string | null;
  experience: string | null;
  booking_enabled: boolean | null;
  branch_id: string | null;
  specialties: {
    id: string;
    slug: string;
    name_ar: string;
    name_en: string | null;
  } | null;
  branches: {
    id: string;
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
        "id, slug, name_ar, name_en, title_ar, title_en, bio_ar, bio_en, photo_url, languages, gender, years_experience, education, experience, booking_enabled, branch_id, specialties(id, slug, name_ar, name_en), branches(id, name_ar, name_en)",
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return data as unknown as Doctor;
  },
});

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function riyadhTodayIso(): string {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function formatDateLabel(iso: string, lang: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const locale = lang === "ar" ? "ar-SA" : "en-US";
  return dt.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

type AvailabilityResp = { ok: boolean; times: string[]; booked: string[] };

const availabilityQuery = (doctorId: string, date: string) => ({
  queryKey: ["doctor-availability", doctorId, date],
  queryFn: async (): Promise<AvailabilityResp> => {
    const res = await fetch(`/api/public/book/availability?doctor_id=${doctorId}&date=${date}`);
    if (!res.ok) return { ok: false, times: [], booked: [] };
    return (await res.json()) as AvailabilityResp;
  },
  staleTime: 30_000,
});

export const Route = createFileRoute("/doctors/$slug")({
  loader: async ({ params, context }) => {
    const [doctor, settings] = await Promise.all([
      context.queryClient.ensureQueryData(doctorQuery(params.slug)),
      context.queryClient.ensureQueryData(clinicSettingsQuery()),
    ]);
    return { doctor, settings };
  },
  head: ({ params, loaderData }) => {
    const ld = loaderData as { doctor: Doctor; settings: ClinicSettings } | undefined;
    if (!ld?.doctor) {
      return { meta: [{ title: "غير متوفر" }, { name: "robots", content: "noindex" }] };
    }
    const d = ld.doctor;
    const settings = ld.settings;
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
      gender: d.gender ?? undefined,
      medicalSpecialty: d.specialties?.name_en ?? d.specialties?.name_ar ?? undefined,
      hospitalAffiliation: { "@id": CLINIC_ID },
      worksFor: { "@id": CLINIC_ID },
      address: {
        "@type": "PostalAddress",
        streetAddress: settings.street_address,
        addressLocality: settings.address_locality,
        addressRegion: settings.address_region,
        postalCode: settings.postal_code ?? undefined,
        addressCountry: settings.address_country,
      },
    };

    const clinic = buildLocalBusinessSchema({ pageUrl: url, settings });
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

function AvailabilityWidget({ doctorId, bookingEnabled }: { doctorId: string; bookingEnabled: boolean }) {
  const { lang } = useI18n();
  const today = riyadhTodayIso();
  const dates = Array.from({ length: 7 }, (_, i) => addDaysIso(today, i));
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const { data, isLoading } = useQuery(availabilityQuery(doctorId, selectedDate));
  const times = data?.times ?? [];

  if (!bookingEnabled) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-bold mb-2 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" /> الحجز غير متاح
        </h3>
        <p className="text-sm text-muted-foreground">
          الحجز الإلكتروني غير متاح لهذا الطبيب حالياً. يرجى الاتصال بنا.
        </p>
        <a
          href={`tel:${SITE.phone}`}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90"
        >
          <Phone className="h-4 w-4" /> {SITE.phoneDisplay}
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" /> المواعيد المتاحة
      </h3>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {dates.map((iso) => {
          const active = iso === selectedDate;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setSelectedDate(iso)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary/50"
              }`}
            >
              {formatDateLabel(iso, lang)}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4">جاري التحميل...</div>
      ) : times.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          لا توجد مواعيد متاحة في هذا اليوم
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {times.slice(0, 9).map((t) => (
            <Link
              key={t}
              to="/book"
              search={{ doctor: doctorId, date: selectedDate, time: t } as never}
              className="rounded-lg border border-border bg-background px-2 py-2 text-center text-xs font-medium hover:border-primary hover:bg-primary/5 transition flex items-center justify-center gap-1"
              title={lang === "ar" ? "المتابعة إلى المراجعة" : "Continue to review"}
            >
              <Clock className="h-3 w-3" /> {t}
            </Link>
          ))}
        </div>
      )}

      <Link
        to="/book"
        search={{ doctor: doctorId } as never}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-3 text-sm font-bold hover:opacity-90"
      >
        عرض جميع المواعيد <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
      </Link>
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
  const branchName = d.branches
    ? lang === "ar"
      ? d.branches.name_ar
      : d.branches.name_en || d.branches.name_ar
    : null;
  const bookingEnabled = d.booking_enabled !== false;
  const genderLabel =
    d.gender === "male" ? "ذكر" : d.gender === "female" ? "أنثى" : null;

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
            <div className="h-32 w-32 rounded-2xl bg-white/15 grid place-items-center overflow-hidden shrink-0 ring-4 ring-white/20">
              {d.photo_url ? (
                <img src={d.photo_url} alt={name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-5xl font-bold">{name.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-extrabold">{name}</h1>
              {jobTitle && <div className="mt-1 text-white/85">{jobTitle}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {specName && d.specialties && (
                  <Link
                    to="/specialties/$slug"
                    params={{ slug: d.specialties.slug }}
                    className="inline-flex items-center rounded-full bg-white/15 border border-white/25 px-3 py-1 text-xs text-white hover:bg-white/25"
                  >
                    {specName}
                  </Link>
                )}
                {d.years_experience != null && d.years_experience > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/25 px-3 py-1 text-xs">
                    <Award className="h-3 w-3" /> {d.years_experience}+ سنوات خبرة
                  </span>
                )}
                {genderLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/25 px-3 py-1 text-xs">
                    <User className="h-3 w-3" /> {genderLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {bookingEnabled && (
              <Link
                to="/book"
                search={{ doctor: d.id } as never}
                className="inline-flex items-center gap-2 rounded-lg bg-white text-primary px-5 py-3 text-sm font-bold hover:bg-white/90"
              >
                احجز موعداً <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </Link>
            )}
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
          <div className="md:col-span-2 space-y-8">
            <div>
              <h2 className="text-xl font-bold mb-3">نبذة</h2>
              <p className="text-muted-foreground leading-8 whitespace-pre-line">
                {bio || "لا توجد نبذة متاحة حالياً."}
              </p>
            </div>

            {d.education && (
              <div>
                <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" /> المؤهلات العلمية
                </h2>
                <p className="text-muted-foreground leading-8 whitespace-pre-line">
                  {d.education}
                </p>
              </div>
            )}

            {d.experience && (
              <div>
                <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" /> الخبرات المهنية
                </h2>
                <p className="text-muted-foreground leading-8 whitespace-pre-line">
                  {d.experience}
                </p>
              </div>
            )}

            <BookingPolicy lang={lang} />
          </div>


          <aside className="space-y-6">
            <AvailabilityWidget doctorId={d.id} bookingEnabled={bookingEnabled} />

            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-bold mb-3">معلومات</h3>
              {specName && (
                <div className="text-sm mb-2">
                  <span className="text-muted-foreground">التخصص: </span>
                  <span className="font-medium">{specName}</span>
                </div>
              )}
              {branchName && (
                <div className="text-sm mb-2">
                  <span className="text-muted-foreground">الفرع: </span>
                  <span className="font-medium">{branchName}</span>
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
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
