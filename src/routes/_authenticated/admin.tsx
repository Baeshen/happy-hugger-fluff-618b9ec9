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
  updateAppointmentNotes,
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
  listReminderPreferenceAudit,
  getReminderPreferenceStats,
  exportReminderPreferenceAuditCsv,
  listSecurityAuditLog,
  listSecurityAuditActions,
  listFaqsAdmin,
  createFaq,
  updateFaq,
  deleteFaq,
  listAboutSectionsAdmin,
  createAboutSection,
  updateAboutSection,
  deleteAboutSection,
} from "@/lib/admin.functions";
import { ReminderPreferenceHistoryList } from "@/components/ReminderPreferenceHistory";
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
  Bell,
  BarChart3,
  Download,
  ShieldAlert,
  Search,
  FileText,
  HelpCircle,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "لوحة التحكم | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminDashboard,
});

type Tab = "overview" | "appointments" | "orders" | "doctors" | "specialties" | "availability" | "reminders-audit" | "reminders-stats" | "security-audit" | "content";

const APPT_STATUS: {
  value: "new" | "confirmed" | "completed" | "cancelled" | "no_show";
  label: string;
}[] = [
  { value: "new", label: "جديد" },
  { value: "confirmed", label: "مؤكد" },
  { value: "completed", label: "منتهي" },
  { value: "cancelled", label: "ملغي" },
  { value: "no_show", label: "لم يحضر" },
];

