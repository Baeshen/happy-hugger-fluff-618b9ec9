import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { ShieldCheck, MapPin, Users, Award } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "من نحن | مجمع باعشن الطبي" },
      {
        name: "description",
        content: "نبذة عن مجمع باعشن الطبي في صبيا، جازان، رؤيتنا، اعتماداتنا وفريقنا الطبي.",
      },
      { property: "og:title", content: "من نحن — مجمع باعشن الطبي" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t, lang } = useI18n();
  return (
    <div>
      <section className="hero-gradient text-white py-16">
        <div className="container-app">
          <h1 className="text-4xl md:text-5xl font-extrabold">{t("about_title")}</h1>
          <p className="mt-3 max-w-2xl text-white/90">
            {lang === "ar"
              ? "منشأة صحية خاصة معتمدة من هيئة CBAHI تقدم خدمات طبية عامة وتخصصية تحت سقف واحد."
              : "A CBAHI-accredited private healthcare facility offering general and specialty medical services under one roof."}
          </p>
        </div>
      </section>

      <section className="container-app py-16 grid gap-10 md:grid-cols-2 items-start">
        <div className="space-y-4 text-sm leading-7 text-foreground/90">
          <p>
            {lang === "ar"
              ? "يقع مجمع باعشن الطبي في محافظة صبيا بمنطقة جازان، تحديدًا على طريق الملك عبدالعزيز في حي الظبية. يضم المجمع صيدلية داخلية (صيدليات باعشن) لخدمة المراجعين."
              : "Baeshen Medical Complex is located in Sabya, Jazan region, on King Abdulaziz Road in Al-Dhabya. It houses an in-house pharmacy (Baeshen Pharmacies) serving our patients."}
          </p>
          <p>
            {lang === "ar"
              ? "نلتزم بأعلى معايير الجودة والسلامة، ونعمل مع نخبة من الاستشاريين والأخصائيين لتقديم رعاية شاملة للمرضى وعائلاتهم."
              : "We commit to the highest standards of quality and safety, working with leading consultants and specialists to provide comprehensive care to patients and their families."}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: ShieldCheck, l: lang === "ar" ? "اعتماد CBAHI" : "CBAHI Accreditation" },
            { icon: Users, l: lang === "ar" ? "فريق تخصصي" : "Specialist team" },
            { icon: Award, l: lang === "ar" ? "جودة عالية" : "Quality-first" },
            { icon: MapPin, l: lang === "ar" ? SITE.addressAr : SITE.addressEn },
          ].map((f) => (
            <div key={f.l} className="rounded-2xl border border-border bg-card p-5">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 font-semibold text-sm">{f.l}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
