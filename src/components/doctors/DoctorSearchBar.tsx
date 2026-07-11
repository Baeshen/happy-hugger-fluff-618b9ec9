/**
 * DoctorSearchBar — search input wired to the shared DoctorSearchContext.
 * Reusable in the /doctors hero and any embedded widget.
 */
import { Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useDoctorSearch } from "./DoctorSearchContext";

type Props = {
  placeholder?: string;
  className?: string;
  /** Visual size preset. */
  size?: "md" | "lg";
};

export function DoctorSearchBar({ placeholder, className = "", size = "lg" }: Props) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const { qInput, setQInput } = useDoctorSearch();
  const isLg = size === "lg";

  const ph = placeholder ?? (ar ? "ابحث بالاسم أو التخصص…" : "Search by name or specialty…");

  return (
    <div className={`relative ${className}`}>
      <Search
        className={`absolute top-1/2 -translate-y-1/2 start-5 ${isLg ? "h-5 w-5" : "h-4 w-4"} text-muted-foreground pointer-events-none`}
        aria-hidden
      />
      <input
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
        placeholder={ph}
        className={`w-full rounded-2xl border border-border bg-card shadow-md ps-14 pe-4 text-base focus:outline-none focus:ring-2 focus:ring-primary ${
          isLg ? "h-16" : "h-12"
        }`}
        aria-label={ar ? "بحث" : "Search"}
        type="search"
      />
      {qInput && (
        <button
          type="button"
          onClick={() => setQInput("")}
          className="absolute top-1/2 -translate-y-1/2 end-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          aria-label={ar ? "مسح" : "Clear"}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
