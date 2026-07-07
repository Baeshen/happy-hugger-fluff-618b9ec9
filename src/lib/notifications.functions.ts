import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const listInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(30),
  onlyUnread: z.boolean().optional().default(false),
});

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listInputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Is caller staff?
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const { data: isReception } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "reception",
    });
    const isStaff = Boolean(isAdmin) || Boolean(isReception);

    let query = supabase
      .from("notifications")
      .select(
        "id, audience, kind, title, body, appointment_id, metadata, read_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (isStaff) {
      query = query.eq("audience", "staff");
    } else {
      query = query.eq("audience", "user").eq("user_id", userId);
    }

    if (data.onlyUnread) {
      query = query.is("read_at", null);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return { items: rows ?? [], isStaff };
  });

const markInputSchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().optional().default(false),
});

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => markInputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (data.all) {
      // no-op — RLS restricts to caller's rows
    } else if (data.id) {
      q = q.eq("id", data.id);
    } else {
      throw new Error("id_or_all_required");
    }
    const { error, count } = await q.select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return { ok: true, updated: count ?? 0 };
  });

export const countUnreadNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const { data: isReception } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "reception",
    });
    const isStaff = Boolean(isAdmin) || Boolean(isReception);

    let q = supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (isStaff) q = q.eq("audience", "staff");
    else q = q.eq("audience", "user").eq("user_id", userId);

    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0, isStaff };
  });
