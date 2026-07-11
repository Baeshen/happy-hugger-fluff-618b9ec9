import type React from "react";

export function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold mb-1.5">{label}{required && <span className="text-destructive"> *</span>}</div>
      {children}
      {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
    </label>
  );
}
