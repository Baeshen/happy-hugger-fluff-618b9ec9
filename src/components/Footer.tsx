import { Link } from "@tanstack/react-router";
import { Instagram, MapPin, Phone, Mail, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";

export function Footer() {
  const { t, lang } = useI18n();
  return (
    <footer className="mt-16 border-t border-border bg-muted/40">
      <div className="container-app py-12 grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground font-bold">ب</div>
            <div className="text-sm font-bold">{lang === "ar" ? SITE.nameAr : SITE.nameEn}</div>
          </div>
          <p className="text-sm text-muted-foreground leading-6">
            {lang === "ar"
              ? "منشأة صحية خاصة معتمدة من CBAHI تقدم خدمات طبية عامة وتخصصية في محافظة صبيا."
              : "A CBAHI-accredited private healthcare facility offering general and specialty medical services in Sabya."}
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3">{t("nav_specialties")}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/specialties" className="hover:text-primary">{t("nav_specialties")}</Link></li>
            <li><Link to="/doctors" className="hover:text-primary">{t("nav_doctors")}</Link></li>
            <li><Link to="/book" className="hover:text-primary">{t("nav_book")}</Link></li>
            <li><Link to="/pharmacy" className="hover:text-primary">{t("nav_pharmacy")}</Link></li>
            <li><Link to="/faq" className="hover:text-primary">{t("nav_faq")}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3">{t("footer_contact")}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /><a href={`tel:${SITE.phone}`}>{SITE.phoneDisplay}</a></li>
            <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /><a href={`tel:${SITE.mobile}`}>{SITE.mobileDisplay}</a></li>
            <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><a href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
            <li className="flex items-start gap-2"><MapPin className="h-4 w-4 text-primary mt-0.5" /><a href={SITE.mapsUrl} target="_blank" rel="noreferrer">{lang === "ar" ? SITE.addressAr : SITE.addressEn}</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3">{t("footer_hours")}</h4>
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            <Clock className="h-4 w-4 text-primary mt-0.5" /> {t("footer_hours_val")}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <a href={SITE.instagram} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><Instagram className="h-5 w-5" /></a>
          </div>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-app py-4 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} {lang === "ar" ? SITE.nameAr : SITE.nameEn} — {t("footer_rights")}</span>
          <span>{SITE.email}</span>
        </div>
      </div>
    </footer>
  );
}
