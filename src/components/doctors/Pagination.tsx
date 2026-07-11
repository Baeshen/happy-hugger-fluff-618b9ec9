import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  totalPages,
  onGo,
  ar,
}: {
  page: number;
  totalPages: number;
  onGo: (p: number) => void;
  ar: boolean;
}) {
  const pages = useMemo(() => {
    const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    return Array.from(set)
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [page, totalPages]);

  return (
    <nav
      className="mt-8 flex items-center justify-center gap-1"
      role="navigation"
      aria-label={ar ? "التنقل بين الصفحات" : "Pagination"}
    >
      <button
        type="button"
        onClick={() => onGo(page - 1)}
        disabled={page <= 1}
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition"
        aria-label={ar ? "السابق" : "Previous"}
      >
        {ar ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        <span className="hidden sm:inline">{ar ? "السابق" : "Previous"}</span>
      </button>

      {pages.map((p, i) => {
        const prev = pages[i - 1];
        const gap = prev != null && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1">
            {gap && <span className="px-1 text-muted-foreground">…</span>}
            <button
              type="button"
              onClick={() => onGo(p)}
              aria-current={p === page ? "page" : undefined}
              className={`h-9 min-w-9 rounded-lg border px-3 text-sm font-semibold transition ${
                p === page
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary hover:text-primary"
              }`}
            >
              {p.toLocaleString(ar ? "ar-SA" : "en-US")}
            </button>
          </span>
        );
      })}

      <button
        type="button"
        onClick={() => onGo(page + 1)}
        disabled={page >= totalPages}
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition"
        aria-label={ar ? "التالي" : "Next"}
      >
        <span className="hidden sm:inline">{ar ? "التالي" : "Next"}</span>
        {ar ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </nav>
  );
}
