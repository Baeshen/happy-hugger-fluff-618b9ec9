import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "reception" | "pharmacy";

async function getRoles(supabase: any, userId: string): Promise<Role[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}

function ensureRole(roles: Role[], allowed: Role[]) {
  if (!roles.some((r) => allowed.includes(r))) {
    throw new Error("Forbidden");
  }
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    return { userId: context.userId, roles };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception", "pharmacy"]);
    const sb = context.supabase;
    const today = new Date().toISOString().slice(0, 10);

    const [appts, todayAppts, pendingAppts, orders, pendingOrders, doctorsCount] = await Promise.all([
      sb.from("appointments").select("id", { count: "exact", head: true }),
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("appointment_date", today),
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("status", "new"),
      sb.from("medicine_orders").select("id", { count: "exact", head: true }),
      sb.from("medicine_orders").select("id", { count: "exact", head: true }).eq("status", "new"),
      sb.from("doctors").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    return {
      appointmentsTotal: appts.count ?? 0,
      appointmentsToday: todayAppts.count ?? 0,
      appointmentsPending: pendingAppts.count ?? 0,
      ordersTotal: orders.count ?? 0,
      ordersPending: pendingOrders.count ?? 0,
      doctorsActive: doctorsCount.count ?? 0,
    };
  });

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const { data, error } = await context.supabase
      .from("appointments")
      .select("*, doctors(name_ar,name_en), specialties(name_ar,name_en)")
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["new", "confirmed", "completed", "cancelled", "no_show"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const { error } = await context.supabase
      .from("appointments")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "pharmacy"]);
    const { data, error } = await context.supabase
      .from("medicine_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "preparing", "out_for_delivery", "delivered", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "pharmacy"]);
    const { error } = await context.supabase
      .from("medicine_orders")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDoctorsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception", "pharmacy"]);
    const { data, error } = await context.supabase
      .from("doctors")
      .select("*, specialties(name_ar,name_en)")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const toggleDoctorActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase
      .from("doctors")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
