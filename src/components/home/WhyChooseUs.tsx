import { ShieldCheck, HeartPulse, Layers, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Card = {
  icon: React.ComponentType<{ className?: string }>;
  title: { ar: string; en: string };
  desc: { ar: string; en: string };
  gradient: string;
};

const CARDS: Card[] = [
  {
    icon: ShieldCheck,
    title: { ar: "خبرة معتمدة", en: "Certified Expertise" },
    desc: {
      ar: "معتمدون من CBAHI مع فريق طبي بخبرات مثبتة في مختلف التخصصات.",
      en: "CBAHI-accredited with a medical team of proven experience across specialties.",
    },
    gradient: "from-primary/90 to-primary/60",
  },
  {
    icon: HeartPulse,
    title: { ar: "رعاية تتمحور حول المريض", en: "Patient-Centered Care" },
    desc: {
      ar: "تجربة مريض متكاملة من الحجز حتى المتابعة، بلمسة إنسانية.",
      en: "An integrated patient journey from booking to follow-up, with a human touch.",
    },
    gradient: "from-teal-600 to-emerald-500",
  },
  {
    icon: Layers,
    title: { ar: "خدمات شاملة", en: "Comprehensive Services" },
    desc: {
      ar: "تخصصات متعددة، صيدلية داخلية، ورعاية منزلية تحت مظلة واحدة.",
      en: "Multiple specialties, in-house pharmacy, and home care under one roof.",
    },
    gradient: "from-indigo-600 to-sky-500",
  },
  {
    icon: Sparkles,
    title: { ar: "تقنية متقدمة", en: "Advanced Technology" },
    desc: {
      ar: "أنظمة رقمية للحجز والتذكير والملف الصحي لتجربة أسهل وأدق.",
      en: "Digital booking, reminders and health records for a smoother, more accurate experience.",
    },
    gradient: "from-fuchsia-600 to-rose-500",
  },
];

export function WhyChooseUs() {
  const { lang } = useI18n();
  return (
    <section className="py-16 bg-muted/40">
      <div className="container-app">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-block rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            {lang === "ar" ? "لماذا تختارنا؟" : "Why choose us"}
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold">
            {lang === "ar" ? "التزامنا برعايتك في كل خطوة" : "Committed to your care every step"}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {lang === "ar"
              ? "نجمع بين الخبرة الطبية والتقنية الحديثة لنقدم لك تجربة صحية استثنائية."
              : "We combine medical expertise and modern technology to deliver an exceptional healthcare experience."}
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 hover:shadow-lg transition"
              >
                <div
                  className={`absolute inset-x-0 -top-24 h-40 bg-gradient-to-br ${c.gradient} opacity-15 blur-2xl group-hover:opacity-30 transition`}
                />
                <div
                  className={`relative h-14 w-14 rounded-2xl bg-gradient-to-br ${c.gradient} text-white grid place-items-center shadow-md`}
                >
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="relative mt-5 font-bold text-lg">{c.title[lang]}</h3>
                <p className="relative mt-2 text-sm text-muted-foreground leading-6">
                  {c.desc[lang]}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
