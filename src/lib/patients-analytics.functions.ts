/**
 * Patient analytics — aggregate KPIs, distributions, and status-change trends.
 * Staff-only. RLS applies via the caller's bearer token.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "reception" | "pharmacy" | "super_admin" | "doctor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRoles(sb: any, userId: string): Promise<Role[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.role as Role);
}
function ensureStaff(roles: Role[]) {
  const ok = roles.some((r) =>
    (["admin", "super_admin", "reception", "doctor"] as Role[]).includes(r),
  );
  if (!ok) throw new Error("ليست لديك الصلاحية.");
}

const Input = z.object({
  branchId: z.string().uuid().nullable().optional(),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  minAge: z.number().int().min(0).max(150).nullable().optional(),
  maxAge: z.number().int().min(0).max(150).nullable().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export type PatientAnalytics = {
  total: number;
  byStatus: { status: string; count: number }[];
  byGender: { gender: string; count: number }[];
  byBranch: { branch_id: string; branch_name: string; count: number }[];
  byAgeGroup: { group: string; count: number }[];
  byTag: { tag: string; count: number }[];
  registrationsDaily: { day: string; count: number }[];
  statusChangesDaily: { day: string; count: number }[];
  statusChangeBreakdown: { to: string; count: number }[];
};

function ageFromDOB(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
function ageGroup(age: number | null): string {
  if (age == null) return "غير محدد";
  if (age < 13) return "0-12";
  if (age < 18) return "13-17";
  if (age < 30) return "18-29";
  if (age < 45) return "30-44";
  if (age < 60) return "45-59";
  return "60+";
}

export const getPatientAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<PatientAnalytics> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    // ---- Patients query with filters (age handled in JS) ----
    let pq = sb
      .from("patients")
      .select(
        "id, status, gender, date_of_birth, branch_id, tags, created_at, branches(name_ar)",
      );
    if (data.branchId) pq = pq.eq("branch_id", data.branchId);
    if (data.gender) pq = pq.eq("gender", data.gender);
    const { data: rows, error } = await pq.limit(10000);
    if (error) throw new Error(error.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patients = ((rows ?? []) as any[]).filter((p) => {
      const age = ageFromDOB(p.date_of_birth);
      if (data.minAge != null && (age == null || age < data.minAge)) return false;
      if (data.maxAge != null && (age == null || age > data.maxAge)) return false;
      return true;
    });

    const patientIds = new Set(patients.map((p) => p.id));

    // ---- Aggregations ----
    const statusMap = new Map<string, number>();
    const genderMap = new Map<string, number>();
    const branchMap = new Map<string, { name: string; count: number }>();
    const ageMap = new Map<string, number>();
    const tagMap = new Map<string, number>();
    const regDaily = new Map<string, number>();

    for (const p of patients) {
      statusMap.set(p.status ?? "غير محدد", (statusMap.get(p.status ?? "غير محدد") ?? 0) + 1);
      const g = p.gender ?? "غير محدد";
      genderMap.set(g, (genderMap.get(g) ?? 0) + 1);
      const bname = p.branches?.name_ar ?? "غير محدد";
      const cur = branchMap.get(p.branch_id) ?? { name: bname, count: 0 };
      branchMap.set(p.branch_id, { name: bname, count: cur.count + 1 });
      const grp = ageGroup(ageFromDOB(p.date_of_birth));
      ageMap.set(grp, (ageMap.get(grp) ?? 0) + 1);
      for (const t of (p.tags ?? []) as string[]) {
        tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
      }
      const day = (p.created_at ?? "").slice(0, 10);
      if (day) regDaily.set(day, (regDaily.get(day) ?? 0) + 1);
    }

    // ---- Status change events from security_audit_log ----
    const from = data.from ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const to = data.to ?? new Date().toISOString().slice(0, 10);

    const { data: audit } = await sb
      .from("security_audit_log")
      .select("created_at, metadata, action")
      .in("action", ["patient.status_changed", "patient.bulk_status_changed"])
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .limit(5000);

    const changeDaily = new Map<string, number>();
    const changeTo = new Map<string, number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (audit ?? []) as any[]) {
      const meta = row.metadata ?? {};
      // Bulk events: increment by count, single by 1. Filter by branch when possible.
      if (row.action === "patient.status_changed") {
        const pid = meta.patient_id as string | undefined;
        if (data.branchId && pid && !patientIds.has(pid)) continue;
        const day = (row.created_at ?? "").slice(0, 10);
        changeDaily.set(day, (changeDaily.get(day) ?? 0) + 1);
        const t = meta.to ?? "غير محدد";
        changeTo.set(t, (changeTo.get(t) ?? 0) + 1);
      } else {
        const ids: string[] = Array.isArray(meta.ids) ? meta.ids : [];
        const relevant = data.branchId ? ids.filter((id) => patientIds.has(id)).length : (meta.count ?? ids.length);
        if (!relevant) continue;
        const day = (row.created_at ?? "").slice(0, 10);
        changeDaily.set(day, (changeDaily.get(day) ?? 0) + relevant);
        const t = meta.to ?? "غير محدد";
        changeTo.set(t, (changeTo.get(t) ?? 0) + relevant);
      }
    }

    // Fill daily series across range for both registrations and changes
    const days: string[] = [];
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }

    const AGE_ORDER = ["0-12", "13-17", "18-29", "30-44", "45-59", "60+", "غير محدد"];

    return {
      total: patients.length,
      byStatus: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
      byGender: [...genderMap.entries()].map(([gender, count]) => ({ gender, count })),
      byBranch: [...branchMap.entries()]
        .map(([branch_id, v]) => ({ branch_id, branch_name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count),
      byAgeGroup: AGE_ORDER.map((g) => ({ group: g, count: ageMap.get(g) ?? 0 })).filter(
        (x) => x.count > 0,
      ),
      byTag: [...tagMap.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      registrationsDaily: days.map((day) => ({ day, count: regDaily.get(day) ?? 0 })),
      statusChangesDaily: days.map((day) => ({ day, count: changeDaily.get(day) ?? 0 })),
      statusChangeBreakdown: [...changeTo.entries()]
        .map(([to, count]) => ({ to, count }))
        .sort((a, b) => b.count - a.count),
    };
  });

export const listBranchesForAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);
    const { data } = await sb
      .from("branches")
      .select("id, name_ar")
      .order("name_ar", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((b) => ({ id: b.id as string, name_ar: b.name_ar as string }));
  });
