import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, PhoneCall } from "lucide-react";
import { PageHero } from "@/components/PageShell";

export const Route = createFileRoute("/insurance")({
  head: () => ({
    meta: [
      { title: "شركات التأمين المعتمدة — مجمع باعشن الطبي" },
      { name: "description", content: "قائمة شركات التأمين الصحي المعتمدة لدى مجمع باعشن الطبي في صبيا، جازان." },
      { property: "og:title", content: "شركات التأمين المعتمدة" },
      { property: "og:description", content: "اطّلع على شركات التأمين الصحي المعتمدة." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/insurance" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/insurance" }],
  }),
  component: InsurancePage,
});

const insurers = [
  { name: "بوبا العربية", coverage: "شامل" },
  { name: "التعاونية للتأمين", coverage: "شامل" },
  { name: "ملاذ للتأمين", coverage: "شامل" },
  { name: "المتحدة للتأمين التعاوني", coverage: "شامل" },
  { name: "الدرع العربي", coverage: "شامل" },
  { name: "ولاء للتأمين", coverage: "أساسي" },
  { name: "MedGulf", coverage: "شامل" },
  { name: "Tawuniya", coverage: "شامل" },
  { name: "الراجحي تكافل", coverage: "أساسي" },
  { name: "الاتحاد التجاري", coverage: "أساسي" },
  { name: "أليانز إس إف", coverage: "شامل" },
  { name: "التأمين الأهلي", coverage: "شامل" },
];

function InsurancePage() {
  return (
    <>
      <PageHero
        eyebrow="التأمين الصحي"
        title="شركات التأمين المعتمدة لدينا"
        subtitle="نقبل معظم بطاقات التأمين الصحي في المملكة. تحقّق من شركتك أدناه، أو تواصل معنا للتأكد من التغطية والفروعات المشمولة."
      />
      <section className="container-app py-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {insurers.map((i) => (
          <div key={i.name} className="rounded-xl border border-border bg-card p-5 flex items-center gap-3 hover:border-primary/40 hover:shadow-sm transition">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold truncate">{i.name}</div>
              <div className="text-[11px] text-muted-foreground">تغطية {i.coverage}</div>
            </div>
          </div>
        ))}
      </section>
      <section className="container-app pb-14">
        <div className="rounded-2xl border border-border bg-muted/40 p-6 md:p-8 flex flex-col md:flex-row items-start gap-4 justify-between">
          <div>
            <h3 className="text-xl font-bold">لم تجد شركة التأمين لديك؟</h3>
            <p className="text-sm text-muted-foreground mt-1">تواصل مع قسم التأمين لدينا للتأكد من قبول بطاقتك ومعرفة التغطية.</p>
          </div>
          <Link to="/contact" className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold shadow-sm">
            <PhoneCall className="h-4 w-4" /> تواصل مع قسم التأمين
          </Link>
        </div>
      </section>
    </>
  );
}
