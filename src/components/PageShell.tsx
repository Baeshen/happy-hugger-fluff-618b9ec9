import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-accent/5 to-background border-b border-border">
      <div className="absolute inset-0 -z-10 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,var(--color-primary)/0.15,transparent_50%),radial-gradient(circle_at_80%_60%,var(--color-accent)/0.15,transparent_60%)]" />
      <div className="container-app py-14 md:py-20">
        {eyebrow && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl md:text-5xl font-black tracking-tight text-foreground">{title}</h1>
        {subtitle && (
          <p className="mt-3 max-w-2xl text-base md:text-lg text-muted-foreground leading-7">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}

export function SectionCard({
  icon,
  title,
  desc,
  children,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <div className="group rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition">
      {icon && (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {desc && <p className="mt-1.5 text-sm text-muted-foreground leading-6">{desc}</p>}
      {children}
    </div>
  );
}
