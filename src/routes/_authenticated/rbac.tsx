import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listUsersWithRoles,
  assignRole,
  revokeRole,
  listBranchesForRbac,
  type AppRole,
} from "@/lib/rbac.functions";
import { getMyRoles } from "@/lib/admin.functions";
import { ShieldCheck, UserPlus, X, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rbac")({
  head: () => ({
    meta: [
      { title: "إدارة الصلاحيات | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RbacPage,
});

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "مسؤول أعلى",
  admin: "مسؤول",
  doctor: "طبيب",
  reception: "استقبال",
  pharmacy: "صيدلية",
};
const ROLES: AppRole[] = ["super_admin", "admin", "doctor", "reception", "pharmacy"];

function RbacPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const myRolesFn = useServerFn(getMyRoles);
  const listFn = useServerFn(listUsersWithRoles);
  const branchesFn = useServerFn(listBranchesForRbac);
  const assignFn = useServerFn(assignRole);
  const revokeFn = useServerFn(revokeRole);

  const myRoles = useQuery({ queryKey: ["my-roles"], queryFn: () => myRolesFn() });
  const users = useQuery({ queryKey: ["rbac-users"], queryFn: () => listFn() });
  const branches = useQuery({ queryKey: ["rbac-branches"], queryFn: () => branchesFn() });

  const isSuper = (myRoles.data?.roles ?? []).includes("super_admin" as any);
  const isAdmin = (myRoles.data?.roles ?? []).includes("admin" as any) || isSuper;

  const [q, setQ] = useState("");
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("reception");
  const [newBranch, setNewBranch] = useState<string>("");

  const assignMut = useMutation({
    mutationFn: (v: { user_id: string; role: AppRole; branch_id: string | null }) =>
      assignFn({ data: v }),
    onSuccess: () => {
      toast.success("تم تعيين الصلاحية");
      qc.invalidateQueries({ queryKey: ["rbac-users"] });
      setOpenFor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر التعيين"),
  });

  const revokeMut = useMutation({
    mutationFn: (v: { user_id: string; role: AppRole }) => revokeFn({ data: v }),
    onSuccess: () => {
      toast.success("تم إلغاء الصلاحية");
      qc.invalidateQueries({ queryKey: ["rbac-users"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر الإلغاء"),
  });

  const filtered = useMemo(() => {
    const list = users.data ?? [];
    if (!q.trim()) return list;
    const s = q.trim().toLowerCase();
    return list.filter(
      (u) =>
        (u.full_name ?? "").toLowerCase().includes(s) ||
        (u.email ?? "").toLowerCase().includes(s) ||
        (u.phone ?? "").toLowerCase().includes(s),
    );
  }, [users.data, q]);

  if (myRoles.isLoading) {
    return <div className="container-app py-16 text-center text-muted-foreground">جارٍ التحميل…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="container-app py-16 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">هذه الصفحة للمسؤولين فقط.</p>
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">إدارة الصلاحيات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تعيين وإلغاء الأدوار لكل مستخدم مع تحديد الفرع.
          </p>
        </div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
        >
          <ArrowRight className="h-4 w-4" /> لوحة التحكم
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالاسم أو البريد أو الجوال"
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Link
          to="/audit-log"
          className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
        >
          سجل التدقيق
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right">المستخدم</th>
              <th className="px-3 py-2 text-right">الجوال</th>
              <th className="px-3 py-2 text-right">الأدوار</th>
              <th className="px-3 py-2 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}
            {!users.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  لا توجد نتائج
                </td>
              </tr>
            )}
            {filtered.map((u) => {
              const branchMap = new Map(
                (branches.data ?? []).map((b: any) => [b.id, b.name_ar as string]),
              );
              return (
                <tr key={u.user_id} className="border-t border-border align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium">{u.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email || "—"}</div>
                  </td>
                  <td className="px-3 py-3">{u.phone || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {u.roles.length === 0 && (
                        <span className="text-xs text-muted-foreground">بدون أدوار</span>
                      )}
                      {u.roles.map((r) => (
                        <span
                          key={`${r.role}-${r.branch_id ?? "all"}`}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {ROLE_LABELS[r.role] ?? r.role}
                          {r.branch_id && (
                            <span className="text-primary/70">
                              · {branchMap.get(r.branch_id) ?? "فرع"}
                            </span>
                          )}
                          {(isSuper || (r.role !== "admin" && r.role !== "super_admin")) && (
                            <button
                              onClick={() => {
                                if (!confirm(`إلغاء دور ${ROLE_LABELS[r.role]}؟`)) return;
                                revokeMut.mutate({ user_id: u.user_id, role: r.role });
                              }}
                              className="rounded-full p-0.5 hover:bg-destructive/20"
                              title="إلغاء"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {openFor === u.user_id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value as AppRole)}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          {ROLES.filter((r) =>
                            isSuper ? true : r !== "super_admin" && r !== "admin",
                          ).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <select
                          value={newBranch}
                          onChange={(e) => setNewBranch(e.target.value)}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          <option value="">كل الفروع</option>
                          {(branches.data ?? []).map((b: any) => (
                            <option key={b.id} value={b.id}>
                              {b.name_ar}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() =>
                            assignMut.mutate({
                              user_id: u.user_id,
                              role: newRole,
                              branch_id: newBranch || null,
                            })
                          }
                          disabled={assignMut.isPending}
                          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          حفظ
                        </button>
                        <button
                          onClick={() => setOpenFor(null)}
                          className="rounded-md border border-input px-2.5 py-1 text-xs hover:bg-muted"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setOpenFor(u.user_id);
                          setNewRole("reception");
                          setNewBranch("");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs hover:bg-muted"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> إضافة دور
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
