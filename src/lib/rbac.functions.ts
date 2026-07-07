import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ROLES = ["super_admin", "admin", "doctor", "reception", "pharmacy"] as const;
export type AppRole = (typeof ROLES)[number];

function humanize(err: any, fallback = "تعذّر تنفيذ الطلب.") {
  if (!err) return fallback;
  const msg = String(err.message ?? "");
  if (/forbidden|42501|permission denied/i.test(msg))
    return "ليست لديك الصلاحية لتنفيذ هذا الإجراء.";
  if (/only super_admin/i.test(msg))
    return "هذا الدور يتطلب صلاحية المسؤول الأعلى (super_admin).";
  if (/last super_admin/i.test(msg))
    return "لا يمكن حذف آخر مستخدم بصلاحية المسؤول الأعلى.";
  return msg || fallback;
}

async function getRoles(supabase: any, userId: string): Promise<AppRole[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as AppRole);
}

function getClientMeta() {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ua = getRequestHeader("user-agent") ?? null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
    } catch {}
    if (!ip) {
      const fwd = getRequestHeader("x-forwarded-for");
      const real = getRequestHeader("x-real-ip");
      const cf = getRequestHeader("cf-connecting-ip");
      ip = (cf ?? real ?? (fwd ? fwd.split(",")[0]?.trim() : null)) ?? null;
    }
  } catch {}
  return { ip, ua };
}

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_users_with_roles" as any);
    if (error) throw new Error(humanize(error));
    return (data ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      phone: string | null;
      email: string | null;
      created_at: string | null;
      roles: Array<{ role: AppRole; branch_id: string | null }>;
    }>;
  });

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(ROLES),
        branch_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ip, ua } = getClientMeta();
    const { error } = await context.supabase.rpc("assign_user_role" as any, {
      _user_id: data.user_id,
      _role: data.role,
      _branch_id: data.branch_id ?? null,
      _ip: ip,
      _ua: ua,
    } as any);
    if (error) throw new Error(humanize(error));
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), role: z.enum(ROLES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ip, ua } = getClientMeta();
    const { error } = await context.supabase.rpc("revoke_user_role" as any, {
      _user_id: data.user_id,
      _role: data.role,
      _ip: ip,
      _ua: ua,
    } as any);
    if (error) throw new Error(humanize(error));
    return { ok: true };
  });

export const listBranchesForRbac = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("branches")
      .select("id, name_ar, name_en")
      .order("name_ar", { ascending: true });
    if (error) throw new Error(humanize(error));
    return data ?? [];
  });

/* ---------------- Audit log (extended with IP/UA) ---------------- */

const auditFilterSchema = z.object({
  action: z.string().trim().max(64).optional(),
  actor: z.string().uuid().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => auditFilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase, userId);
    if (!roles.some((r) => r === "admin" || r === "super_admin")) {
      throw new Error("ليست لديك الصلاحية لعرض سجل التدقيق.");
    }

    let q = supabase
      .from("security_audit_log")
      .select(
        "id, action, actor, appointment_id, from_status, to_status, reason, metadata, ip_address, user_agent, created_at, branch_id, table_name, record_id",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) q = q.eq("action", data.action);
    if (data.actor) q = q.eq("actor", data.actor);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(humanize(error));

    const actorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean)),
    ) as string[];
    let actorMap = new Map<string, { name: string | null; phone: string | null }>();
    if (actorIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", actorIds);
      for (const p of (profs ?? []) as any[]) {
        actorMap.set(p.id, { name: p.full_name ?? null, phone: p.phone ?? null });
      }
    }

    const branchIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.branch_id).filter(Boolean)),
    ) as string[];
    let branchMap = new Map<string, string>();
    if (branchIds.length) {
      const { data: brs } = await supabase
        .from("branches")
        .select("id, name_ar, name_en")
        .in("id", branchIds);
      for (const b of (brs ?? []) as any[]) {
        branchMap.set(b.id, b.name_ar ?? b.name_en ?? b.id);
      }
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      action: r.action as string,
      actor: r.actor as string | null,
      actor_name: r.actor ? actorMap.get(r.actor)?.name ?? null : null,
      actor_phone: r.actor ? actorMap.get(r.actor)?.phone ?? null : null,
      appointment_id: r.appointment_id as string | null,
      from_status: r.from_status as string | null,
      to_status: r.to_status as string | null,
      reason: r.reason as string | null,
      metadata: r.metadata as any,
      ip_address: r.ip_address as string | null,
      user_agent: r.user_agent as string | null,
      created_at: r.created_at as string,
      branch_id: (r.branch_id as string | null) ?? null,
      branch_name: r.branch_id ? branchMap.get(r.branch_id) ?? null : null,
      table_name: (r.table_name as string | null) ?? null,
      record_id: (r.record_id as string | null) ?? null,
    }));
  });

export const listAuditActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    if (!roles.some((r) => r === "admin" || r === "super_admin")) {
      throw new Error("ليست لديك الصلاحية.");
    }
    const { data, error } = await context.supabase
      .from("security_audit_log")
      .select("action")
      .limit(2000);
    if (error) throw new Error(humanize(error));
    return Array.from(new Set((data ?? []).map((r: any) => r.action))).sort();
  });
