import { createFileRoute, Link } from "@tanstack/react-router";
import { Video, Clock, ShieldCheck, Smartphone, MessageCircle, CheckCircle2 } from "lucide-react";
import { PageHero, SectionCard } from "@/components/PageShell";

export const Route = createFileRoute("/telemedicine")({
  head: () => ({
    meta: [
      { title: "الاستشارة الطبية عن بُعد — مجمع باعشن الطبي" },
      { name: "description", content: "احجز استشارة طبية بالفيديو مع أطباء مجمع باعشن الطبي من منزلك، مع وصفة إلكترونية وتوصيل الدواء." },
      { property: "og:title", content: "الاستشارة الطبية عن بُعد" },
      { property: "og:description", content: "استشر طبيبك أونلاين بالفيديو." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/telemedicine" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/telemedicine" }],
  }),
  component: TelemedicinePage,
});

function TelemedicinePage() {
  return (
    <>
      <PageHero
        eyebrow="خدمة عن بُعد"
        title="طبيبك أونلاين — أينما كنت"
        subtitle="استشارة طبية بالفيديو مع أطبائنا الاستشاريين، مع وصفة إلكترونية وتوصيل الدواء عبر صيدلياتنا."
      >
        <div className="flex flex-wrap gap-3">
          <Link to="/book" className="rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground px-5 py-2.5 font-semibold shadow-sm">
            احجز استشارة الآن
          </Link>
          <Link to="/doctors" className="rounded-md border border-primary text-primary px-5 py-2.5 font-semibold hover:bg-primary/5">
            تصفح الأطباء
          </Link>
        </div>
      </PageHero>

      <section className="container-app py-10 grid gap-5 md:grid-cols-3">
        <SectionCard icon={<Video className="h-5 w-5" />} title="مكالمة فيديو HD" desc="مكالمة آمنة مشفّرة عبر تطبيق باعشن الطبي، بدون تنصيب أدوات إضافية." />
        <SectionCard icon={<Clock className="h-5 w-5" />} title="مواعيد مرنة" desc="فترات مسائية ونهاية الأسبوع لتناسب جدولك، مع توفر عاجل خلال 30 دقيقة." />
        <SectionCard icon={<ShieldCheck className="h-5 w-5" />} title="سرية تامة" desc="بياناتك الطبية محفوظة وفق أنظمة حماية المعلومات الصحية السعودية." />
        <SectionCard icon={<Smartphone className="h-5 w-5" />} title="وصفة إلكترونية" desc="نرسل وصفتك مباشرة إلى صيدلية باعشن لصرفها أو توصيلها." />
        <SectionCard icon={<MessageCircle className="h-5 w-5" />} title="متابعة بعد الجلسة" desc="تواصل نصي مجاني لمدة 48 ساعة بعد الاستشارة للأسئلة المتعلقة." />
        <SectionCard icon={<CheckCircle2 className="h-5 w-5" />} title="مناسبة لـ" desc="متابعة الأدوية، الاستفسارات، تفسير التحاليل، الأمراض المزمنة، والصحة النفسية." />
      </section>

      <section className="container-app pb-14">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-8">
          <h2 className="text-2xl font-bold mb-4">كيف تعمل الخدمة؟</h2>
          <ol className="grid gap-4 md:grid-cols-4">
            {[
              "احجز موعدك عبر الموقع أو التطبيق",
              "ادفع رسوم الاستشارة إلكترونياً",
              "انضم للمكالمة عبر الرابط في وقتها",
              "استلم الوصفة والتوصية بعد الجلسة",
            ].map((s, i) => (
              <li key={s} className="rounded-xl bg-background p-4 border border-border">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-bold mb-2">
                  {i + 1}
                </div>
                <p className="text-sm">{s}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
