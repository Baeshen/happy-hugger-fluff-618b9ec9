import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Pill, Stethoscope, HeartHandshake } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";

type Slide = {
  eyebrow: { ar: string; en: string };
  title: { ar: string; en: string };
  desc: { ar: string; en: string };
  primary: { label: { ar: string; en: string }; to: string };
  secondary?: { label: { ar: string; en: string }; to: string };
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
};

const SLIDES: Slide[] = [
  {
    eyebrow: { ar: "معتمد من CBAHI · صبيا – جازان", en: "CBAHI Accredited · Sabya – Jazan" },
    title: { ar: "رعايتك تبدأ هنا", en: "Your Care Starts Here" },
    desc: {
      ar: "احجز موعدك مع نخبة الاستشاريين في مجمع باعشن الطبي.",
      en: "Book your appointment with top consultants at Baeshen Medical.",
    },
    primary: { label: { ar: "احجز الآن", en: "Book now" }, to: "/book" },
    secondary: { label: { ar: "التخصصات", en: "Specialties" }, to: "/specialties" },
    icon: Stethoscope,
    gradient: "from-primary via-primary to-primary/70",
  },
  {
    eyebrow: { ar: "فريق طبي متكامل", en: "Complete Medical Team" },
    title: { ar: "أطباء استشاريون في خدمتك", en: "Consultant physicians at your service" },
    desc: {
      ar: "أطباء من مختلف التخصصات لتقديم رعاية شاملة تحت سقف واحد.",
      en: "Specialists across disciplines delivering comprehensive care under one roof.",
    },
    primary: { label: { ar: "تصفح الأطباء", en: "Browse doctors" }, to: "/doctors" },
    secondary: { label: { ar: "احجز موعدًا", en: "Book" }, to: "/book" },
    icon: HeartHandshake,
    gradient: "from-teal-600 via-teal-500 to-emerald-500",
  },
  {
    eyebrow: { ar: "الرعاية المنزلية", en: "Home Care" },
    title: { ar: "الرعاية الصحية إلى باب منزلك", en: "Healthcare at your doorstep" },
    desc: {
      ar: "خدمات تمريض ومتابعة طبية في راحة منزلك بأيدٍ محترفة.",
      en: "Nursing and medical follow-up in the comfort of your home.",
    },
    primary: { label: { ar: "اطلب زيارة", en: "Request a visit" }, to: "/home-care" },
    secondary: { label: { ar: "الصيدلية", en: "Pharmacy" }, to: "/pharmacy" },
    icon: Pill,
    gradient: "from-indigo-700 via-indigo-600 to-sky-500",
  },
];

