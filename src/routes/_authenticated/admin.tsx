import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeReason, isEmptyReason, reasonRequiredFor } from "@/lib/reason";
import {
  getMyRoles,
  getAdminStats,
  listAppointments,
  updateAppointmentStatus,
  listAppointmentAudit,
  listOrders,
  updateOrderStatus,
  listDoctorsAdmin,
  toggleDoctorActive,
  listSpecialtiesAdmin,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  listSpecialtiesFull,
  createSpecialty,
  updateSpecialty,
  deleteSpecialty,
  listAvailability,
  createAvailability,
  deleteAvailability,
} from "@/lib/admin.functions";
import {
  LayoutDashboard,
  CalendarDays,
  Pill,
  Stethoscope,
  LogOut,
  ShieldCheck,
  Users,
  Clock,
  Plus,
  Pencil,
  Trash2,
  X as XIcon,
  Tag,
  CalendarClock,
  History,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDashboard,
});

type Tab = "overview" | "appointments" | "orders" | "doctors" | "specialties" | "availability";

const APPT_STATUS: { value: "new" | "confirmed" | "completed" | "cancelled" | "no_show"; label: string }[] = [
  { value: "new", label: "جديد" },
  { value: "confirmed", label: "مؤكد" },
  { value: "completed", label: "منتهي" },
  { value: "cancelled", label: "ملغي" },
  { value: "no_show", label: "لم يحضر" },
];

const ORDER_STATUS: { value: "new" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled"; label: string }[] = [
  { value: "new", label: "جديد" },
  { value: "preparing", label: "قيد التحضير" },
  { value: "ready", label: "جاهز" },
  { value: "out_for_delivery", label: "قيد التوصيل" },
  { value: "delivered", label: "تم التسليم" },
  { value: "cancelled", label: "ملغي" },
];

function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");

  const myRolesFn = useServerFn(getMyRoles);
  const rolesQuery = useQuery({ queryKey: ["my-roles"], queryFn: () => myRolesFn() });

  const roles = rolesQuery.data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isReception = roles.includes("reception");
  const isPharmacy = roles.includes("pharmacy");
  const canSeeAppts = isAdmin || isReception;
  const canSeeOrders = isAdmin || isPharmacy;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }

  if (rolesQuery.isLoading) {
    return <div className="container-app py-16 text-center text-muted-foreground">جارٍ التحميل…</div>;
  }

  if (roles.length === 0) {
    return (
      <div className="container-app py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-bold">حسابك بدون صلاحيات</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            تم تسجيل الدخول لكن لم يتم تعيين دور لك بعد. تواصل مع مدير النظام لتفعيل الوصول.
          </p>
          <button
            onClick={handleSignOut}
            className="mt-6 inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any; show: boolean }[] = ([
    { id: "overview" as Tab, label: "نظرة عامة", icon: LayoutDashboard, show: true },
    { id: "appointments" as Tab, label: "المواعيد", icon: CalendarDays, show: canSeeAppts },
    { id: "orders" as Tab, label: "طلبات الأدوية", icon: Pill, show: canSeeOrders },
    { id: "doctors" as Tab, label: "الأطباء", icon: Stethoscope, show: isAdmin },
    { id: "specialties" as Tab, label: "التخصصات", icon: Tag, show: isAdmin },
    { id: "availability" as Tab, label: "فترات الدوام", icon: CalendarClock, show: isAdmin || isReception },
  ]).filter((t) => t.show);

  return (
    <div className="container-app py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أدوارك: {roles.map((r) => <span key={r} className="mx-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{r}</span>)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">الموقع</Link>
          <button onClick={handleSignOut} className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
            <LogOut className="h-4 w-4" /> خروج
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "appointments" && canSeeAppts && <AppointmentsTab />}
      {tab === "orders" && canSeeOrders && <OrdersTab />}
      {tab === "doctors" && isAdmin && <DoctorsTab />}
      {tab === "specialties" && isAdmin && <SpecialtiesTab />}
      {tab === "availability" && (isAdmin || isReception) && <AvailabilityTab />}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "primary" }: { label: string; value: number; icon: any; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`h-5 w-5 text-${tone}`} />
      </div>
      <div className="mt-3 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function OverviewTab() {
  const fn = useServerFn(getAdminStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });
  if (isLoading) return <div className="text-muted-foreground">جارٍ تحميل الإحصائيات…</div>;
  if (!data) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="إجمالي المواعيد" value={data.appointmentsTotal} icon={CalendarDays} />
      <StatCard label="مواعيد اليوم" value={data.appointmentsToday} icon={Clock} />
      <StatCard label="مواعيد جديدة" value={data.appointmentsPending} icon={Users} />
      <StatCard label="إجمالي طلبات الأدوية" value={data.ordersTotal} icon={Pill} />
      <StatCard label="طلبات جديدة" value={data.ordersPending} icon={Pill} />
      <StatCard label="الأطباء النشطون" value={data.doctorsActive} icon={Stethoscope} />
    </div>
  );
}

