import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { buildLocalBusinessSchema, buildBreadcrumbs, CLINIC_ID, SITE_URL } from "@/lib/localBusinessSchema";
import { clinicSettingsQuery, type ClinicSettings } from "@/lib/clinicSettings";
import { ArrowLeft, Phone, MapPin, Languages, GraduationCap, Briefcase, Award, Calendar, Clock, User, ClipboardCheck, XCircle, Info, Star, MessageSquare } from "lucide-react";

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
  photos: string[] | null;
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
        "id, slug, name_ar, name_en, title_ar, title_en, bio_ar, bio_en, photo_url, photos, languages, gender, years_experience, education, experience, booking_enabled, branch_id, specialties(id, slug, name_ar, name_en), branches(id, name_ar, name_en)",
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

  // Merge primary photo + gallery photos, dedupe, keep order.
  const gallery = Array.from(
    new Set([d.photo_url, ...(d.photos ?? [])].filter((u): u is string => !!u)),
  );
  const hasPhoto = gallery.length > 0;

  // Descriptive alt text: doctor + title + specialty.
  const photoAlt = [
    lang === "ar" ? `صورة ${name}` : `Photo of ${name}`,
    jobTitle,
    specName,
  ]
    .filter(Boolean)
    .join(" — ");
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("");
  const noPhotoLabel =
    lang === "ar" ? "لا تتوفر صورة لهذا الطبيب" : "No photo available for this doctor";


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
            <div
              className="h-32 w-32 rounded-2xl bg-white/15 grid place-items-center overflow-hidden shrink-0 ring-4 ring-white/20"
              role={hasPhoto ? undefined : "img"}
              aria-label={hasPhoto ? undefined : noPhotoLabel}
              title={hasPhoto ? undefined : noPhotoLabel}
            >
              {hasPhoto ? (
                <ProgressiveImage
                  src={gallery[0]}
                  alt={photoAlt}
                  className="h-full w-full"
                  imgClassName="h-full w-full object-cover"
                  loading="eager"
                  fetchPriority="high"
                  spinnerLight
                  widths={[128, 256, 384]}
                  sizes="128px"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-white/90">
                  <User className="h-10 w-10" aria-hidden />
                  <span className="text-2xl font-bold leading-none">{initials || name.charAt(0)}</span>
                </div>
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

            {gallery.length > 1 && <DoctorGallery photos={gallery} name={name} alt={photoAlt} lang={lang} />}



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

            <DoctorRatings doctorId={d.id} lang={lang} />

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

function BookingPolicy({ lang }: { lang: string }) {
  const ar = lang === "ar";
  const prep = ar
    ? [
        "احضر قبل الموعد بـ 15 دقيقة لإكمال الاستقبال.",
        "أحضر الهوية الوطنية أو الإقامة وبطاقة التأمين إن وُجدت.",
        "أحضر التقارير والأشعة والتحاليل السابقة ذات العلاقة.",
        "دوّن قائمة بالأدوية الحالية والحساسية إن وُجدت.",
        "لبعض الفحوصات (كالتحاليل والأشعة) قد يُطلب الصيام — سيتم إبلاغك مسبقًا.",
      ]
    : [
        "Arrive 15 minutes early to complete reception.",
        "Bring your National ID / Iqama and insurance card if any.",
        "Bring previous reports, scans, and lab results if related.",
        "Prepare a list of current medications and allergies.",
        "Some tests (labs/imaging) may require fasting — you will be informed in advance.",
      ];
  const policy = ar
    ? [
        "يمكن تعديل الموعد أو إلغاؤه مجانًا قبل الموعد بـ 3 ساعات على الأقل.",
        "التأخر أكثر من 15 دقيقة قد يُلغي الحجز تلقائيًا ويتطلب إعادة جدولته.",
        "عدم الحضور دون إشعار مسبق قد يؤثر على أولوية الحجوزات المستقبلية.",
        "لتعديل الموعد اتصل بنا أو استخدم رابط التأكيد المرسل عبر الرسائل النصية.",
      ]
    : [
        "You can reschedule or cancel free of charge up to 3 hours before the appointment.",
        "Arriving more than 15 minutes late may cancel the booking automatically.",
        "No-shows without prior notice may affect priority on future bookings.",
        "To modify your appointment, call us or use the confirmation link sent by SMS.",
      ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Info className="h-5 w-5 text-primary" />
        <h3 className="font-bold">
          {ar ? "قبل تأكيد الحجز" : "Before you confirm"}
        </h3>
      </div>

      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          {ar ? "تعليمات التحضير للموعد" : "Appointment preparation"}
        </div>
        <ul className="space-y-1.5 text-sm text-muted-foreground leading-6 list-disc ps-5">
          {prep.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
          <XCircle className="h-4 w-4 text-primary" />
          {ar ? "سياسة الإلغاء والتعديل" : "Cancellation & modification policy"}
        </div>
        <ul className="space-y-1.5 text-sm text-muted-foreground leading-6 list-disc ps-5">
          {policy.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {ar
          ? "بالمتابعة إلى الحجز فإنك توافق على التعليمات والسياسة أعلاه."
          : "By continuing to book, you agree to the instructions and policy above."}
      </p>
    </div>
  );
}

type RatingRow = {
  id: string;
  rating: number;
  comment: string | null;
  patient_name: string | null;
  created_at: string;
  staff_reply: string | null;
  staff_reply_at: string | null;
};
type SummaryRow = { average: number | null; count: number };

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

function DoctorRatings({ doctorId, lang }: { doctorId: string; lang: string }) {
  const ar = lang === "ar";
  const summary = useQuery({
    queryKey: ["doctor-rating-summary", doctorId],
    queryFn: async (): Promise<SummaryRow> => {
      const { data, error } = await supabase.rpc("get_public_doctor_rating_summary", { _doctor_id: doctorId });
      if (error) throw error;
      const row = (data as any[])?.[0];
      return { average: row?.average ?? null, count: Number(row?.count ?? 0) };
    },
    staleTime: 60_000,
  });
  const list = useQuery({
    queryKey: ["doctor-ratings", doctorId],
    queryFn: async (): Promise<RatingRow[]> => {
      const { data, error } = await supabase.rpc("list_public_doctor_ratings", { _doctor_id: doctorId, _limit: 20 });
      if (error) throw error;
      return (data as RatingRow[]) ?? [];
    },
    staleTime: 60_000,
  });

  const [showAll, setShowAll] = useState(false);
  const items = list.data ?? [];
  const shown = showAll ? items : items.slice(0, 5);
  const count = summary.data?.count ?? 0;
  const avg = summary.data?.average ?? 0;
  const locale = ar ? "ar-SA" : "en-US";

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        {ar ? "تقييمات المرضى" : "Patient reviews"}
      </h2>

      <div className="rounded-2xl border border-border bg-card p-6 mb-4">
        {summary.isLoading ? (
          <div className="text-sm text-muted-foreground">{ar ? "جاري التحميل..." : "Loading..."}</div>
        ) : count === 0 ? (
          <div className="text-sm text-muted-foreground">
            {ar ? "لا توجد تقييمات لهذا الطبيب بعد." : "No reviews for this doctor yet."}
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <div className="text-center">
              <div className="text-4xl font-extrabold text-primary leading-none">
                {Number(avg).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{ar ? "من ٥" : "out of 5"}</div>
            </div>
            <div>
              <Stars value={Number(avg)} size={20} />
              <div className="mt-1 text-sm text-muted-foreground">
                {ar
                  ? `بناءً على ${count.toLocaleString(locale)} مراجعة`
                  : `Based on ${count.toLocaleString(locale)} reviews`}
              </div>
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="space-y-3">
          {shown.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold">
                    {(r.patient_name ?? "?").charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">
                      {r.patient_name || (ar ? "مريض" : "Patient")}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}
                    </div>
                  </div>
                </div>
                <Stars value={r.rating} />
              </div>
              {r.comment && (
                <p className="text-sm text-muted-foreground leading-7 whitespace-pre-line">{r.comment}</p>
              )}
              {r.staff_reply && (
                <div className="mt-3 rounded-lg bg-muted/50 border border-border p-3">
                  <div className="text-xs font-semibold text-primary mb-1">
                    {ar ? "رد المجمع" : "Clinic reply"}
                  </div>
                  <p className="text-sm text-muted-foreground leading-6 whitespace-pre-line">{r.staff_reply}</p>
                </div>
              )}
            </div>
          ))}
          {items.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-sm font-medium text-primary hover:underline"
            >
              {showAll
                ? (ar ? "عرض أقل" : "Show less")
                : (ar ? `عرض جميع المراجعات (${items.length})` : `Show all reviews (${items.length})`)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DoctorGallery({ photos, name, alt, lang }: { photos: string[]; name: string; alt: string; lang: string }) {
  const ar = lang === "ar";
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const total = photos.length;
  const go = (dir: 1 | -1) => setActive((i) => (i + dir + total) % total);
  const titleId = useId();
  const descId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const caption = `${alt} — ${ar ? "صورة" : "Photo"} ${active + 1} ${ar ? "من" : "of"} ${total}`;

  // Keyboard: Esc closes, Arrow keys navigate (respect RTL), Home/End jump.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
      if (total <= 1) return;
      const prevKey = ar ? "ArrowRight" : "ArrowLeft";
      const nextKey = ar ? "ArrowLeft" : "ArrowRight";
      if (e.key === prevKey) { e.preventDefault(); go(-1); }
      else if (e.key === nextKey) { e.preventDefault(); go(1); }
      else if (e.key === "Home") { e.preventDefault(); setActive(0); }
      else if (e.key === "End") { e.preventDefault(); setActive(total - 1); }
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while lightbox is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog and return it on close.
    closeBtnRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus();
    };
  }, [open, total, ar]);

  // Prefetch neighboring images while the lightbox is open so navigation
  // between photos feels instant. Uses the Image() constructor to warm the
  // browser cache without inserting extra DOM nodes.
  useEffect(() => {
    if (!open || total <= 1) return;
    const neighbors = [
      photos[(active + 1) % total],
      photos[(active - 1 + total) % total],
    ];
    const loaders = neighbors
      .filter((src): src is string => Boolean(src) && src !== photos[active])
      .map((src) => {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        return img;
      });
    return () => {
      // Drop refs so the browser can cancel/GC if not yet resolved.
      loaders.forEach((img) => {
        img.src = "";
      });
    };
  }, [open, active, total, photos]);


  return (
    <div>
      <h2 className="text-xl font-bold mb-3">{ar ? "معرض الصور" : "Gallery"}</h2>

      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full overflow-hidden rounded-2xl border border-border bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={ar ? `عرض الصورة بالحجم الكامل — ${alt}` : `View full size — ${alt}`}
      >
        <ProgressiveImage
          src={photos[active]}
          alt={`${alt} (${active + 1}/${total})`}
          className="aspect-[16/10] w-full"
          imgClassName="h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
          widths={[480, 768, 1024, 1440]}
          sizes="(min-width: 768px) 66vw, 100vw"
        />

      </button>

      <div
        className="mt-3 grid grid-cols-5 gap-2"
        role="listbox"
        aria-label={ar ? "الصور المصغّرة" : "Photo thumbnails"}
      >
        {photos.map((src, i) => (
          <button
            key={src + i}
            type="button"
            role="option"
            onClick={() => setActive(i)}
            className={`aspect-square overflow-hidden rounded-lg border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              i === active ? "border-primary" : "border-transparent hover:border-primary/40"
            }`}
            aria-label={`${ar ? "عرض الصورة" : "View photo"} ${i + 1} ${ar ? "من" : "of"} ${total} — ${name}`}
            aria-selected={i === active}
            aria-current={i === active ? "true" : undefined}
          >
            <ProgressiveImage
              src={src}
              alt=""
              ariaHidden
              className="h-full w-full"
              imgClassName="h-full w-full object-cover"
              loading="lazy"
              widths={[128, 192, 256]}
              sizes="(min-width: 768px) 130px, 20vw"
            />
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onClick={() => setOpen(false)}
        >
          <h3 id={titleId} className="sr-only">
            {ar ? `معرض صور ${name}` : `${name} photo gallery`}
          </h3>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={ar ? "إغلاق العارض (Esc)" : "Close viewer (Esc)"}
          >
            <XCircle className="h-6 w-6" aria-hidden />
          </button>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                className="absolute start-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={ar ? "الصورة السابقة" : "Previous photo"}
                aria-controls={descId}
              >
                <ArrowLeft className="h-6 w-6 rtl:rotate-180" aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                className="absolute end-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={ar ? "الصورة التالية" : "Next photo"}
                aria-controls={descId}
              >
                <ArrowLeft className="h-6 w-6 rotate-180 rtl:rotate-0" aria-hidden />
              </button>
            </>
          )}

          <figure
            id={descId}
            className="flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
            aria-live="polite"
            aria-atomic="true"
          >
            <ProgressiveImage
              src={photos[active]}
              alt={caption}
              className="max-h-[80vh] max-w-[92vw]"
              imgClassName="max-h-[80vh] max-w-[92vw] object-contain rounded-lg"
              loading="eager"
              fetchPriority="high"
              spinnerLight
              widths={[768, 1024, 1440, 1920]}
              sizes="92vw"
            />
            <figcaption className="text-white/90 text-sm text-center max-w-[92vw]">
              <span className="block">{alt}</span>
              <span className="block text-white/70 text-xs mt-1">
                {ar
                  ? `صورة ${active + 1} من ${total} — استخدم الأسهم للتنقل و Esc للإغلاق`
                  : `Photo ${active + 1} of ${total} — use arrow keys to navigate, Esc to close`}
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

/**
 * Progressive image with a skeleton shimmer that fades away once the
 * image has loaded. Uses native lazy loading + async decoding by default.
 */
/**
 * Rewrites a Supabase Storage public object URL to the on-the-fly render
 * endpoint with a width query. Returns the original URL for any other host
 * so external images still work (browser will just ignore the srcset entry).
 */
function withWidth(src: string, width: number): string {
  try {
    const u = new URL(src, typeof window !== "undefined" ? window.location.href : "http://localhost");
    if (u.pathname.includes("/storage/v1/object/public/")) {
      u.pathname = u.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
    }
    if (u.pathname.includes("/storage/v1/render/image/public/")) {
      u.searchParams.set("width", String(width));
      u.searchParams.set("quality", "80");
      return u.toString();
    }
  } catch {
    /* ignore malformed URL */
  }
  return src;
}

function buildSrcSet(src: string, widths: number[]): string | undefined {
  const rewritten = widths.map((w) => `${withWidth(src, w)} ${w}w`);
  // Only emit srcset when at least one entry actually differs from the src
  // (i.e. the URL supports transformation) — otherwise skip to avoid
  // repeating the same URL at every descriptor.
  const usable = widths.some((w) => withWidth(src, w) !== src);
  return usable ? rewritten.join(", ") : undefined;
}

function ProgressiveImage({
  src,
  alt,
  className = "",
  imgClassName = "",
  loading = "lazy",
  fetchPriority,
  ariaHidden,
  spinnerLight,
  widths,
  sizes,
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  ariaHidden?: boolean;
  spinnerLight?: boolean;
  /** Candidate widths in px. When provided, an srcSet is built. */
  widths?: number[];
  /** CSS `sizes` attribute — required for `widths` to be effective. */
  sizes?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Reset when the src changes.
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  const srcSet = widths && widths.length ? buildSrcSet(src, widths) : undefined;

  const isLoading = !loaded && !failed;

  return (
    <div
      className={`relative overflow-hidden bg-muted ${className}`}
      aria-busy={isLoading || undefined}
    >
      {isLoading && (
        <div
          className={`absolute inset-0 ${
            spinnerLight ? "skeleton-shimmer-light" : "skeleton-shimmer"
          }`}
          aria-hidden="true"
          role="presentation"
        />
      )}
      <img
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={ariaHidden ? "" : alt}
        aria-hidden={ariaHidden || undefined}
        role={ariaHidden ? "presentation" : undefined}
        loading={loading}
        decoding="async"
        // React types accept the camelCase prop; DOM lowercases at render.
        {...(fetchPriority ? { fetchpriority: fetchPriority } : {})}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`${imgClassName} transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );

}
