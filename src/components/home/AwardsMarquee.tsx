import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { accreditationsQuery, type Accreditation } from "@/lib/accreditations";
import { useI18n } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";

export function AwardsMarquee() {
  const { lang } = useI18n();
  const { data } = useQuery(accreditationsQuery());
  const list = (data ?? []) as Accreditation[];
  if (list.length === 0) return null;
  const doubled = [...list, ...list];

  return (
    <section className="py-14 bg-muted/30 border-y border-border overflow-hidden">
      <div className="container-app">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs font-semibold text-primary">الجودة والتميّز</div>
            <h2 className="mt-1 text-2xl md:text-3xl font-bold">اعتماداتنا وجوائزنا</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              التزامنا مُوثَّق بأعلى المعايير المحلية والدولية.
            </p>
          </div>
          <Link
            to="/accreditations"
            onClick={() =>
              trackEvent("accreditations_view_all_click", {
                location: "home_awards_marquee",
                total: list.length,
              })
            }
            className="hidden md:inline text-sm font-semibold text-primary hover:underline"
          >
            عرض الكل ←
          </Link>
        </div>
      </div>

      <div
        className="relative"
        style={{ maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)" }}
      >
        <div className="flex gap-4 animate-[marquee_40s_linear_infinite] w-max">
          {doubled.map((a, i) => (
            <Link
              key={`${a.id}-${i}`}
              to="/accreditations/$id"
              params={{ id: a.id }}
              onClick={() =>
                trackEvent("accreditation_card_click", {
                  id: a.id,
                  title: a.title_ar,
                  category: a.category ?? "",
                  location: "home_awards_marquee",
                })
              }
              className="w-64 shrink-0 rounded-2xl border border-border bg-card p-4 flex items-center gap-3 hover:border-primary/40 hover:shadow-md transition"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                {a.image_url ? (
                  <img src={a.image_url} alt="" className="h-9 w-9 object-contain" loading="lazy" />
                ) : (
                  <Award className="h-6 w-6" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground truncate">{a.category ?? ""}</div>
                <div className="text-sm font-semibold leading-5 line-clamp-2">
                  {lang === "ar" ? a.title_ar : a.title_en}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      [dir="rtl"] .animate-\\[marquee_40s_linear_infinite\\] { animation-direction: reverse; }`}</style>
    </section>
  );
}
