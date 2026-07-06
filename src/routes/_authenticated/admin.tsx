import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyRoles,
  getAdminStats,
  listAppointments,
  updateAppointmentStatus,
  listOrders,
  updateOrderStatus,
  listDoctorsAdmin,
  toggleDoctorActive,
  listSpecialtiesAdmin,
  createDoctor,
  updateDoctor,
  deleteDoctor,
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

type Tab = "overview" | "appointments" | "orders" | "doctors";

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

function AppointmentsTab() {
  const listFn = useServerFn(listAppointments);
  const updateFn = useServerFn(updateAppointmentStatus);
  const q = useQuery({ queryKey: ["admin-appts"], queryFn: () => listFn() });
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
            <th className="px-4 py-3">التخصص / الطبيب</th>
            <th className="px-4 py-3">التاريخ</th>
            <th className="px-4 py-3">الوقت</th>
            <th className="px-4 py-3">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">لا توجد مواعيد</td></tr>
          )}
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{r.patient_name}</td>
              <td className="px-4 py-3" dir="ltr">{r.patient_phone}</td>
              <td className="px-4 py-3">
                <div>{r.specialties?.name_ar ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{r.doctors?.name_ar ?? "—"}</div>
              </td>
              <td className="px-4 py-3" dir="ltr">{r.appointment_date}</td>
              <td className="px-4 py-3" dir="ltr">{r.appointment_time}</td>
              <td className="px-4 py-3">
                <select
                  defaultValue={r.status}
                  onChange={(e) => m.mutate({ id: r.id, status: e.target.value })}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {APPT_STATUS.map((s) => (
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

function DoctorsTab() {
  const listFn = useServerFn(listDoctorsAdmin);
  const toggleFn = useServerFn(toggleDoctorActive);
  const q = useQuery({ queryKey: ["admin-doctors"], queryFn: () => listFn() });
  const m = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggleFn({ data: v }),
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
            <th className="px-4 py-3">الطبيب</th>
            <th className="px-4 py-3">التخصص</th>
            <th className="px-4 py-3">اللغات</th>
            <th className="px-4 py-3">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">لا يوجد أطباء</td></tr>
          )}
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-3">
                <div className="font-medium">{r.name_ar}</div>
                <div className="text-xs text-muted-foreground">{r.title_ar}</div>
              </td>
              <td className="px-4 py-3">{r.specialties?.name_ar ?? "—"}</td>
              <td className="px-4 py-3 text-xs">{(r.languages ?? []).join(", ")}</td>
              <td className="px-4 py-3">
                <button
                  onClick={() => m.mutate({ id: r.id, is_active: !r.is_active })}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    r.is_active
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {r.is_active ? "نشط" : "متوقف"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
