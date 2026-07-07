import { Link } from "@tanstack/react-router";
import { Menu, X, Globe, Phone, LayoutDashboard, LogIn, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const nav = [
    { to: "/", label: t("nav_home") },
    { to: "/complex", label: t("nav_complex") },
    { to: "/specialties", label: t("nav_specialties") },
    { to: "/doctors", label: t("nav_doctors") },
    { to: "/book", label: t("nav_book") },
    { to: "/pharmacy", label: t("nav_pharmacy") },
    { to: "/lookup", label: t("nav_lookup") },
    { to: "/about", label: t("nav_about") },
    { to: "/contact", label: t("nav_contact") },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="container-app flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground font-bold">
            ب
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-foreground">
              {lang === "ar" ? SITE.nameAr : SITE.nameEn}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {lang === "ar" ? "صبيا – جازان" : "Sabya – Jazan"}
            </div>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="px-3 py-2 text-sm font-medium text-foreground/80 rounded-md hover:text-primary hover:bg-primary/5 transition"
              activeProps={{ className: "text-primary bg-primary/10" }}
              activeOptions={{ exact: n.to === "/" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <a
            href={`tel:${SITE.phone}`}
            className="hidden xl:inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <Phone className="h-4 w-4" /> {SITE.phoneDisplay}
          </a>
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Globe className="h-3.5 w-3.5" /> {t("lang_switch")}
          </button>
          <Link
            to="/book"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {t("cta_book")}
          </Link>
          {signedIn ? (
            <>
              <Link
                to="/my"
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                title={t("nav_my")}
              >
                <User className="h-3.5 w-3.5" /> {t("nav_my")}
              </Link>
              <Link
                to="/admin"
                className="hidden xl:inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                title="لوحة التحكم"
              >
                <LayoutDashboard className="h-3.5 w-3.5" /> لوحة
              </Link>
            </>
          ) : (
            <Link
              to="/auth"
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <LogIn className="h-3.5 w-3.5" /> دخول
            </Link>
          )}
        </div>

        <button
          className="lg:hidden inline-flex items-center justify-center rounded-md p-2 text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-label="menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border bg-background">
          <div className="container-app py-3 flex flex-col gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="px-3 py-2 rounded-md text-sm font-medium text-foreground/90 hover:bg-primary/5"
                onClick={() => setOpen(false)}
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium"
              >
                <Globe className="h-3.5 w-3.5" /> {t("lang_switch")}
              </button>
              <Link
                to="/book"
                onClick={() => setOpen(false)}
                className="flex-1 text-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {t("cta_book")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
