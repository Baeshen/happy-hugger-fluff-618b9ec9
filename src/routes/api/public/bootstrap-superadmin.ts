import { createFileRoute } from "@tanstack/react-router";

// One-off bootstrap endpoint. Delete after use.
export const Route = createFileRoute("/api/public/bootstrap-superadmin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-bootstrap-token");
        if (token !== "baeshen-bootstrap-2026-07-11-once") {
          return new Response("forbidden", { status: 403 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const email = "abs005599@gmail.com";
        const password = "LBb@005599";
        const fullName = "Super Admin";

        // Try to find existing user
        let userId: string | null = null;
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (listErr) return new Response("list_error: " + listErr.message, { status: 500 });
        const existing = list.users.find(
          (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
        );
        if (existing) {
          userId = existing.id;
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });
        } else {
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });
          if (createErr || !created.user) {
            return new Response("create_error: " + (createErr?.message ?? "unknown"), {
              status: 500,
            });
          }
          userId = created.user.id;
        }

        // Ensure profile row
        await supabaseAdmin
          .from("profiles")
          .upsert({ id: userId!, full_name: fullName } as any, { onConflict: "id" });

        // Assign super_admin role
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId!, role: "super_admin" as any } as any, {
            onConflict: "user_id,role",
          });
        if (roleErr) return new Response("role_error: " + roleErr.message, { status: 500 });

        return new Response(JSON.stringify({ ok: true, userId, email }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
