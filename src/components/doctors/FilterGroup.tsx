import type React from "react";

export function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-sm mb-2.5 text-foreground/90">{title}</div>
      <div className="space-y-2 max-h-56 overflow-y-auto pe-1">{children}</div>
    </div>
  );
}
