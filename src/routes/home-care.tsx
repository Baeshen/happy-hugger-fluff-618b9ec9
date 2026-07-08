import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeIcon, Syringe, Stethoscope, Activity, Baby, Pill } from "lucide-react";
import { PageHero, SectionCard } from "@/components/PageShell";

export const Route = createFileRoute("/home-care")({
  head: () => ({
    meta: [
      { title: "الرعاية المنزلية — مجمع باعشن الطبي" },
      { name: "description", content: "خدمات طبية منزلية: زيارة طبيب، تمريض، سحب عينات، علاج طبيعي وأدوية بالمنزل في محافظة صبيا وجازان." },
      { property: "og:title", content: "الرعاية المنزلية — مجمع باعشن الطبي" },
      { property: "og:description", content: "رعاية طبية متكاملة بمنزلك." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/home-care" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/home-care" }],
  }),
  component: HomeCarePage,
});

function HomeCarePage() {
  return (
    <>
      <PageHero
        eyebrow="خدمة منزلية"
        title="رعاية طبية متكاملة بمنزلك"
        subtitle="لكبار السن ومرضى الأمراض المزمنة ومن يصعب عليهم الوصول للمجمع — فريقنا يزورك في المنزل."
      >
        <Link to="/contact" className="rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground px-5 py-2.5 font-semibold shadow-sm">
          اطلب زيارة منزلية
        </Link>
      </PageHero>
      <section className="container-app py-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard icon={<Stethoscope className="h-5 w-5" />} title="زيارة طبيب بالمنزل" desc="كشف وتشخيص من طبيب مؤهل في منزلك." />
        <SectionCard icon={<HomeIcon className="h-5 w-5" />} title="خدمات تمريض" desc="جرعات، ضمادات، رعاية جروح وقسطرة، متابعة يومية." />
        <SectionCard icon={<Syringe className="h-5 w-5" />} title="سحب عينات مختبر" desc="سحب عينة من المنزل وتوصيل النتائج إلكترونياً." />
        <SectionCard icon={<Activity className="h-5 w-5" />} title="علاج طبيعي" desc="جلسات إعادة تأهيل ما بعد الجراحة أو الإصابات." />
        <SectionCard icon={<Baby className="h-5 w-5" />} title="رعاية الأطفال" desc="تطعيمات ومتابعة نمو الرضّع في بيئة مألوفة." />
        <SectionCard icon={<Pill className="h-5 w-5" />} title="توصيل الأدوية" desc="من صيدلية باعشن بضمان سلسلة التبريد للأدوية الحسّاسة." />
      </section>
    </>
  );
}
