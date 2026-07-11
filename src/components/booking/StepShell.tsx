import type React from "react";

export function StepShell({ title, children }: { lang: "ar" | "en"; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold mb-5 text-center">{title}</h2>
      {children}
    </div>
  );
}
