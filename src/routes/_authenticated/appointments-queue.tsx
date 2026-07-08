import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  Copy,
  Filter,
  Phone,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";
import { listAppointments } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/appointments-queue")({
  head: () => ({
    meta: [
      { title: "قائمة طلبات الحجز — لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppointmentsQueuePage,
});

type Status = "new" | "confirmed" | "completed" | "cancelled" | "no_show";

type Row = {
  id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  status: Status;
  reason: string | null;
  notes: string | null;
  created_at?: string | null;
  doctors?: { name_ar?: string | null } | null;
  specialties?: { name_ar?: string | null } | null;
};

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  new: { label: "جديد", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  confirmed: { label: "مؤكّد", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  completed: { label: "مكتمل", cls: "bg-primary/15 text-primary" },
  cancelled: { label: "ملغى", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  no_show: { label: "لم يحضر", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
};

const FILTERS: (Status | "all")[] = ["all", "new", "confirmed", "completed", "no_show", "cancelled"];

function shortRef(id: string) {
  return "BAA-" + id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("ar-SA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function AppointmentsQueuePage() {
  const list = useServerFn(listAppointments);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin", "appointments-queue"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const [status, setStatus] = useState<Status | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const rows = (data ?? []) as Row[];

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!query) return true;
      return (
        r.patient_name.toLowerCase().includes(query) ||
        r.patient_phone.includes(query) ||
        shortRef(r.id).toLowerCase().includes(query) ||
        (r.reason ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, status, q]);

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: rows.length };
    for (const r of rows) acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, [rows]);

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-black">قائمة طلبات الحجز</h1>
          <p className="text-sm text-muted-foreground mt-1">
            آخر {rows.length} طلب — انقر على أي صف لعرض التفاصيل ورقم الطلب.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            لوحة الإدارة
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatus(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                status === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {f === "all" ? "الكل" : STATUS_META[f].label}
              <span className="ms-1.5 opacity-70">({counts[f] ?? 0})</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم، الجوال، رقم الطلب، أو سبب الزيارة…"
            className="w-full ps-9 pe-3 py-2.5 rounded-md border border-input bg-background text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive mb-4">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            لا توجد طلبات مطابقة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-start p-3 font-semibold">رقم الطلب</th>
                  <th className="text-start p-3 font-semibold">المريض</th>
                  <th className="text-start p-3 font-semibold">الجوال</th>
                  <th className="text-start p-3 font-semibold">الموعد</th>
                  <th className="text-start p-3 font-semibold">التخصص/الطبيب</th>
                  <th className="text-start p-3 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-t border-border cursor-pointer hover:bg-muted/40 transition"
                  >
                    <td className="p-3 font-mono text-xs font-bold">{shortRef(r.id)}</td>
                    <td className="p-3 font-semibold">{r.patient_name}</td>
                    <td className="p-3 font-mono text-xs" dir="ltr">{r.patient_phone}</td>
                    <td className="p-3 text-xs">
                      <div>{formatDate(r.appointment_date)}</div>
                      <div className="text-muted-foreground font-mono" dir="ltr">
                        {r.appointment_time?.slice(0, 5)}
                      </div>
                    </td>
                    <td className="p-3 text-xs">
                      <div>{r.specialties?.name_ar ?? "—"}</div>
                      <div className="text-muted-foreground">{r.doctors?.name_ar ?? "—"}</div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_META[r.status].cls}`}
                      >
                        {STATUS_META[r.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DetailDrawer row={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function DetailDrawer({ row, onClose }: { row: Row; onClose: () => void }) {
  const ref = shortRef(row.id);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl bg-background border border-border shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">تفاصيل الطلب</h2>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-accent/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">رقم الطلب</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(ref).then(
                    () => toast.success("تم نسخ رقم الطلب"),
                    () => toast.error("تعذّر النسخ"),
                  );
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Copy className="h-3 w-3" /> نسخ
              </button>
            </div>
            <div className="mt-1 text-xl font-mono font-black tracking-wider">{ref}</div>
            <div className="mt-2">
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_META[row.status].cls}`}
              >
                {STATUS_META[row.status].label}
              </span>
            </div>
          </div>

          <dl className="grid gap-2 text-sm">
            <Row label="المريض" icon={<User className="h-4 w-4" />} value={row.patient_name} />
            <Row label="الجوال" icon={<Phone className="h-4 w-4" />} value={row.patient_phone} mono />
            <Row
              label="الموعد"
              icon={<CalendarDays className="h-4 w-4" />}
              value={`${formatDate(row.appointment_date)} — ${row.appointment_time?.slice(0, 5)}`}
            />
            <Row label="التخصص" value={row.specialties?.name_ar ?? "—"} />
            <Row label="الطبيب" value={row.doctors?.name_ar ?? "—"} />
          </dl>

          {row.reason && (
            <div>
              <div className="text-xs font-semibold mb-1">سبب الزيارة / التصنيف</div>
              <p className="rounded-md bg-muted/60 p-3 text-sm whitespace-pre-wrap">{row.reason}</p>
            </div>
          )}
          {row.notes && (
            <div>
              <div className="text-xs font-semibold mb-1">ملاحظات المسؤول</div>
              <p className="rounded-md bg-muted/60 p-3 text-sm whitespace-pre-wrap">{row.notes}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Link
              to="/admin"
              className="flex-1 text-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              فتح في لوحة الإدارة
            </Link>
            <a
              href={`tel:${row.patient_phone}`}
              className="rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              اتصال
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-1.5 last:border-none">
      <dt className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd
        className={`text-sm font-semibold text-end ${mono ? "font-mono" : ""}`}
        dir={mono ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
