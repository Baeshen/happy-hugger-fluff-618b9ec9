import { createFileRoute, Link, notFound, ErrorComponent, type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin, Phone, Clock, Siren, Building2, Stethoscope, Award, ArrowLeft, CalendarPlus } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { BranchBookingForm } from "@/components/BranchBookingForm";
import { getBranchDetail, type PublicBranch } from "@/lib/branches.functions";

const branchQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-branch", slug],
    queryFn: () => getBranchDetail({ data: { slug } }),
  });

export const Route = createFileRoute("/branches/$slug")({
  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(branchQuery(params.slug));
    if (!detail) throw notFound();
    return { detail };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "الفرع غير موجود" }, { name: "robots", content: "noindex" }] };
    }
    const b = loaderData.detail.branch;
    const title = `${b.name_ar} — مجمع باعشن الطبي`;
    const desc = b.description_ar
      ? b.description_ar.slice(0, 155)
      : `تفاصيل ${b.name_ar}: العنوان، ساعات العمل، الخدمات، ومراكز التميز.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        ...(b.hero_image_url ? [{ property: "og:image", content: b.hero_image_url }] : []),
        ...(b.hero_image_url ? [{ name: "twitter:image", content: b.hero_image_url }] : []),
      ],
    };
  },
  component: BranchDetailPage,
  errorComponent: BranchError,
  notFoundComponent: BranchNotFound,
});

function BranchError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="container-app py-16 text-center">
      <ErrorComponent error={error} />
      <button
        className="mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm"
        onClick={() => { reset(); router.invalidate(); }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

function BranchNotFound() {
  return (
    <div className="container-app py-16 text-center">
      <h1 className="text-2xl font-bold">هذا الفرع غير موجود</h1>
      <Link to="/branches" className="mt-4 inline-flex items-center gap-2 text-primary hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> العودة إلى قائمة الفروع
      </Link>
    </div>
  );
}

const DAY_LABELS: Record<string, string> = {
  sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء",
  wed: "الأربعاء", thu: "الخميس", fri: "الجمعة",
};

function formatHours(hours: PublicBranch["working_hours"]) {
  if (!hours || typeof hours !== "object") return [];
  return Object.entries(hours).map(([k, v]) => ({
    day: DAY_LABELS[k.toLowerCase()] ?? k,
    time: String(v),
  }));
}

function mapEmbed(b: PublicBranch): string | null {
  if (b.map_embed_url) return b.map_embed_url;
  if (b.lat != null && b.lng != null) {
    return `https://www.google.com/maps?q=${b.lat},${b.lng}&hl=ar&z=15&output=embed`;
  }
  return null;
}

function BranchDetailPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(branchQuery(slug));
  if (!data) return null;
  const { branch: b, centers, specialties } = data;
  const hours = formatHours(b.working_hours);
  const embed = mapEmbed(b);
  const directions =
    b.lat != null && b.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`
      : null;

  return (
    <>
      <PageHero
        eyebrow={b.city_ar ?? "فرع"}
        title={b.name_ar}
        subtitle={b.description_ar ?? "معلومات كاملة عن الفرع والخدمات المتوفرة."}
      />

      <section className="container-app py-8 grid gap-6 lg:grid-cols-3">
        {/* Sidebar: contact + actions */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="aspect-[16/9] bg-gradient-to-br from-primary/20 to-accent/20">
              {b.hero_image_url ? (
                <img src={b.hero_image_url} alt={b.name_ar} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center">
                  <Building2 className="h-14 w-14 text-primary/60" />
                </div>
              )}
            </div>
            <div className="p-4 space-y-3 text-sm">
              {b.address_ar && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{b.address_ar}</span>
                </div>
              )}
              {b.phone && (
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <a href={`tel:${b.phone}`} className="hover:text-primary" dir="ltr">{b.phone}</a>
                </div>
              )}
              {b.emergency_phone && (
                <div className="flex items-start gap-2">
                  <Siren className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  <a href={`tel:${b.emergency_phone}`} className="text-destructive font-semibold" dir="ltr">
                    طوارئ: {b.emergency_phone}
                  </a>
                </div>
              )}
            </div>

            <div className="p-4 pt-0 flex flex-col gap-2">
              <Link
                to="/book"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-95"
              >
                <CalendarPlus className="h-4 w-4" /> احجز في هذا الفرع
              </Link>
              {b.phone && (
                <a
                  href={`tel:${b.phone}`}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-primary text-primary px-4 py-2.5 text-sm font-semibold hover:bg-primary/5"
                >
                  <Phone className="h-4 w-4" /> اتصل بالفرع
                </a>
              )}
              {directions && (
                <a
                  href={directions}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm hover:bg-muted"
                >
                  <MapPin className="h-4 w-4" /> الاتجاهات على الخريطة
                </a>
              )}
            </div>
          </div>

          {hours.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold mb-3">
                <Clock className="h-4 w-4 text-primary" /> ساعات العمل
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {hours.map((h) => (
                  <div key={h.day} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{h.day}</dt>
                    <dd dir="ltr">{h.time}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </aside>

        {/* Main: map + centers + specialties */}
        <div className="lg:col-span-2 space-y-6">
          {embed && (
            <div className="rounded-2xl border border-border overflow-hidden">
              <iframe
                title={`خريطة ${b.name_ar}`}
                src={embed}
                className="w-full h-[360px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}

          {centers.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xl font-bold mb-4">
                <Award className="h-5 w-5 text-primary" /> مراكز التميز في هذا الفرع
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {centers.map((c) => (
                  <article key={c.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    {c.hero_image_url && (
                      <div className="aspect-[16/9] overflow-hidden">
                        <img src={c.hero_image_url} alt={c.name_ar} className="h-full w-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-bold">{c.name_ar}</h3>
                      {c.short_ar && <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{c.short_ar}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {specialties.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xl font-bold mb-4">
                <Stethoscope className="h-5 w-5 text-primary" /> التخصصات المتوفرة
              </h2>
              <div className="flex flex-wrap gap-2">
                {specialties.map((s) => (
                  <span key={s.id} className="rounded-full bg-muted px-3 py-1.5 text-sm text-foreground/80">
                    {s.name_ar}
                  </span>
                ))}
              </div>
            </section>
          )}

          {centers.length === 0 && specialties.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              لم يتم إضافة خدمات أو مراكز تميز لهذا الفرع بعد.
            </div>
          )}

          <section id="book">
            <BranchBookingForm branchId={b.id} branchNameAr={b.name_ar} specialties={specialties} />
          </section>

          <div>
            <Link to="/branches" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> جميع الفروع
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