const ORDER_STATUS: {
  value: "new" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
  label: string;
}[] = [
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
    return (
      <div className="container-app py-16 text-center text-muted-foreground">جارٍ التحميل…</div>
    );
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

  const tabs: { id: Tab; label: string; icon: any; show: boolean }[] = [
    { id: "overview" as Tab, label: "نظرة عامة", icon: LayoutDashboard, show: true },
    { id: "appointments" as Tab, label: "المواعيد", icon: CalendarDays, show: canSeeAppts },
    { id: "orders" as Tab, label: "طلبات الأدوية", icon: Pill, show: canSeeOrders },
    { id: "doctors" as Tab, label: "الأطباء", icon: Stethoscope, show: isAdmin },
    { id: "specialties" as Tab, label: "التخصصات", icon: Tag, show: isAdmin },
    {
      id: "availability" as Tab,
      label: "فترات الدوام",
      icon: CalendarClock,
      show: isAdmin || isReception,
    },
    {
      id: "reminders-audit" as Tab,
      label: "سجل التذكيرات",
      icon: Bell,
      show: canSeeAppts,
    },
    {
      id: "reminders-stats" as Tab,
      label: "إحصائيات التذكيرات",
      icon: BarChart3,
      show: canSeeAppts,
    },
    {
      id: "security-audit" as Tab,
      label: "سجل الأمان",
      icon: ShieldAlert,
      show: isAdmin,
    },
    {
      id: "content" as Tab,
      label: "المحتوى",
      icon: FileText,
      show: isAdmin,
    },
  ].filter((t) => t.show);

  return (
    <div className="container-app py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أدوارك:{" "}
            {roles.map((r) => (
              <span
                key={r}
                className="mx-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {r}
              </span>
            ))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            الموقع
          </Link>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
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
      {tab === "reminders-audit" && canSeeAppts && <RemindersAuditTab />}
      {tab === "reminders-stats" && canSeeAppts && <RemindersStatsTab />}
      {tab === "security-audit" && isAdmin && <SecurityAuditTab />}
      {tab === "content" && isAdmin && <ContentTab />}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number;
  icon: any;
  tone?: string;
}) {
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
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${APPT_STATUS_STYLES[status]}`}
    >
      {label}
    </span>
  );
}

function AppointmentsTab() {
  const listFn = useServerFn(listAppointments);
  const updateFn = useServerFn(updateAppointmentStatus);
  const updateNotesFn = useServerFn(updateAppointmentNotes);
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
      // Reason exceeds the 500-char cap (mirrors Zod .max(500)).
      if (/reason_too_long/i.test(msg) || /السبب طويل جدًا/.test(msg)) {
        toast.error("السبب طويل جدًا (الحد الأقصى 500 حرفًا)");
        return;
      }
      toast.error(msg || "فشل التحديث");
    },
  });

  const notesM = useMutation({
    mutationFn: (v: { id: string; notes: string | null; reason?: string }) =>
      updateNotesFn({ data: v }),
    onSuccess: () => {
      toast.success("تم تحديث الملاحظات");
      q.refetch();
    },
    onError: (e: any) => {
      const msg: string = e?.message ?? "";
      if (/notes_too_long/i.test(msg) || /الملاحظات طويلة جدًا/.test(msg)) {
        toast.error("الملاحظات طويلة جدًا (الحد الأقصى 500 حرفًا)");
        return;
      }
      if (/reason_too_long/i.test(msg) || /السبب طويل جدًا/.test(msg)) {
        toast.error("السبب طويل جدًا (الحد الأقصى 500 حرفًا)");
        return;
      }
      toast.error(msg || "فشل تحديث الملاحظات");
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

  // Edit the row's notes via prompt. Empty-after-trim clears the field
  // (persisted as NULL); interior whitespace is preserved verbatim by the
  // DB-side normalize_reason() helper.
  const editNotes = (id: string, current: string | null) => {
    const raw = window.prompt("الملاحظات (اتركها فارغة للمسح):", current ?? "");
    if (raw === null) return; // cancelled
    const trimmed = normalizeReason(raw);
    notesM.mutate({
      id,
      notes: isEmptyReason(trimmed) ? null : (trimmed as string),
    });
  };

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const all = (q.data ?? []) as any[];
  const rows = all.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay =
        `${r.patient_name ?? ""} ${r.patient_phone ?? ""} ${r.national_id ?? ""}`.toLowerCase();
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
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  لا توجد مواعيد مطابقة
                </td>
              </tr>
            )}
            {rows.map((r: any) => {
              const status = r.status as ApptStatus;
              const pending = m.isPending && m.variables?.id === r.id;
              const isFinal =
                status === "completed" || status === "cancelled" || status === "no_show";
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.patient_name}</div>
                    {r.national_id && (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {r.national_id}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    <a href={`tel:${r.patient_phone}`} className="hover:text-primary">
                      {r.patient_phone}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <div>{r.specialties?.name_ar ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.doctors?.name_ar ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    {r.appointment_date}
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    {r.appointment_time}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
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
                        disabled={notesM.isPending && notesM.variables?.id === r.id}
                        onClick={() => editNotes(r.id, r.notes ?? null)}
                        className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
                        title="تعديل الملاحظات"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        ملاحظة
                      </button>
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
  const remFn = useServerFn(listReminderPreferenceAudit);
  const q = useQuery({
    queryKey: ["appt-audit", appointmentId],
    queryFn: () => fn({ data: { appointmentId } }),
  });
  const rq = useQuery({
    queryKey: ["appt-reminder-audit", appointmentId],
    queryFn: () => remFn({ data: { appointmentId, pageSize: 100 } }),
  });
  const rows = (q.data ?? []) as any[];
  const reminderRows = ((rq.data as any)?.rows ?? []) as any[];
  const statusLabel = (v: string | null) =>
    v ? (APPT_STATUS.find((s) => s.value === v)?.label ?? v) : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
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
                {(r.old_notes !== null || r.new_notes !== null) &&
                  (r.old_notes !== undefined || r.new_notes !== undefined) && (
                    <div className="mt-1 text-xs">
                      <div className="text-muted-foreground">الملاحظات قبل:</div>
                      <div className="whitespace-pre-wrap rounded bg-muted/50 p-2">
                        {r.old_notes ?? "—"}
                      </div>
                      <div className="mt-1 text-muted-foreground">الملاحظات بعد:</div>
                      <div className="whitespace-pre-wrap rounded bg-muted/50 p-2">
                        {r.new_notes ?? "—"}
                      </div>
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

        <div className="mt-6 border-t border-border pt-4">
          <h4 className="mb-2 text-sm font-semibold">سجل تفضيلات التذكير</h4>
          {rq.isLoading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
          ) : (
            <ReminderPreferenceHistoryList rows={reminderRows} showActor />
          )}
        </div>
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
    onSuccess: () => {
      toast.success("تم التحديث");
      q.refetch();
    },
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
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                لا توجد طلبات
              </td>
            </tr>
          )}
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{r.patient_name}</td>
              <td className="px-4 py-3" dir="ltr">
                {r.patient_phone}
              </td>
              <td className="px-4 py-3">
                <div>{r.district ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{r.address ?? ""}</div>
              </td>
              <td className="px-4 py-3">{r.delivery_type}</td>
              <td className="px-4 py-3">
                {r.prescription_image_url ? (
                  <a
                    href={r.prescription_image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    عرض
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <select
                  defaultValue={r.status}
                  onChange={(e) => m.mutate({ id: r.id, status: e.target.value })}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {ORDER_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
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
    onSuccess: () => {
      toast.success("تم التحديث");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل التحديث"),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      q.refetch();
    },
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
        languages: form.languages
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
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
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  لا يوجد أطباء
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {r.photo_url && (
                      <img
                        src={r.photo_url}
                        alt={r.name_ar}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <div className="font-medium">{r.name_ar}</div>
                      <div className="text-xs text-muted-foreground">{r.title_ar ?? "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{r.specialties?.name_ar ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{(r.languages ?? []).join(", ")}</td>
                <td className="px-4 py-3 text-xs" dir="ltr">
                  {r.sort_order}
                </td>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">{form.id ? "تعديل طبيب" : "إضافة طبيب"}</h2>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted">
            <XIcon className="h-4 w-4" />
          </button>
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
            <input
              required
              value={form.name_ar}
              onChange={(e) => set("name_ar", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Name (English) *">
            <input
              required
              dir="ltr"
              value={form.name_en}
              onChange={(e) => set("name_en", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="المسمى (عربي)">
            <input
              value={form.title_ar}
              onChange={(e) => set("title_ar", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Title (English)">
            <input
              dir="ltr"
              value={form.title_en}
              onChange={(e) => set("title_en", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="التخصص">
            <select
              value={form.specialty_id ?? ""}
              onChange={(e) => set("specialty_id", e.target.value || null)}
              className={inputCls}
            >
              <option value="">— بدون —</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}
                </option>
              ))}
            </select>
          </Field>
          <Field label="اللغات (مفصولة بفاصلة)">
            <input
              dir="ltr"
              value={form.languages}
              onChange={(e) => set("languages", e.target.value)}
              className={inputCls}
              placeholder="ar,en"
            />
          </Field>
          <Field label="رابط الصورة" full>
            <input
              dir="ltr"
              type="url"
              value={form.photo_url}
              onChange={(e) => set("photo_url", e.target.value)}
              className={inputCls}
              placeholder="https://…"
            />
          </Field>
          <Field label="نبذة (عربي)" full>
            <textarea
              value={form.bio_ar}
              onChange={(e) => set("bio_ar", e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          <Field label="Bio (English)" full>
            <textarea
              dir="ltr"
              value={form.bio_en}
              onChange={(e) => set("bio_en", e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          <Field label="الترتيب">
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="الحالة">
            <label className="mt-2 inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
              />
              <span className="text-sm">نشط</span>
            </label>
          </Field>

          <div className="sm:col-span-2 mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-input px-4 py-2 text-sm"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
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
    onSuccess: () => {
      toast.success("تم الحذف");
      q.refetch();
    },
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
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEditing(null);
      q.refetch();
    },
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
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  لا توجد تخصصات
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name_ar}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">
                    {r.name_en}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" dir="ltr">
                  {r.slug}
                </td>
                <td className="px-4 py-3 text-xs">{r.icon ?? "—"}</td>
                <td className="px-4 py-3 text-xs" dir="ltr">
                  {r.sort_order}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    {r.is_active ? "نشط" : "متوقف"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          slug: r.slug ?? "",
                          name_ar: r.name_ar ?? "",
                          name_en: r.name_en ?? "",
                          icon: r.icon ?? "",
                          description_ar: r.description_ar ?? "",
                          description_en: r.description_en ?? "",
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
                        if (confirm(`حذف "${r.name_ar}"؟ سيؤثر ذلك على الأطباء المرتبطين.`))
                          deleteM.mutate(r.id);
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

function SpecialtyFormModal({
  value,
  saving,
  onCancel,
  onSave,
}: {
  value: SpecialtyForm;
  saving: boolean;
  onCancel: () => void;
  onSave: (v: SpecialtyForm) => void;
}) {
  const [form, setForm] = useState<SpecialtyForm>(value);
  const set = <K extends keyof SpecialtyForm>(k: K, v: SpecialtyForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">{form.id ? "تعديل تخصص" : "إضافة تخصص"}</h2>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted">
            <XIcon className="h-4 w-4" />
          </button>
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
            <input
              required
              dir="ltr"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
              className={inputCls}
              placeholder="cardiology"
            />
          </Field>
          <Field label="أيقونة (اسم Lucide)">
            <input
              dir="ltr"
              value={form.icon}
              onChange={(e) => set("icon", e.target.value)}
              className={inputCls}
              placeholder="Heart"
            />
          </Field>
          <Field label="الاسم (عربي) *">
            <input
              required
              value={form.name_ar}
              onChange={(e) => set("name_ar", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Name (English) *">
            <input
              required
              dir="ltr"
              value={form.name_en}
              onChange={(e) => set("name_en", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="وصف (عربي)" full>
            <textarea
              value={form.description_ar}
              onChange={(e) => set("description_ar", e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          <Field label="Description (English)" full>
            <textarea
              dir="ltr"
              value={form.description_en}
              onChange={(e) => set("description_en", e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          <Field label="الترتيب">
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="الحالة">
            <label className="mt-2 inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
              />
              <span className="text-sm">نشط</span>
            </label>
          </Field>
          <div className="sm:col-span-2 mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-input px-4 py-2 text-sm"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
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
    mutationFn: () =>
      createFn({
        data: {
          doctor_id: doctorId,
          weekday,
          start_time: startTime,
          end_time: endTime,
          slot_minutes: slotMinutes,
        },
      }),
    onSuccess: () => {
      toast.success("تمت إضافة الفترة");
      slotsQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الإضافة"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      slotsQ.refetch();
    },
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
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                  className={inputCls}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="من">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="إلى">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="مدة الحجز (دقيقة)">
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={slotMinutes}
                  onChange={(e) => setSlotMinutes(Number(e.target.value))}
                  className={inputCls}
                />
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
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}
                {!slotsQ.isLoading && slots.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      لا توجد فترات لهذا الطبيب
                    </td>
                  </tr>
                )}
                {slots.map((s: any) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{WEEKDAYS[s.weekday]}</td>
                    <td className="px-4 py-3" dir="ltr">
                      {s.start_time}
                    </td>
                    <td className="px-4 py-3" dir="ltr">
                      {s.end_time}
                    </td>
                    <td className="px-4 py-3" dir="ltr">
                      {s.slot_minutes} د
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          if (confirm("حذف هذه الفترة؟")) delM.mutate(s.id);
                        }}
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

// ============================================================================
// Reminders Audit Tab
// ============================================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REMINDER_KIND_LABEL: Record<string, string> = {
  reminder_24h: "قبل 24 ساعة",
  reminder_2h: "قبل ساعتين",
};

const SOURCE_LABEL: Record<string, string> = {
  staff: "موظف",
  self_service: "المريض",
  system: "النظام",
};

const SOURCE_CLASS: Record<string, string> = {
  staff: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  self_service: "bg-muted text-muted-foreground",
  system: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
};

function formatAuditDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function RemindersAuditTab() {
  const listFn = useServerFn(listReminderPreferenceAudit);
  const [appointmentIdInput, setAppointmentIdInput] = useState("");
  const [reminderKind, setReminderKind] = useState<"" | "reminder_24h" | "reminder_2h">("");
  const [source, setSource] = useState<"" | "staff" | "self_service" | "system">("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Applied filters (used in query key). Separate from inputs so typing doesn't fetch.
  const [applied, setApplied] = useState<{
    appointmentId: string;
    reminderKind: "" | "reminder_24h" | "reminder_2h";
    source: "" | "staff" | "self_service" | "system";
  }>({ appointmentId: "", reminderKind: "", source: "" });

  const [uuidError, setUuidError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["reminders-audit", applied, page],
    queryFn: () =>
      listFn({
        data: {
          appointmentId: applied.appointmentId || undefined,
          reminderKind: applied.reminderKind || undefined,
          source: applied.source || undefined,
          page,
          pageSize,
        },
      }),
    placeholderData: (prev) => prev,
  });

  function applyFilters() {
    const trimmed = appointmentIdInput.trim();
    if (trimmed && !UUID_RE.test(trimmed)) {
      setUuidError(
        "الرجاء استخدام معرّف الموعد الكامل (UUID) من صفحة تفاصيل الموعد.",
      );
      return;
    }
    setUuidError(null);
    setApplied({ appointmentId: trimmed, reminderKind, source });
    setPage(1);
  }

  function clearFilters() {
    setAppointmentIdInput("");
    setReminderKind("");
    setSource("");
    setUuidError(null);
    setApplied({ appointmentId: "", reminderKind: "", source: "" });
    setPage(1);
  }

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <ExportRemindersCsvPanel />
      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              معرّف الموعد (UUID كامل)
            </label>
            <input
              type="text"
              value={appointmentIdInput}
              onChange={(e) => setAppointmentIdInput(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              dir="ltr"
            />
            {uuidError && (
              <p className="mt-1 text-xs text-destructive">{uuidError}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              نوع التذكير
            </label>
            <select
              value={reminderKind}
              onChange={(e) => setReminderKind(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">الكل</option>
              <option value="reminder_24h">قبل 24 ساعة</option>
              <option value="reminder_2h">قبل ساعتين</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              المصدر
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">الكل</option>
              <option value="staff">موظف</option>
              <option value="self_service">المريض</option>
              <option value="system">النظام</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={applyFilters}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            تطبيق
          </button>
          <button
            onClick={clearFilters}
            className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
          >
            مسح
          </button>
        </div>
      </div>

      {/* Results */}
      {query.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          جارٍ التحميل…
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {(query.error as Error)?.message ?? "تعذّر تحميل السجلات."}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          لا توجد سجلات مطابقة للمعايير.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-right">التاريخ</th>
                <th className="px-3 py-2 text-right">الموعد</th>
                <th className="px-3 py-2 text-right">نوع التذكير</th>
                <th className="px-3 py-2 text-right">من → إلى</th>
                <th className="px-3 py-2 text-right">المصدر</th>
                <th className="px-3 py-2 text-right">بواسطة</th>
                <th className="px-3 py-2 text-right">السبب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r: any) => {
                const ref = String(r.appointment_id).replace(/-/g, "").slice(0, 8);
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatAuditDate(r.changed_at)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(r.appointment_id);
                          toast.success("تم نسخ معرّف الموعد");
                        }}
                        className="font-mono text-xs text-primary hover:underline"
                        title={r.appointment_id}
                        dir="ltr"
                      >
                        {ref}…
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {REMINDER_KIND_LABEL[r.reminder_kind] ?? r.reminder_kind}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          r.old_value
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        }
                      >
                        {r.old_value ? "✓" : "✗"}
                      </span>
                      <span className="mx-2 text-muted-foreground">←</span>
                      <span
                        className={
                          r.new_value
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        }
                      >
                        {r.new_value ? "✓" : "✗"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          SOURCE_CLASS[r.source] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {SOURCE_LABEL[r.source] ?? r.source}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.changed_by_name || "—"}
                    </td>
                    <td className="max-w-xs px-3 py-2 text-muted-foreground">
                      <span className="line-clamp-2" title={r.reason ?? ""}>
                        {r.reason || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <div className="text-muted-foreground">
            صفحة {page} من {totalPages} — الإجمالي {total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || query.isFetching}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              السابق
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || query.isFetching}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Reminders Stats Tab ---------------- */

function StatBar({ label, value, total, tone = "primary" }: { label: string; value: number; total: number; tone?: "primary" | "emerald" | "amber" | "destructive" | "sky" }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 1000) / 10) : 0;
  const bar = {
    primary: "bg-primary",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    destructive: "bg-destructive",
    sky: "bg-sky-500",
  }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums text-foreground">
          {value.toLocaleString("ar-EG")} <span className="text-xs text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RemindersStatsTab() {
  const fn = useServerFn(getReminderPreferenceStats);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["reminder-preference-stats"],
    queryFn: () => fn(),
  });

  if (isLoading) return <div className="text-muted-foreground">جارٍ تحميل الإحصائيات…</div>;
  if (error) return <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">تعذّر تحميل الإحصائيات.</div>;
  if (!data) return null;

  const total = data.appointmentsTotal;
  const auditTotal = data.auditTotal;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">إحصائيات تفضيلات التذكير</h2>
          <p className="mt-1 text-sm text-muted-foreground">توزيع الحجوزات حسب نوع التذكير المُفعّل، ومطابقتها مع سجل التدقيق.</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
        >
          {isFetching ? "…" : "تحديث"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي الحجوزات" value={total} icon={CalendarDays} />
        <StatCard label="إجمالي سجل التدقيق" value={auditTotal} icon={History} />
        <StatCard label="حجوزات لديها تدقيق" value={data.appointmentsWithAudit} icon={Bell} />
        <StatCard label="تغييرات آخر 7 أيام" value={data.auditLast7d} icon={Clock} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-base font-semibold">توزيع الحجوزات حسب التفضيل</h3>
          <div className="space-y-4">
            <StatBar label="تذكير قبل 24 ساعة مُفعّل" value={data.reminder24Enabled} total={total} tone="primary" />
            <StatBar label="تذكير قبل ساعتين مُفعّل" value={data.reminder2Enabled} total={total} tone="sky" />
            <StatBar label="الاثنان مُفعّلان" value={data.bothEnabled} total={total} tone="emerald" />
            <StatBar label="الاثنان مُعطّلان" value={data.bothDisabled} total={total} tone="destructive" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-base font-semibold">توزيع سجل التدقيق</h3>
          <div className="space-y-4">
            <StatBar label="حسب النوع: 24 ساعة" value={data.audit24} total={auditTotal} tone="primary" />
            <StatBar label="حسب النوع: ساعتان" value={data.audit2} total={auditTotal} tone="sky" />
            <StatBar label="من المراجع (خدمة ذاتية)" value={data.auditSelfService} total={auditTotal} tone="emerald" />
            <StatBar label="من الموظفين" value={data.auditStaff} total={auditTotal} tone="amber" />
            <StatBar label="من النظام" value={data.auditSystem} total={auditTotal} tone="destructive" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-semibold">نسبة التطابق مع سجل التدقيق</h3>
          <span className="text-3xl font-bold text-primary tabular-nums">{data.coveragePct}%</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          نسبة الحجوزات التي لديها تغيير واحد على الأقل في تفضيلات التذكير مقارنةً بإجمالي الحجوزات.
        </p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, data.coveragePct)}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span>{data.appointmentsWithAudit.toLocaleString("ar-EG")} حجز بتغييرات</span>
          <span>من أصل {total.toLocaleString("ar-EG")}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Export Reminder Preferences CSV ---------------- */

function ExportRemindersCsvPanel() {
  const exportFn = useServerFn(exportReminderPreferenceAuditCsv);
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (!ref.trim() && !phone.trim()) {
      toast.error("الرجاء تحديد ref أو رقم الهاتف على الأقل.");
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast.error("تاريخ البداية يجب أن يسبق تاريخ النهاية.");
      return;
    }
    setBusy(true);
    try {
      const res = await exportFn({
        data: {
          ref: ref.trim() || undefined,
          phone: phone.trim() || undefined,
          from: fromDate ? new Date(fromDate + "T00:00:00").toISOString() : undefined,
          to: toDate ? new Date(toDate + "T23:59:59.999").toISOString() : undefined,
        },
      });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (res.count === 0) {
        toast.info("تم التصدير لكن لا توجد سجلات مطابقة.");
      } else {
        toast.success(`تم تصدير ${res.count.toLocaleString("ar-EG")} سجل.`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التصدير.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Download className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">تصدير CSV لتفضيلات التذكير</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            ref (أوّل أحرف معرّف الموعد)
          </label>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="مثلاً a3f19c2b"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            رقم الهاتف
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05xxxxxxxx"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            من تاريخ
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            إلى تاريخ
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          حدّد ref أو الهاتف (أو كليهما) وفترة زمنية اختيارية. الحد الأقصى 5000 سجل.
        </p>
        <button
          onClick={handleExport}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {busy ? "جارٍ التصدير…" : "تصدير CSV"}
        </button>
      </div>
    </div>
  );
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportSecurityAuditCsv(
  items: any[],
  filters: { ref: string; phone: string; action: string; from: string; to: string; limit: number },
) {
  const headers = [
    "created_at",
    "action",
    "appointment_id",
    "patient_name",
    "patient_phone",
    "from_status",
    "to_status",
    "actor_id",
    "actor_name",
    "reason",
  ];
  const lines = [headers.join(",")];
  for (const it of items) {
    lines.push(
      [
        it.created_at ?? "",
        it.action ?? "",
        it.appointment_id ?? "",
        it.patient_name ?? "",
        it.patient_phone ?? "",
        it.from_status ?? "",
        it.to_status ?? "",
        it.actor ?? "",
        it.actor_name ?? "",
        it.reason ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  // Prepend a UTF-8 BOM so Excel opens Arabic text correctly.
  const csv = "\uFEFF" + lines.join("\r\n");

  const parts: string[] = [];
  if (filters.ref) parts.push(`ref-${filters.ref}`);
  if (filters.phone) parts.push(`phone-${filters.phone.replace(/\D/g, "")}`);
  if (filters.action) parts.push(`action-${filters.action}`);
  if (filters.from) parts.push(`from-${filters.from}`);
  if (filters.to) parts.push(`to-${filters.to}`);
  const suffix = parts.length ? `_${parts.join("_")}` : "";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `security-audit_${stamp}${suffix}.csv`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SecurityAuditTab() {
  const listFn = useServerFn(listSecurityAuditLog);
  const actionsFn = useServerFn(listSecurityAuditActions);

  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(100);
  const [applied, setApplied] = useState({
    ref: "",
    phone: "",
    action: "",
    from: "",
    to: "",
    limit: 100,
  });

  const actionsQuery = useQuery({
    queryKey: ["security-audit", "actions"],
    queryFn: () => actionsFn(),
  });

  const listQuery = useQuery({
    queryKey: ["security-audit", "list", applied],
    queryFn: () =>
      listFn({
        data: {
          ref: applied.ref || undefined,
          phone: applied.phone || undefined,
          action: applied.action || undefined,
          from: applied.from ? new Date(applied.from).toISOString() : undefined,
          to: applied.to ? new Date(applied.to + "T23:59:59").toISOString() : undefined,
          limit: applied.limit,
        },
      }),
  });

  const items = listQuery.data?.items ?? [];

  function apply() {
    setApplied({ ref: ref.trim(), phone: phone.trim(), action, from, to, limit });
  }

  function reset() {
    setRef("");
    setPhone("");
    setAction("");
    setFrom("");
    setTo("");
    setLimit(100);
    setApplied({ ref: "", phone: "", action: "", from: "", to: "", limit: 100 });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">تصفية سجل الأمان</div>
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="رقم مرجعي (جزء من UUID)"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="رقم الهاتف"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
          />
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
          >
            <option value="">كل الإجراءات</option>
            {(actionsQuery.data?.actions ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            من
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            إلى
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            الحد الأقصى
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-3 flex items-end gap-2">
            <button
              onClick={apply}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Search className="h-4 w-4" /> بحث
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
            >
              مسح الفلاتر
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="text-sm font-semibold">
            النتائج
            {!listQuery.isLoading && (
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => exportSecurityAuditCsv(items, applied)}
            disabled={listQuery.isLoading || items.length === 0}
            title={items.length === 0 ? "لا توجد نتائج للتصدير" : "تصدير النتائج الحالية إلى CSV"}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            تصدير CSV
          </button>
        </div>
        {listQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
        ) : listQuery.error ? (
          <div className="p-8 text-center text-sm text-red-600">
            {(listQuery.error as Error).message}
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            لا توجد نتائج مطابقة للفلاتر.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">التاريخ</th>
                  <th className="px-3 py-2 text-start">الإجراء</th>
                  <th className="px-3 py-2 text-start">المريض</th>
                  <th className="px-3 py-2 text-start">الهاتف</th>
                  <th className="px-3 py-2 text-start">الحالة</th>
                  <th className="px-3 py-2 text-start">المُنفّذ</th>
                  <th className="px-3 py-2 text-start">السبب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((it: any) => (
                  <tr key={it.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(it.created_at).toLocaleString("ar-EG")}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {it.action}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{it.patient_name ?? "—"}</div>
                      {it.appointment_id && (
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {String(it.appointment_id).slice(0, 8)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{it.patient_phone ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {it.from_status || it.to_status ? (
                        <span>
                          {it.from_status ?? "—"}
                          <span className="mx-1 text-muted-foreground">→</span>
                          <span className="font-medium">{it.to_status ?? "—"}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{it.actor_name ?? (it.actor ? String(it.actor).slice(0, 8) : "—")}</td>
                    <td className="px-3 py-2 text-xs max-w-[240px]">
                      <div className="truncate" title={it.reason ?? ""}>
                        {it.reason ?? "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
