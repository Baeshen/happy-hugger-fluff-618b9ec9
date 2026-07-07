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

export const listDoctorsForAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);
    const { data } = await sb
      .from("doctors")
      .select("id, name_ar, branch_id")
      .order("name_ar", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((d) => ({
      id: d.id as string,
      name_ar: d.name_ar as string,
      branch_id: d.branch_id as string | null,
    }));
  });

const STATUS_KEYS = ["active", "inactive", "archived", "deceased"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

const TransitionsInput = z.object({
  branchId: z.string().uuid().nullable().optional(),
  doctorId: z.string().uuid().nullable().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type PatientTransitions = {
  period: { from: string; to: string; days: number };
  previous: { from: string; to: string };
  denominator: number; // eligible patients pool
  current: {
    totalChanges: number;
    perTarget: Record<StatusKey, number>;
    perTransition: { from: string; to: string; count: number }[];
    ratePerTarget: Record<StatusKey, number>; // percent of denominator
  };
  prior: {
    totalChanges: number;
    perTarget: Record<StatusKey, number>;
    ratePerTarget: Record<StatusKey, number>;
  };
  delta: {
    totalChanges: number; // current - prior
    perTarget: Record<StatusKey, number>;
    ratePerTarget: Record<StatusKey, number>;
  };
  daily: { day: string; count: number }[];
};

function emptyPerTarget(): Record<StatusKey, number> {
  return { active: 0, inactive: 0, archived: 0, deceased: 0 };
}

export const getPatientTransitions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TransitionsInput.parse(d))
  .handler(async ({ data, context }): Promise<PatientTransitions> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    // Build eligible patient pool respecting branch + doctor filters
    let pq = sb.from("patients").select("id, branch_id");
    if (data.branchId) pq = pq.eq("branch_id", data.branchId);
    const { data: pRows, error: pErr } = await pq.limit(20000);
    if (pErr) throw new Error(pErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let eligibleIds = new Set<string>(((pRows ?? []) as any[]).map((r) => r.id as string));

    if (data.doctorId) {
      const { data: vRows } = await sb
        .from("patient_visits")
        .select("patient_id")
        .eq("doctor_id", data.doctorId)
        .limit(20000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withDoctor = new Set<string>(((vRows ?? []) as any[]).map((r) => r.patient_id as string));
      eligibleIds = new Set([...eligibleIds].filter((id) => withDoctor.has(id)));
    }

    const denominator = eligibleIds.size;

    // Compute period lengths
    const start = new Date(`${data.from}T00:00:00`);
    const end = new Date(`${data.to}T23:59:59`);
    const dayMs = 86400_000;
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
    const priorStart = new Date(start.getTime() - days * dayMs);
    const priorEnd = new Date(start.getTime() - 1);
    const priorFromISO = priorStart.toISOString().slice(0, 10);
    const priorToISO = priorEnd.toISOString().slice(0, 10);

    async function loadAudit(fromISO: string, toISO: string) {
      const { data: rows } = await sb
        .from("security_audit_log")
        .select("created_at, metadata, action")
        .in("action", ["patient.status_changed", "patient.bulk_status_changed"])
        .gte("created_at", `${fromISO}T00:00:00`)
        .lte("created_at", `${toISO}T23:59:59`)
        .limit(10000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (rows ?? []) as any[];
    }

    function aggregate(
      rows: unknown[],
      opts: { daily?: boolean } = {},
    ): {
      total: number;
      perTarget: Record<StatusKey, number>;
      perTransition: Map<string, number>;
      daily: Map<string, number>;
    } {
      const perTarget = emptyPerTarget();
      const perTransition = new Map<string, number>();
      const daily = new Map<string, number>();
      let total = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of rows as any[]) {
        const meta = row.metadata ?? {};
        const day = (row.created_at ?? "").slice(0, 10);
        if (row.action === "patient.status_changed") {
          const pid = meta.patient_id as string | undefined;
          if (!pid || !eligibleIds.has(pid)) continue;
          const to = String(meta.to ?? "");
          const from = String(meta.from ?? "");
          if (!STATUS_KEYS.includes(to as StatusKey)) continue;
          perTarget[to as StatusKey]++;
          const key = `${from || "?"}→${to}`;
          perTransition.set(key, (perTransition.get(key) ?? 0) + 1);
          total++;
          if (opts.daily && day) daily.set(day, (daily.get(day) ?? 0) + 1);
        } else {
          // bulk
          const ids: string[] = Array.isArray(meta.ids) ? meta.ids : [];
          const relevantIds = ids.filter((id) => eligibleIds.has(id));
          if (!relevantIds.length) continue;
          const to = String(meta.to ?? "");
          if (!STATUS_KEYS.includes(to as StatusKey)) continue;
          const n = relevantIds.length;
          perTarget[to as StatusKey] += n;
          const key = `?→${to}`;
          perTransition.set(key, (perTransition.get(key) ?? 0) + n);
          total += n;
          if (opts.daily && day) daily.set(day, (daily.get(day) ?? 0) + n);
        }
      }
      return { total, perTarget, perTransition, daily };
    }

    const [curRows, prevRows] = await Promise.all([
      loadAudit(data.from, data.to),
      loadAudit(priorFromISO, priorToISO),
    ]);

    const cur = aggregate(curRows, { daily: true });
    const prev = aggregate(prevRows);

    function rate(per: Record<StatusKey, number>): Record<StatusKey, number> {
      const r = emptyPerTarget();
      if (!denominator) return r;
      for (const k of STATUS_KEYS) r[k] = +((per[k] / denominator) * 100).toFixed(2);
      return r;
    }

    const curRates = rate(cur.perTarget);
    const priorRates = rate(prev.perTarget);
    const deltaPerTarget = emptyPerTarget();
    const deltaRate = emptyPerTarget();
    for (const k of STATUS_KEYS) {
      deltaPerTarget[k] = cur.perTarget[k] - prev.perTarget[k];
      deltaRate[k] = +(curRates[k] - priorRates[k]).toFixed(2);
    }

    // Fill daily series
    const dailySeries: { day: string; count: number }[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      dailySeries.push({ day: iso, count: cur.daily.get(iso) ?? 0 });
    }

    return {
      period: { from: data.from, to: data.to, days },
      previous: { from: priorFromISO, to: priorToISO },
      denominator,
      current: {
        totalChanges: cur.total,
        perTarget: cur.perTarget,
        perTransition: [...cur.perTransition.entries()]
          .map(([k, count]) => {
            const [f, t] = k.split("→");
            return { from: f, to: t, count };
          })
          .sort((a, b) => b.count - a.count),
        ratePerTarget: curRates,
      },
      prior: {
        totalChanges: prev.total,
        perTarget: prev.perTarget,
        ratePerTarget: priorRates,
      },
      delta: {
        totalChanges: cur.total - prev.total,
        perTarget: deltaPerTarget,
        ratePerTarget: deltaRate,
      },
      daily: dailySeries,
    };
  });

const RecentEventsInput = z.object({
  branchId: z.string().uuid().nullable().optional(),
  doctorId: z.string().uuid().nullable().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.number().int().min(1).max(50).optional(),
});

export type RecentStatusEvent = {
  audit_id: string;
  created_at: string;
  action: string;
  from: string | null;
  to: string;
  reason: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_mrn: string | null;
  branch_name: string | null;
  actor_name: string | null;
  count: number; // >1 for bulk events
};

export const listRecentStatusChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RecentEventsInput.parse(d))
  .handler(async ({ data, context }): Promise<RecentStatusEvent[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    // Eligible pool for branch/doctor filters
    let pq = sb.from("patients").select("id, branch_id");
    if (data.branchId) pq = pq.eq("branch_id", data.branchId);
    const { data: pRows } = await pq.limit(20000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let eligible = new Set<string>(((pRows ?? []) as any[]).map((r) => r.id as string));
    if (data.doctorId) {
      const { data: vRows } = await sb
        .from("patient_visits")
        .select("patient_id")
        .eq("doctor_id", data.doctorId)
        .limit(20000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withDoc = new Set<string>(((vRows ?? []) as any[]).map((r) => r.patient_id as string));
      eligible = new Set([...eligible].filter((id) => withDoc.has(id)));
    }
    const applyFilter = data.branchId != null || data.doctorId != null;

    const { data: rows } = await sb
      .from("security_audit_log")
      .select("id, created_at, action, reason, actor, metadata")
      .in("action", ["patient.status_changed", "patient.bulk_status_changed"])
      .gte("created_at", `${data.from}T00:00:00`)
      .lte("created_at", `${data.to}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(500);

    const limit = data.limit ?? 20;
    const events: RecentStatusEvent[] = [];
    const patientIds = new Set<string>();
    const actorIds = new Set<string>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (rows ?? []) as any[]) {
      if (events.length >= limit) break;
      const meta = row.metadata ?? {};
      if (row.action === "patient.status_changed") {
        const pid = meta.patient_id as string | undefined;
        if (applyFilter && (!pid || !eligible.has(pid))) continue;
        if (pid) patientIds.add(pid);
        if (row.actor) actorIds.add(row.actor);
        events.push({
          audit_id: row.id,
          created_at: row.created_at,
          action: row.action,
          from: (meta.from as string) ?? null,
          to: String(meta.to ?? ""),
          reason: (row.reason as string) ?? (meta.reason as string) ?? null,
          patient_id: pid ?? null,
          patient_name: null,
          patient_mrn: null,
          branch_name: null,
          actor_name: null,
          count: 1,
        });
      } else {
        const ids: string[] = Array.isArray(meta.ids) ? meta.ids : [];
        const rel = applyFilter ? ids.filter((id) => eligible.has(id)) : ids;
        if (!rel.length) continue;
        if (row.actor) actorIds.add(row.actor);
        events.push({
          audit_id: row.id,
          created_at: row.created_at,
          action: row.action,
          from: null,
          to: String(meta.to ?? ""),
          reason: (row.reason as string) ?? (meta.reason as string) ?? null,
          patient_id: null,
          patient_name: null,
          patient_mrn: null,
          branch_name: null,
          actor_name: null,
          count: rel.length,
        });
      }
    }

    // Enrich patient info
    if (patientIds.size) {
      const { data: pats } = await sb
        .from("patients")
        .select("id, full_name_ar, mrn, branches(name_ar)")
        .in("id", [...patientIds]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (pats ?? []) as any[]) map.set(p.id, p);
      for (const e of events) {
        if (e.patient_id && map.has(e.patient_id)) {
          const p = map.get(e.patient_id);
          e.patient_name = p.full_name_ar ?? null;
          e.patient_mrn = p.mrn ?? null;
          e.branch_name = p.branches?.name_ar ?? null;
        }
      }
    }

    // Enrich actor names
    if (actorIds.size) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, full_name")
        .in("id", [...actorIds]);
      const nameMap = new Map<string, string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (profs ?? []) as any[]) nameMap.set(p.id, p.full_name ?? "");
      // We stored actor id in a local; re-loop using rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rowMap = new Map<string, string | null>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of (rows ?? []) as any[]) rowMap.set(row.id, row.actor ?? null);
      for (const e of events) {
        const actor = rowMap.get(e.audit_id);
        if (actor) e.actor_name = nameMap.get(actor) ?? null;
      }
    }

    return events;
  });


// ============ KPI drill-down: patients list backing a KPI card ============

const KpiPatientsInput = z.object({
  branchId: z.string().uuid().nullable().optional(),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  minAge: z.number().int().min(0).max(150).nullable().optional(),
  maxAge: z.number().int().min(0).max(150).nullable().optional(),
  status: z.enum(["active", "inactive", "archived", "deceased"]).nullable().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type KpiPatientRow = {
  id: string;
  full_name_ar: string | null;
  mrn: string | null;
  status: string;
  branch_name: string | null;
  created_at: string;
};

export const listPatientsForKpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => KpiPatientsInput.parse(d))
  .handler(async ({ data, context }): Promise<KpiPatientRow[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    let q = sb
      .from("patients")
      .select("id, full_name_ar, mrn, status, date_of_birth, created_at, branches(name_ar)");
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.gender) q = q.eq("gender", data.gender);
    if (data.status) q = q.eq("status", data.status);
    q = q.order("created_at", { ascending: false }).limit(data.limit ?? 200);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = ((rows ?? []) as any[]).filter((p) => {
      const age = ageFromDOB(p.date_of_birth);
      if (data.minAge != null && (age == null || age < data.minAge)) return false;
      if (data.maxAge != null && (age == null || age > data.maxAge)) return false;
      return true;
    });

    return filtered.map((p) => ({
      id: p.id as string,
      full_name_ar: (p.full_name_ar as string | null) ?? null,
      mrn: (p.mrn as string | null) ?? null,
      status: p.status as string,
      branch_name: p.branches?.name_ar ?? null,
      created_at: p.created_at as string,
    }));
  });

// ============ Patient transitions table (per-patient rows) ============

const TransitionRowsInput = z.object({
  branchId: z.string().uuid().nullable().optional(),
  doctorId: z.string().uuid().nullable().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  minAge: z.number().int().min(0).max(150).nullable().optional(),
  maxAge: z.number().int().min(0).max(150).nullable().optional(),
  limit: z.number().int().min(1).max(2000).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});

export type PatientTransitionRow = {
  audit_id: string;
  created_at: string;
  patient_id: string;
  patient_name: string | null;
  patient_mrn: string | null;
  branch_name: string | null;
  from: string | null;
  to: string;
  reason: string | null;
  actor_name: string | null;
  bulk: boolean;
};

export const listPatientTransitionRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TransitionRowsInput.parse(d))
  .handler(async ({ data, context }): Promise<PatientTransitionRow[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    // Build eligible patient pool respecting branch/doctor/gender/age filters
    let pq = sb
      .from("patients")
      .select("id, full_name_ar, mrn, gender, date_of_birth, branch_id, branches(name_ar)");
    if (data.branchId) pq = pq.eq("branch_id", data.branchId);
    if (data.gender) pq = pq.eq("gender", data.gender);
    const { data: pRows, error: pErr } = await pq.limit(20000);
    if (pErr) throw new Error(pErr.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patientMap = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (pRows ?? []) as any[]) {
      const age = ageFromDOB(p.date_of_birth);
      if (data.minAge != null && (age == null || age < data.minAge)) continue;
      if (data.maxAge != null && (age == null || age > data.maxAge)) continue;
      patientMap.set(p.id as string, p);
    }

    if (data.doctorId) {
      const { data: vRows } = await sb
        .from("patient_visits")
        .select("patient_id")
        .eq("doctor_id", data.doctorId)
        .limit(20000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withDoc = new Set<string>(((vRows ?? []) as any[]).map((r) => r.patient_id as string));
      for (const id of [...patientMap.keys()]) if (!withDoc.has(id)) patientMap.delete(id);
    }

    // Fetch audit log
    const { data: audit } = await sb
      .from("security_audit_log")
      .select("id, created_at, action, actor, reason, metadata")
      .in("action", ["patient.status_changed", "patient.bulk_status_changed"])
      .gte("created_at", `${data.from}T00:00:00`)
      .lte("created_at", `${data.to}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(5000);

    const limit = data.limit ?? 500;
    const rows: PatientTransitionRow[] = [];
    const actorIds = new Set<string>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ev of ((audit ?? []) as any[])) {
      if (rows.length >= limit) break;
      const meta = ev.metadata ?? {};
      const reason = (ev.reason as string) ?? (meta.reason as string) ?? null;
      if (ev.action === "patient.status_changed") {
        const pid = meta.patient_id as string | undefined;
        if (!pid || !patientMap.has(pid)) continue;
        const p = patientMap.get(pid);
        if (ev.actor) actorIds.add(ev.actor);
        rows.push({
          audit_id: ev.id,
          created_at: ev.created_at,
          patient_id: pid,
          patient_name: p.full_name_ar ?? null,
          patient_mrn: p.mrn ?? null,
          branch_name: p.branches?.name_ar ?? null,
          from: (meta.from as string) ?? null,
          to: String(meta.to ?? ""),
          reason,
          actor_name: null,
          bulk: false,
        });
      } else {
        const ids: string[] = Array.isArray(meta.ids) ? meta.ids : [];
        for (const pid of ids) {
          if (rows.length >= limit) break;
          if (!patientMap.has(pid)) continue;
          const p = patientMap.get(pid);
          if (ev.actor) actorIds.add(ev.actor);
          rows.push({
            audit_id: ev.id,
            created_at: ev.created_at,
            patient_id: pid,
            patient_name: p.full_name_ar ?? null,
            patient_mrn: p.mrn ?? null,
            branch_name: p.branches?.name_ar ?? null,
            from: null,
            to: String(meta.to ?? ""),
            reason,
            actor_name: null,
            bulk: true,
          });
        }
      }
    }

    if (actorIds.size) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, full_name")
        .in("id", [...actorIds]);
      const nameMap = new Map<string, string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of ((profs ?? []) as any[])) nameMap.set(p.id, p.full_name ?? "");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actorByAudit = new Map<string, string | null>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ev of ((audit ?? []) as any[])) actorByAudit.set(ev.id, ev.actor ?? null);
      for (const r of rows) {
        const a = actorByAudit.get(r.audit_id);
        if (a) r.actor_name = nameMap.get(a) ?? null;
      }
    }

    return rows;
  });
