import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Phone, Clock, ArrowLeft, Building2 } from "lucide-react";
import { PageHero, SectionCard } from "@/components/PageShell";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/branches")({
  head: () => ({
    meta: [
      { title: "مستشفياتنا وفروعنا — مجمع باعشن الطبي" },
      { name: "description", content: "تعرّف على فروع مجمع باعشن الطبي في محافظة صبيا وجازان مع مواعيد العمل والخدمات المتاحة في كل فرع." },
      { property: "og:title", content: "مستشفياتنا وفروعنا — مجمع باعشن الطبي" },
      { property: "og:description", content: "قائمة فروع مجمع باعشن الطبي بمواعيدها وخدماتها." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/branches" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/branches" }],
  }),
  component: BranchesPage,
});

function BranchesPage() {
  const branches = [
    {
      name: "فرع صبيا الرئيسي",
      city: "صبيا – جازان",
      address: SITE.addressAr,
      phone: SITE.phoneDisplay,
      phoneRaw: SITE.phone,
      hours: "السبت – الأربعاء: 9ص – 9م | الخميس: 9ص – 1م",
      services: ["عيادات تخصصية", "صيدلية داخلية", "مختبر", "أشعة", "طوارئ محدودة"],
      map: SITE.mapsUrl,
      badge: "الرئيسي",
    },
  ];

  return (
    <>
      <PageHero
        eyebrow="مستشفياتنا"
        title="فروع مجمع باعشن الطبي"
        subtitle="شبكة رعاية صحية في محافظة صبيا وجازان، نعمل على توسيع تغطيتنا الجغرافية لخدمتك أينما كنت."
      />
      <section className="container-app py-10 grid gap-6 md:grid-cols-2">
        {branches.map((b) => (
          <div key={b.name} className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="aspect-[16/8] bg-gradient-to-br from-primary/20 to-accent/20 grid place-items-center">
              <Building2 className="h-14 w-14 text-primary/60" />
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold">{b.name}</h2>
                <span className="text-[11px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold">{b.badge}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{b.city}</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-primary" /><a href={b.map} target="_blank" rel="noreferrer" className="hover:text-primary">{b.address}</a></li>
                <li className="flex items-start gap-2"><Phone className="h-4 w-4 mt-0.5 text-primary" /><a href={`tel:${b.phoneRaw}`} className="hover:text-primary">{b.phone}</a></li>
                <li className="flex items-start gap-2"><Clock className="h-4 w-4 mt-0.5 text-primary" /><span>{b.hours}</span></li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {b.services.map((s) => (
                  <span key={s} className="text-[11px] rounded-md bg-muted px-2 py-1 text-foreground/80">{s}</span>
                ))}
              </div>
              <div className="mt-5 flex gap-2">
                <Link to="/book" className="flex-1 text-center rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-95">احجز في هذا الفرع</Link>
                <a href={b.map} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">الخريطة</a>
              </div>
            </div>
          </div>
        ))}

        <SectionCard
          icon={<Building2 className="h-5 w-5" />}
          title="قريباً — توسّع في جازان"
          desc="نعمل على افتتاح فروع جديدة في مدن جازان وأبو عريش وصامطة لخدمتك بشكل أوسع."
        >
          <Link to="/contact" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            اقترح موقعاً جديداً <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </SectionCard>
      </section>
    </>
  );
}
