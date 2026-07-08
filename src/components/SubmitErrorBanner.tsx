import { AlertCircle, RefreshCw, WifiOff, Clock, ServerCrash, ShieldAlert } from "lucide-react";
import type { BookingSubmitKind } from "@/lib/booking-submit";

/**
 * Inline error banner rendered above a form when the last submission failed.
 * Shows an icon+title matched to the failure kind, the Arabic message from
 * the API, and an optional retry button that re-runs the submit handler.
 */

const META: Record<
  Exclude<BookingSubmitKind, "success">,
  { title: string; icon: React.ReactNode }
> = {
  validation: { title: "بيانات غير مقبولة", icon: <ShieldAlert className="h-5 w-5" /> },
  db: { title: "تعذّر حفظ الطلب", icon: <ServerCrash className="h-5 w-5" /> },
  network: { title: "لا يوجد اتصال", icon: <WifiOff className="h-5 w-5" /> },
  timeout: { title: "انتهت مهلة الاتصال", icon: <Clock className="h-5 w-5" /> },
  server: { title: "خطأ في الخادم", icon: <ServerCrash className="h-5 w-5" /> },
  unknown: { title: "حدث خطأ غير متوقع", icon: <AlertCircle className="h-5 w-5" /> },
};

export function SubmitErrorBanner({
  kind,
  message,
  onRetry,
  retrying,
}: {
  kind: Exclude<BookingSubmitKind, "success">;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const meta = META[kind] ?? META.unknown;
  const showRetry = kind !== "validation" && !!onRetry;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-3"
    >
      <div className="mt-0.5 text-destructive shrink-0">{meta.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-destructive">{meta.title}</div>
        <p className="mt-0.5 text-xs text-destructive/90 leading-5 break-words">{message}</p>
        {showRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "جاري إعادة المحاولة..." : "إعادة المحاولة"}
          </button>
        )}
      </div>
    </div>
  );
}