export function HeroSlider() {
  const { lang } = useI18n();
  const isRtl = lang === "ar";
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    direction: isRtl ? "rtl" : "ltr",
    align: "start",
  });
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const prevIndexRef = useRef(0);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      const from = prevIndexRef.current;
      setSelected(idx);
      if (idx !== from) {
        const s = SLIDES[idx];
        trackEvent("hero_slide_change", {
          from_index: from,
          to_index: idx,
          slide_title: s?.title.en ?? "",
        });
        prevIndexRef.current = idx;
      }
    };
    onSelect();
    emblaApi.on("select", onSelect);
    return () => void emblaApi.off("select", onSelect);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || paused) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => emblaApi.scrollNext(), 6000);
    return () => window.clearInterval(id);
  }, [emblaApi, paused]);

  const scrollPrev = useCallback(() => {
    trackEvent("hero_nav_click", { direction: "prev", from_index: selected });
    emblaApi?.scrollPrev();
  }, [emblaApi, selected]);
  const scrollNext = useCallback(() => {
    trackEvent("hero_nav_click", { direction: "next", from_index: selected });
    emblaApi?.scrollNext();
  }, [emblaApi, selected]);

  // Keyboard nav: ArrowLeft/ArrowRight respect RTL, Home/End jump to bounds.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!emblaApi) return;
      const key = e.key;
      if (key === "ArrowRight") {
        e.preventDefault();
        isRtl ? scrollNext() : scrollPrev();
      } else if (key === "ArrowLeft") {
        e.preventDefault();
        isRtl ? scrollPrev() : scrollNext();
      } else if (key === "Home") {
        e.preventDefault();
        emblaApi.scrollTo(0);
      } else if (key === "End") {
        e.preventDefault();
        emblaApi.scrollTo(SLIDES.length - 1);
      }
    },
    [emblaApi, isRtl, scrollNext, scrollPrev],
  );

  return (
    <section
      ref={rootRef}
      className="relative overflow-hidden focus:outline-none"
      role="region"
      aria-roledescription="carousel"
      aria-label={isRtl ? "شرائح مميزة" : "Featured slides"}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={emblaRef}
        className="overflow-hidden"
        aria-live={paused ? "polite" : "off"}
        aria-atomic="true"
      >
        <div className="flex">
          {SLIDES.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={i}
                className="min-w-0 flex-[0_0_100%]"
                role="group"
                aria-roledescription={isRtl ? "شريحة" : "slide"}
                aria-label={`${i + 1} / ${SLIDES.length} — ${s.title[lang]}`}
                aria-hidden={selected !== i}
              >
                <div className={`bg-gradient-to-br ${s.gradient} text-white pb-20 pt-16`}>
                  <div className="container-app grid gap-10 md:grid-cols-2 items-center">
                    <div>
                      <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
                        {s.eyebrow[lang]}
                      </span>
                      <h1 className="mt-4 text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight">
                        {s.title[lang]}
                      </h1>
                      <p className="mt-4 text-white/90 text-lg leading-8 max-w-xl">
                        {s.desc[lang]}
                      </p>
                      <div className="mt-8 flex flex-wrap gap-3">
                        <Link
                          to={s.primary.to}
                          onClick={() =>
                            trackEvent("hero_cta_click", {
                              slide_index: i,
                              slide_title: s.title.en,
                              cta: "primary",
                              label: s.primary.label.en,
                              to: s.primary.to,
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-white text-primary px-5 py-3 text-sm font-bold hover:bg-white/90"
                        >
                          {s.primary.label[lang]}
                          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                        </Link>
                        {s.secondary ? (
                          <Link
                            to={s.secondary.to}
                            onClick={() =>
                              trackEvent("hero_cta_click", {
                                slide_index: i,
                                slide_title: s.title.en,
                                cta: "secondary",
                                label: s.secondary!.label.en,
                                to: s.secondary!.to,
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-lg bg-white/10 border border-white/25 backdrop-blur px-5 py-3 text-sm font-bold hover:bg-white/20"
                          >
                            {s.secondary.label[lang]}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <div className="relative aspect-[4/3] rounded-3xl bg-white/10 border border-white/20 backdrop-blur overflow-hidden shadow-2xl">
                        <div className="absolute inset-0 grid place-items-center opacity-30 text-white">
                          <Icon className="h-40 w-40" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls — high-contrast, 44x44 tap target, focus-visible ring */}
      <button
        type="button"
        onClick={scrollPrev}
        aria-label={isRtl ? "الشريحة السابقة" : "Previous slide"}
        aria-controls="hero-slides"
        className="absolute top-1/2 -translate-y-1/2 start-3 md:start-6 grid h-11 w-11 min-h-11 min-w-11 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/70 backdrop-blur hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
      >
        <ArrowRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        aria-label={isRtl ? "الشريحة التالية" : "Next slide"}
        aria-controls="hero-slides"
        className="absolute top-1/2 -translate-y-1/2 end-3 md:end-6 grid h-11 w-11 min-h-11 min-w-11 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/70 backdrop-blur hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
      >
        <ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
      </button>

      {/* Dots */}
      <div
        className="absolute bottom-4 inset-x-0 flex justify-center gap-2"
        role="tablist"
        aria-label={isRtl ? "اختيار الشريحة" : "Select slide"}
      >
        {SLIDES.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={selected === i}
            aria-current={selected === i ? "true" : undefined}
            aria-label={
              isRtl
                ? `الشريحة ${i + 1} من ${SLIDES.length}: ${s.title.ar}`
                : `Slide ${i + 1} of ${SLIDES.length}: ${s.title.en}`
            }
            onClick={() => {
              trackEvent("hero_dot_click", { to_index: i, from_index: selected });
              emblaApi?.scrollTo(i);
            }}
            className={`h-3 min-h-3 rounded-full ring-1 ring-white/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 ${
              selected === i ? "w-8 bg-white" : "w-3 bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
