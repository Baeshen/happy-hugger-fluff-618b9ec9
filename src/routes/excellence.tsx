import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Bone, Eye, Baby, Sparkles, Stethoscope, Brain, Activity } from "lucide-react";
import { PageHero } from "@/components/PageShell";

export const Route = createFileRoute("/excellence")({
  head: () => ({
    meta: [
      { title: "مراكز التميز — مجمع باعشن الطبي" },
      { name: "description", content: "مراكز التميز في مجمع باعشن الطبي: القلب، العظام، العيون، النساء والولادة، طب الأسنان، الأعصاب، الجهاز الهضمي والجراحة التجميلية." },
      { property: "og:title", content: "مراكز التميز — مجمع باعشن الطبي" },
      { property: "og:description", content: "رعاية متخصصة في تسعة مجالات طبية." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/excellence" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/excellence" }],
  }),
  component: ExcellencePage,
});

const centers = [
  { icon: Heart, name: "مركز القلب", desc: "تشخيص وعلاج أمراض القلب والشرايين بأحدث الأجهزة." },
  { icon: Bone, name: "مركز العظام والمفاصل", desc: "علاج إصابات العظام، المفاصل، والعمود الفقري." },
  { icon: Eye, name: "مركز طب وجراحة العيون", desc: "جراحات الليزك، الشبكية، الجلوكوما، والفحوصات الشاملة." },
  { icon: Baby, name: "مركز النساء والولادة", desc: "متابعة الحمل، الولادة، وأمراض النساء." },
  { icon: Sparkles, name: "مركز الجلدية والتجميل", desc: "علاج الأمراض الجلدية وخدمات التجميل غير الجراحي." },
  { icon: Stethoscope, name: "طب الأسنان الشامل", desc: "تقويم، زراعة، حشوات تجميلية وعلاج جذور." },
  { icon: Brain, name: "مركز المخ والأعصاب", desc: "تشخيص وعلاج الصداع، الصرع، والسكتات الدماغية." },
  { icon: Activity, name: "الجهاز الهضمي والمناظير", desc: "منظار المعدة والقولون، وعلاج القولون العصبي." },
];

function ExcellencePage() {
  return (
    <>
      <PageHero
        eyebrow="مراكز التميز"
        title="رعاية متخصصة على أعلى مستوى"
        subtitle="نفخر بمراكز التميز في مجمع باعشن الطبي حيث نقدّم رعاية متكاملة برعاية أطباء استشاريين وتقنيات حديثة."
      />
      <section className="container-app py-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {centers.map((c) => (
          <div key={c.name} className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-lg transition">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-sm">
              <c.icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold">{c.name}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-6">{c.desc}</p>
            <Link to="/book" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">احجز موعد →</Link>
          </div>
        ))}
      </section>
    </>
  );
}