type ApptStatus = "new" | "confirmed" | "completed" | "cancelled" | "no_show";

const APPT_STATUS_STYLES: Record<ApptStatus, string> = {
  new: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  no_show: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

function StatusBadge({ status }: { status: ApptStatus }) {
  const label = APPT_STATUS.find((s) => s.value === status)?.label ?? status;
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${APPT_STATUS_STYLES[status]}`}>
      {label}
    </span>
  );
}

function AppointmentsTab() {
  const listFn = useServerFn(listAppointments);
  const updateFn = useServerFn(updateAppointmentStatus);
  const q = useQuery({ queryKey: ["admin-appts"], queryFn: () => listFn() });
  const [filter, setFilter] = useState<"all" | ApptStatus>("all");
  const [search, setSearch] = useState("");
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);

  const m = useMutation({
    mutationFn: (v: { id: string; status: ApptStatus; reason?: string }) => updateFn({ data: v }),
    onSuccess: (_d, v) => {
      const label = APPT_STATUS.find((s) => s.value === v.status)?.label ?? v.status;
      toast.success(`تم تحديث الحالة إلى: ${label}`);
      q.refetch();
    },
    onError: (e: any) => {
      const msg: string = e?.message ?? "";
      // Unify DB-side reason failures (empty after trim / whitespace-only incl. \n \t NBSP)
      // to the same user-facing message used by client-side pre-validation.
      if (
        /reason_required_for_/i.test(msg) ||
        /reason_blank_after_trim/i.test(msg) ||
        /السبب مطلوب/.test(msg) ||
        /السبب المُدخل فارغ/.test(msg)
      ) {
        toast.error("السبب مطلوب لهذا الإجراء");
        return;
      }
      toast.error(msg || "فشل التحديث");
    },
  });

  // Ask for a reason on destructive/final transitions; optional otherwise.
  // Normalization (trim / NBSP / length cap) is shared with server + DB via
  // src/lib/reason.ts so all three layers agree on what counts as empty.
  const changeStatus = (id: string, status: ApptStatus) => {
    const needsReason = reasonRequiredFor(status);
    const promptMsg = needsReason
      ? `سبب التغيير إلى "${APPT_STATUS.find((s) => s.value === status)?.label}" (إلزامي):`
      : `سبب التغيير (اختياري):`;
    const raw = window.prompt(promptMsg, "");
    if (raw === null) return; // cancelled
    const normalized = normalizeReason(raw);
    if (needsReason && isEmptyReason(normalized)) {
      toast.error("السبب مطلوب لهذا الإجراء");
      return;
    }
    m.mutate({ id, status, reason: isEmptyReason(normalized) ? undefined : normalized });
  };


  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const all = (q.data ?? []) as any[];
  const rows = all.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${r.patient_name ?? ""} ${r.patient_phone ?? ""} ${r.national_id ?? ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const counts: Record<string, number> = { all: all.length };
  for (const s of APPT_STATUS) counts[s.value] = all.filter((r) => r.status === s.value).length;

  const chip = (v: "all" | ApptStatus, label: string) => (
    <button
      key={v}
      onClick={() => setFilter(v)}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        filter === v
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
      <span className="rounded-full bg-background/80 px-1.5 text-[10px] font-semibold">
        {counts[v] ?? 0}
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {chip("all", "الكل")}
        {APPT_STATUS.map((s) => chip(s.value, s.label))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الهاتف…"
          className="ms-auto w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm sm:w-auto"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">المريض</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">التخصص / الطبيب</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">الوقت</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">لا توجد مواعيد مطابقة</td></tr>
            )}
            {rows.map((r: any) => {
              const status = r.status as ApptStatus;
              const pending = m.isPending && m.variables?.id === r.id;
              const isFinal = status === "completed" || status === "cancelled" || status === "no_show";
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.patient_name}</div>
                    {r.national_id && <div className="text-xs text-muted-foreground" dir="ltr">{r.national_id}</div>}
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    <a href={`tel:${r.patient_phone}`} className="hover:text-primary">{r.patient_phone}</a>
                  </td>
                  <td className="px-4 py-3">
                    <div>{r.specialties?.name_ar ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.doctors?.name_ar ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3" dir="ltr">{r.appointment_date}</td>
                  <td className="px-4 py-3" dir="ltr">{r.appointment_time}</td>
                  <td className="px-4 py-3"><StatusBadge status={status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {status !== "confirmed" && !isFinal && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "confirmed")}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                        >
                          تأكيد
                        </button>
                      )}
                      {status === "confirmed" && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "completed")}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-60"
                        >
                          إنهاء
                        </button>
                      )}
                      {status === "confirmed" && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "no_show")}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/10 disabled:opacity-60"
                        >
                          لم يحضر
                        </button>
                      )}
                      {!isFinal && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "cancelled")}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        >
                          إلغاء
                        </button>
                      )}
                      {isFinal && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "new")}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
                        >
                          إعادة فتح
                        </button>
                      )}
                      <button
                        onClick={() => setHistoryFor({ id: r.id, name: r.patient_name })}
                        className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                        title="سجل التغييرات"
                      >
                        <History className="h-3.5 w-3.5" />
                        السجل
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {historyFor && (
        <AuditModal
          appointmentId={historyFor.id}
          patientName={historyFor.name}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

function AuditModal({
  appointmentId,
  patientName,
  onClose,
}: {
  appointmentId: string;
  patientName: string;
  onClose: () => void;
}) {
  const fn = useServerFn(listAppointmentAudit);
  const q = useQuery({
    queryKey: ["appt-audit", appointmentId],
    queryFn: () => fn({ data: { appointmentId } }),
  });
  const rows = (q.data ?? []) as any[];
  const statusLabel = (v: string | null) =>
    v ? APPT_STATUS.find((s) => s.value === v)?.label ?? v : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">سجل تغييرات الحجز</h3>
            <p className="text-sm text-muted-foreground">{patientName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {q.isLoading ? (
          <div className="py-8 text-center text-muted-foreground">جارٍ التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">لا توجد تغييرات مسجّلة بعد</div>
        ) : (
          <ol className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{r.changed_by_name ?? "مستخدم غير معروف"}</span>
                  <span dir="ltr">{new Date(r.changed_at).toLocaleString("ar-SA")}</span>
                </div>
                {(r.old_status || r.new_status) && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">
                      <span className="text-muted-foreground">نوع الانتقال:</span>
                      <span>{statusLabel(r.old_status)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{statusLabel(r.new_status)}</span>
                    </span>
                  </div>
                )}
                {(r.old_notes !== null || r.new_notes !== null) && (r.old_notes !== undefined || r.new_notes !== undefined) && (
                  <div className="mt-1 text-xs">
                    <div className="text-muted-foreground">الملاحظات قبل:</div>
                    <div className="whitespace-pre-wrap rounded bg-muted/50 p-2">{r.old_notes ?? "—"}</div>
                    <div className="mt-1 text-muted-foreground">الملاحظات بعد:</div>
                    <div className="whitespace-pre-wrap rounded bg-muted/50 p-2">{r.new_notes ?? "—"}</div>
                  </div>
                )}
                {r.reason && (
                  <div className="mt-2 rounded bg-primary/5 p-2 text-xs">
                    <span className="font-medium text-primary">السبب:</span> {r.reason}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}


function OrdersTab() {
  const listFn = useServerFn(listOrders);
  const updateFn = useServerFn(updateOrderStatus);
  const q = useQuery({ queryKey: ["admin-orders"], queryFn: () => listFn() });
  const m = useMutation({
    mutationFn: (v: { id: string; status: any }) => updateFn({ data: v }),
    onSuccess: () => { toast.success("تم التحديث"); q.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل التحديث"),
  });

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const rows = q.data ?? [];

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">المريض</th>
            <th className="px-4 py-3">الهاتف</th>
            <th className="px-4 py-3">الحي / العنوان</th>
            <th className="px-4 py-3">نوع التوصيل</th>
            <th className="px-4 py-3">الوصفة</th>
            <th className="px-4 py-3">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">لا توجد طلبات</td></tr>
          )}
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{r.patient_name}</td>
              <td className="px-4 py-3" dir="ltr">{r.patient_phone}</td>
              <td className="px-4 py-3">
                <div>{r.district ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{r.address ?? ""}</div>
              </td>
              <td className="px-4 py-3">{r.delivery_type}</td>
              <td className="px-4 py-3">
                {r.prescription_image_url ? (
                  <a href={r.prescription_image_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">عرض</a>
                ) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3">
                <select
                  defaultValue={r.status}
                  onChange={(e) => m.mutate({ id: r.id, status: e.target.value })}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {ORDER_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DoctorForm = {
  id?: string;
  specialty_id: string | null;
  name_ar: string;
  name_en: string;
  title_ar: string;
  title_en: string;
  photo_url: string;
  bio_ar: string;
  bio_en: string;
  languages: string; // comma-separated in form
  is_active: boolean;
  sort_order: number;
};

const emptyDoctor: DoctorForm = {
  specialty_id: null,
  name_ar: "",
  name_en: "",
  title_ar: "",
  title_en: "",
  photo_url: "",
  bio_ar: "",
  bio_en: "",
  languages: "ar,en",
  is_active: true,
  sort_order: 0,
};

function DoctorsTab() {
  const listFn = useServerFn(listDoctorsAdmin);
  const specialtiesFn = useServerFn(listSpecialtiesAdmin);
  const toggleFn = useServerFn(toggleDoctorActive);
  const createFn = useServerFn(createDoctor);
  const updateFn = useServerFn(updateDoctor);
  const deleteFn = useServerFn(deleteDoctor);

  const q = useQuery({ queryKey: ["admin-doctors"], queryFn: () => listFn() });
  const specQ = useQuery({ queryKey: ["admin-specialties"], queryFn: () => specialtiesFn() });

  const [editing, setEditing] = useState<DoctorForm | null>(null);

  const toggleM = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => { toast.success("تم التحديث"); q.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل التحديث"),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("تم الحذف"); q.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });
  const saveM = useMutation({
    mutationFn: async (form: DoctorForm) => {
      const payload: any = {
        specialty_id: form.specialty_id || null,
        name_ar: form.name_ar.trim(),
        name_en: form.name_en.trim(),
        title_ar: form.title_ar.trim() || null,
        title_en: form.title_en.trim() || null,
        photo_url: form.photo_url.trim(),
        bio_ar: form.bio_ar.trim() || null,
        bio_en: form.bio_en.trim() || null,
        languages: form.languages.split(",").map((s) => s.trim()).filter(Boolean),
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 0,
      };
      if (form.id) return updateFn({ data: { id: form.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEditing(null);
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const rows = q.data ?? [];
  const specialties = specQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ ...emptyDoctor })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> إضافة طبيب
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">الطبيب</th>
              <th className="px-4 py-3">التخصص</th>
              <th className="px-4 py-3">اللغات</th>
              <th className="px-4 py-3">الترتيب</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">لا يوجد أطباء</td></tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {r.photo_url && (
                      <img src={r.photo_url} alt={r.name_ar} className="h-9 w-9 rounded-full object-cover" />
                    )}
                    <div>
                      <div className="font-medium">{r.name_ar}</div>
                      <div className="text-xs text-muted-foreground">{r.title_ar ?? "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{r.specialties?.name_ar ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{(r.languages ?? []).join(", ")}</td>
                <td className="px-4 py-3 text-xs" dir="ltr">{r.sort_order}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleM.mutate({ id: r.id, is_active: !r.is_active })}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.is_active ? "نشط" : "متوقف"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          specialty_id: r.specialty_id ?? null,
                          name_ar: r.name_ar ?? "",
                          name_en: r.name_en ?? "",
                          title_ar: r.title_ar ?? "",
                          title_en: r.title_en ?? "",
                          photo_url: r.photo_url ?? "",
                          bio_ar: r.bio_ar ?? "",
                          bio_en: r.bio_en ?? "",
                          languages: (r.languages ?? []).join(","),
                          is_active: !!r.is_active,
                          sort_order: r.sort_order ?? 0,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`حذف الطبيب "${r.name_ar}"؟`)) deleteM.mutate(r.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <DoctorFormModal
          value={editing}
          specialties={specialties as any[]}
          saving={saveM.isPending}
          onCancel={() => setEditing(null)}
          onSave={(v) => saveM.mutate(v)}
        />
      )}
    </div>
  );
}

function DoctorFormModal({
  value,
  specialties,
  saving,
  onCancel,
  onSave,
}: {
  value: DoctorForm;
  specialties: { id: string; name_ar: string; name_en: string }[];
  saving: boolean;
  onCancel: () => void;
  onSave: (v: DoctorForm) => void;
}) {
  const [form, setForm] = useState<DoctorForm>(value);
  const set = <K extends keyof DoctorForm>(k: K, v: DoctorForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">{form.id ? "تعديل طبيب" : "إضافة طبيب"}</h2>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted"><XIcon className="h-4 w-4" /></button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name_ar.trim() || !form.name_en.trim()) {
              toast.error("الاسم بالعربي والإنجليزي مطلوب");
              return;
            }
            onSave(form);
          }}
          className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2"
        >
          <Field label="الاسم (عربي) *">
            <input required value={form.name_ar} onChange={(e) => set("name_ar", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Name (English) *">
            <input required dir="ltr" value={form.name_en} onChange={(e) => set("name_en", e.target.value)} className={inputCls} />
          </Field>
          <Field label="المسمى (عربي)">
            <input value={form.title_ar} onChange={(e) => set("title_ar", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Title (English)">
            <input dir="ltr" value={form.title_en} onChange={(e) => set("title_en", e.target.value)} className={inputCls} />
          </Field>
          <Field label="التخصص">
            <select
              value={form.specialty_id ?? ""}
              onChange={(e) => set("specialty_id", e.target.value || null)}
              className={inputCls}
            >
              <option value="">— بدون —</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>{s.name_ar}</option>
              ))}
            </select>
          </Field>
          <Field label="اللغات (مفصولة بفاصلة)">
            <input dir="ltr" value={form.languages} onChange={(e) => set("languages", e.target.value)} className={inputCls} placeholder="ar,en" />
          </Field>
          <Field label="رابط الصورة" full>
            <input dir="ltr" type="url" value={form.photo_url} onChange={(e) => set("photo_url", e.target.value)} className={inputCls} placeholder="https://…" />
          </Field>
          <Field label="نبذة (عربي)" full>
            <textarea value={form.bio_ar} onChange={(e) => set("bio_ar", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Bio (English)" full>
            <textarea dir="ltr" value={form.bio_en} onChange={(e) => set("bio_en", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="الترتيب">
            <input type="number" value={form.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="الحالة">
            <label className="mt-2 inline-flex items-center gap-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              <span className="text-sm">نشط</span>
            </label>
          </Field>

          <div className="sm:col-span-2 mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onCancel} className="rounded-md border border-input px-4 py-2 text-sm">إلغاء</button>
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

/* ---------------- Specialties Tab ---------------- */

type SpecialtyForm = {
  id?: string;
  slug: string;
  name_ar: string;
  name_en: string;
  icon: string;
  description_ar: string;
  description_en: string;
  is_active: boolean;
  sort_order: number;
};

const emptySpecialty: SpecialtyForm = {
  slug: "",
  name_ar: "",
  name_en: "",
  icon: "",
  description_ar: "",
  description_en: "",
  is_active: true,
  sort_order: 0,
};

function SpecialtiesTab() {
  const listFn = useServerFn(listSpecialtiesFull);
  const createFn = useServerFn(createSpecialty);
  const updateFn = useServerFn(updateSpecialty);
  const deleteFn = useServerFn(deleteSpecialty);

  const q = useQuery({ queryKey: ["admin-specialties-full"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<SpecialtyForm | null>(null);

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("تم الحذف"); q.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });
  const saveM = useMutation({
    mutationFn: async (f: SpecialtyForm) => {
      const payload = {
        slug: f.slug.trim(),
        name_ar: f.name_ar.trim(),
        name_en: f.name_en.trim(),
        icon: f.icon.trim() || null,
        description_ar: f.description_ar.trim() || null,
        description_en: f.description_en.trim() || null,
        is_active: f.is_active,
        sort_order: Number(f.sort_order) || 0,
      };
      if (f.id) return updateFn({ data: { id: f.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => { toast.success("تم الحفظ"); setEditing(null); q.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ ...emptySpecialty })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> إضافة تخصص
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">التخصص</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">الأيقونة</th>
              <th className="px-4 py-3">الترتيب</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">لا توجد تخصصات</td></tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name_ar}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{r.name_en}</div>
                </td>
                <td className="px-4 py-3 text-xs" dir="ltr">{r.slug}</td>
                <td className="px-4 py-3 text-xs">{r.icon ?? "—"}</td>
                <td className="px-4 py-3 text-xs" dir="ltr">{r.sort_order}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {r.is_active ? "نشط" : "متوقف"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing({
                        id: r.id,
                        slug: r.slug ?? "",
                        name_ar: r.name_ar ?? "",
                        name_en: r.name_en ?? "",
                        icon: r.icon ?? "",
                        description_ar: r.description_ar ?? "",
                        description_en: r.description_en ?? "",
                        is_active: !!r.is_active,
                        sort_order: r.sort_order ?? 0,
                      })}
                      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </button>
                    <button
                      onClick={() => { if (confirm(`حذف "${r.name_ar}"؟ سيؤثر ذلك على الأطباء المرتبطين.`)) deleteM.mutate(r.id); }}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <SpecialtyFormModal
          value={editing}
          saving={saveM.isPending}
          onCancel={() => setEditing(null)}
          onSave={(v) => saveM.mutate(v)}
        />
      )}
    </div>
  );
}

function SpecialtyFormModal({ value, saving, onCancel, onSave }: {
  value: SpecialtyForm; saving: boolean; onCancel: () => void; onSave: (v: SpecialtyForm) => void;
}) {
  const [form, setForm] = useState<SpecialtyForm>(value);
  const set = <K extends keyof SpecialtyForm>(k: K, v: SpecialtyForm[K]) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">{form.id ? "تعديل تخصص" : "إضافة تخصص"}</h2>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted"><XIcon className="h-4 w-4" /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.slug.trim() || !form.name_ar.trim() || !form.name_en.trim()) {
              toast.error("Slug والاسم بالعربي والإنجليزي مطلوبة");
              return;
            }
            onSave(form);
          }}
          className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2"
        >
          <Field label="Slug (بالإنجليزي، بدون مسافات) *">
            <input required dir="ltr" value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className={inputCls} placeholder="cardiology" />
          </Field>
          <Field label="أيقونة (اسم Lucide)">
            <input dir="ltr" value={form.icon} onChange={(e) => set("icon", e.target.value)} className={inputCls} placeholder="Heart" />
          </Field>
          <Field label="الاسم (عربي) *">
            <input required value={form.name_ar} onChange={(e) => set("name_ar", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Name (English) *">
            <input required dir="ltr" value={form.name_en} onChange={(e) => set("name_en", e.target.value)} className={inputCls} />
          </Field>
          <Field label="وصف (عربي)" full>
            <textarea value={form.description_ar} onChange={(e) => set("description_ar", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Description (English)" full>
            <textarea dir="ltr" value={form.description_en} onChange={(e) => set("description_en", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="الترتيب">
            <input type="number" value={form.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="الحالة">
            <label className="mt-2 inline-flex items-center gap-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              <span className="text-sm">نشط</span>
            </label>
          </Field>
          <div className="sm:col-span-2 mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onCancel} className="rounded-md border border-input px-4 py-2 text-sm">إلغاء</button>
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Availability Tab ---------------- */

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function AvailabilityTab() {
  const doctorsFn = useServerFn(listDoctorsAdmin);
  const listFn = useServerFn(listAvailability);
  const createFn = useServerFn(createAvailability);
  const deleteFn = useServerFn(deleteAvailability);

  const doctorsQ = useQuery({ queryKey: ["admin-doctors"], queryFn: () => doctorsFn() });
  const [doctorId, setDoctorId] = useState<string>("");

  const slotsQ = useQuery({
    queryKey: ["admin-availability", doctorId],
    queryFn: () => listFn({ data: { doctor_id: doctorId } }),
    enabled: !!doctorId,
  });

  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [slotMinutes, setSlotMinutes] = useState(30);

  const addM = useMutation({
    mutationFn: () => createFn({ data: { doctor_id: doctorId, weekday, start_time: startTime, end_time: endTime, slot_minutes: slotMinutes } }),
    onSuccess: () => { toast.success("تمت إضافة الفترة"); slotsQ.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل الإضافة"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("تم الحذف"); slotsQ.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });

  const doctors = doctorsQ.data ?? [];
  const slots = slotsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <label className="block text-sm font-medium">اختر الطبيب</label>
        <select
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          className={`${inputCls} mt-2 max-w-md`}
        >
          <option value="">— اختر —</option>
          {doctors.map((d: any) => (
            <option key={d.id} value={d.id}>
              {d.name_ar} {d.specialties?.name_ar ? `— ${d.specialties.name_ar}` : ""}
            </option>
          ))}
        </select>
      </div>

      {doctorId && (
        <>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-bold">إضافة فترة دوام</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="اليوم">
                <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={inputCls}>
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </Field>
              <Field label="من">
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
              </Field>
              <Field label="إلى">
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
              </Field>
              <Field label="مدة الحجز (دقيقة)">
                <input type="number" min={5} max={240} value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} className={inputCls} />
              </Field>
              <div className="flex items-end">
                <button
                  onClick={() => addM.mutate()}
                  disabled={addM.isPending}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  <Plus className="inline h-4 w-4 -mt-0.5" /> إضافة
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">اليوم</th>
                  <th className="px-4 py-3">من</th>
                  <th className="px-4 py-3">إلى</th>
                  <th className="px-4 py-3">مدة الحجز</th>
                  <th className="px-4 py-3">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {slotsQ.isLoading && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">جارٍ التحميل…</td></tr>
                )}
                {!slotsQ.isLoading && slots.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">لا توجد فترات لهذا الطبيب</td></tr>
                )}
                {slots.map((s: any) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{WEEKDAYS[s.weekday]}</td>
                    <td className="px-4 py-3" dir="ltr">{s.start_time}</td>
                    <td className="px-4 py-3" dir="ltr">{s.end_time}</td>
                    <td className="px-4 py-3" dir="ltr">{s.slot_minutes} د</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { if (confirm("حذف هذه الفترة؟")) delM.mutate(s.id); }}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

