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
    throw new Error("ليست لديك الصلاحية لتنفيذ هذا الإجراء.");
  }
}

/**
 * Convert a raw Supabase/PostgREST error into an Arabic user-facing message.
 * Handles: RLS denials, check-constraint violations, FK/unique conflicts,
 * missing rows, and network timeouts. Keeps raw details in the log server-side.
 */
function humanizeSupabaseError(err: any, fallback = "تعذّر تنفيذ الطلب."): string {
  if (!err) return fallback;
  const code: string | undefined = err.code ?? err.details?.code;
  const msg: string = String(err.message ?? err.details ?? "");
  console.error("[supabase-error]", { code, msg, hint: err.hint, details: err.details });

  // RLS denial (PostgREST maps to 42501 or PGRST301)
  if (code === "42501" || code === "PGRST301" || /row-level security|permission denied/i.test(msg)) {
    return "ليست لديك الصلاحية لتنفيذ هذا الإجراء. الرجاء التواصل مع المسؤول إذا كنت ترى هذا خطأً.";
  }
  // CHECK constraint / policy WITH CHECK failure on insert
  if (code === "23514" || /violates check constraint/i.test(msg)) {
    return "البيانات المُدخلة غير صالحة. الرجاء مراجعة الحقول والمحاولة مجددًا.";
  }
  // Unique violation
  if (code === "23505" || /duplicate key/i.test(msg)) {
    return "توجد بيانات مكرّرة تمنع إتمام العملية.";
  }
  // Foreign key
  if (code === "23503" || /foreign key/i.test(msg)) {
    return "لا يمكن تنفيذ الطلب لوجود سجلات مرتبطة.";
  }
  // Not-null
  if (code === "23502" || /null value in column/i.test(msg)) {
    return "أحد الحقول المطلوبة مفقود.";
  }
  // Auth / session
  if (/jwt|unauthorized|not authenticated/i.test(msg)) {
    return "انتهت الجلسة. الرجاء تسجيل الدخول من جديد.";
  }
  // Rate limit
  if (code === "429" || /rate limit/i.test(msg)) {
    return "عدد المحاولات مرتفع. الرجاء الانتظار قليلًا ثم المحاولة مرة أخرى.";
  }
  return fallback;
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
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

import { checkAppointmentTransition, type ApptStatus, type StaffRole } from "./appt-transitions";

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["new", "confirmed", "completed", "cancelled", "no_show"]),
      reason: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // 1) Authenticated user (middleware) + role gate
    const roles = (await getRoles(context.supabase, context.userId)) as StaffRole[];
    ensureRole(roles, ["admin", "reception"]);

    // 2) Load the target row (RLS-scoped as the caller). Missing / hidden → 404-ish
    const { data: current, error: readErr } = await context.supabase
      .from("appointments")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(humanizeSupabaseError(readErr));
    if (!current) throw new Error("الحجز غير موجود أو لا تملك صلاحية عرضه.");

    // 3-4) Transition legality + per-transition role check + reason requirement
    const check = checkAppointmentTransition(
      current.status as ApptStatus,
      data.status as ApptStatus,
      roles,
      data.reason,
    );
    if (!check.ok) throw new Error(check.message);
    if (check.unchanged) return { ok: true, unchanged: true };

    // 5) Perform the update via RPC (carries reason into the audit trigger)
    const { error } = await context.supabase.rpc("update_appointment_status" as any, {
      _id: data.id,
      _status: data.status,
      _reason: data.reason ?? null,
    } as any);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const updateAppointmentNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      notes: z.string().trim().max(2000).nullable(),
      reason: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const { error } = await context.supabase.rpc("update_appointment_notes" as any, {
      _id: data.id,
      _notes: data.notes,
      _reason: data.reason ?? null,
    } as any);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const listAppointmentAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ appointmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const { data: rows, error } = await context.supabase
      .from("appointment_audit")
      .select("*")
      .eq("appointment_id", data.appointmentId)
      .order("changed_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(humanizeSupabaseError(error));
    // Enrich with actor email (best-effort; requires admin)
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.changed_by).filter(Boolean)));
    let emailById = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, full_name").in("id", ids);
      for (const p of profs ?? []) emailById.set(p.id, p.full_name ?? "");
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      changed_by_name: r.changed_by ? emailById.get(r.changed_by) ?? null : null,
    }));
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
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["new", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "pharmacy"]);
    const { error } = await context.supabase
      .from("medicine_orders")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
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
    if (error) throw new Error(humanizeSupabaseError(error));
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
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

const doctorInput = z.object({
  specialty_id: z.string().uuid().nullable().optional(),
  name_ar: z.string().min(1),
  name_en: z.string().nullable().optional(),
  title_ar: z.string().nullable().optional(),
  title_en: z.string().nullable().optional(),
  photo_url: z.string().url().nullable().optional().or(z.literal("")),
  bio_ar: z.string().nullable().optional(),
  bio_en: z.string().nullable().optional(),
  languages: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const listSpecialtiesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception", "pharmacy"]);
    const { data, error } = await context.supabase
      .from("specialties")
      .select("id, name_ar, name_en")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const createDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => doctorInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const payload = { ...data, photo_url: data.photo_url || null };
    const { data: row, error } = await context.supabase
      .from("doctors")
      .insert(payload as any)
      .select()
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });

export const updateDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).and(doctorInput.partial()).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { id, ...rest } = data;
    const payload: any = { ...rest };
    if ("photo_url" in payload) payload.photo_url = payload.photo_url || null;
    const { error } = await context.supabase.from("doctors").update(payload).eq("id", id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const deleteDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase.from("doctors").delete().eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

/* ---------------- Specialties CRUD ---------------- */

const specialtyInput = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug lowercase, digits, dashes"),
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  icon: z.string().nullable().optional(),
  description_ar: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const listSpecialtiesFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception", "pharmacy"]);
    const { data, error } = await context.supabase
      .from("specialties")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const createSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => specialtyInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { data: row, error } = await context.supabase
      .from("specialties")
      .insert(data as any)
      .select()
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });

export const updateSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).and(specialtyInput.partial()).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("specialties").update(rest as any).eq("id", id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const deleteSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase.from("specialties").delete().eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

/* ---------------- Availability ---------------- */

const availabilityInput = z.object({
  doctor_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  slot_minutes: z.number().int().min(5).max(240).default(30),
});

export const listAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ doctor_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const { data: rows, error } = await context.supabase
      .from("availability")
      .select("*")
      .eq("doctor_id", data.doctor_id)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return rows ?? [];
  });

export const createAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => availabilityInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    if (data.start_time >= data.end_time) throw new Error("وقت البداية يجب أن يسبق النهاية");
    const { data: row, error } = await context.supabase
      .from("availability")
      .insert(data as any)
      .select()
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });

export const deleteAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase.from("availability").delete().eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

