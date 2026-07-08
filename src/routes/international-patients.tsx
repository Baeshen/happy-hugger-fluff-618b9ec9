import { createFileRoute, Link } from "@tanstack/react-router";
import { Plane, Hotel, Languages, FileText, ShieldCheck } from "lucide-react";
import { PageHero, SectionCard } from "@/components/PageShell";

export const Route = createFileRoute("/international-patients")({
  head: () => ({
    meta: [
      { title: "المرضى الدوليون — مجمع باعشن الطبي" },
      { name: "description", content: "خدمات متكاملة للمرضى الدوليين: تأشيرة علاجية، حجز فندق، مترجم طبي، ومتابعة ما بعد العلاج." },
      { property: "og:title", content: "خدمات المرضى الدوليين" },
      { property: "og:description", content: "دعم متكامل للمرضى الدوليين." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/international-patients" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/international-patients" }],
  }),
  component: IntlPage,
});

function IntlPage() {
  return (
    <>
      <PageHero
        eyebrow="International Patients"
        title="نرحّب بالمرضى من خارج المملكة"
        subtitle="نُقدّم دعماً متكاملاً للمرضى الدوليين — من التأشيرة إلى الإقامة والترجمة الطبية والمتابعة."
      >
        <Link to="/contact" className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold">
          تواصل مع مكتب المرضى الدوليين
        </Link>
      </PageHero>
      <section className="container-app py-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard icon={<Plane className="h-5 w-5" />} title="التأشيرة الطبية" desc="نقدم خطاباً معتمداً لدعم طلب التأشيرة العلاجية." />
        <SectionCard icon={<Hotel className="h-5 w-5" />} title="الإقامة والفندق" desc="عروض خاصة مع فنادق شريكة قريبة من المجمع." />
        <SectionCard icon={<Languages className="h-5 w-5" />} title="مترجم طبي" desc="خدمة ترجمة عربية-إنجليزية-أوردو-سواحيلية." />
        <SectionCard icon={<FileText className="h-5 w-5" />} title="ملف طبي مُترجم" desc="جميع تقاريرك الطبية باللغة التي تختارها." />
        <SectionCard icon={<ShieldCheck className="h-5 w-5" />} title="تنسيق التأمين الدولي" desc="نتعامل مع شبكات تأمين إقليمية ودولية." />
      </section>
    </>
  );
}
