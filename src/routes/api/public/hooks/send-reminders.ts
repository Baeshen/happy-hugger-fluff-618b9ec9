/**
 * Public cron endpoint — called every few minutes by pg_cron.
 *
 * 1) Calls `enqueue_appointment_reminders()` to insert reminder rows.
 * 2) Reads pending web_push rows, sends VAPID push to each subscription,
 *    marks the row `sent` or `failed`.
 *
 * Auth: guarded by requiring the Supabase anon key in the `apikey` header,
 * matching the canonical pg_cron pattern; nothing here reads user PII.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type PendingRow = {
  id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  kind: string;
  audience: string;
  metadata: Record<string, unknown> | null;
  appointment_id: string | null;
};

type Sub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
  failure_count: number;
};

const DEFAULT_STAFF_ROLES = ["admin", "reception", "super_admin"] as const;

const MAX_PENDING_PER_RUN = 200;

async function sendPushRun(): Promise<{
  enqueue: unknown;
  sent: number;
  failed: number;
  expired: number;
  no_subscription: number;
}> {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY!;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY!;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:notifications@example.com";

  if (!url || !serviceKey) throw new Error("Supabase env missing");
  if (!vapidPublic || !vapidPrivate) throw new Error("VAPID env missing");

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Enqueue any due reminders
  const { data: enqueueResult, error: enqueueError } = await admin.rpc(
    "enqueue_appointment_reminders",
  );
  if (enqueueError) {
    console.error("enqueue_appointment_reminders failed:", enqueueError);
  }

  // 2) Fetch pending web_push rows
  const { data: pending, error: pendErr } = await admin
    .from("notifications")
    .select("id, user_id, title, body, kind, metadata, appointment_id")
    .eq("channel", "web_push")
    .eq("send_status", "pending")
    .not("user_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(MAX_PENDING_PER_RUN);
  if (pendErr) throw new Error(pendErr.message);

  const rows = (pending ?? []) as PendingRow[];
  let sent = 0;
  let failed = 0;
  let expired = 0;
  let noSub = 0;

  for (const row of rows) {
    if (!row.user_id) continue;

    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id, failure_count")
      .eq("user_id", row.user_id);
    if (subsErr) {
      await admin
        .from("notifications")
        .update({ send_status: "failed", last_error: subsErr.message })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const subList = (subs ?? []) as Sub[];
    if (subList.length === 0) {
      await admin
        .from("notifications")
        .update({ send_status: "skipped", last_error: "no push subscription" })
        .eq("id", row.id);
      noSub++;
      continue;
    }

    const payload = JSON.stringify({
      title: row.title,
      body: row.body ?? "",
      kind: row.kind,
      metadata: row.metadata ?? {},
    });

    let anySent = false;
    let lastError: string | null = null;

    for (const s of subList) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        anySent = true;
        await admin
          .from("push_subscriptions")
          .update({ last_seen_at: new Date().toISOString(), failure_count: 0 })
          .eq("id", s.id);
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        const status = e.statusCode ?? 0;
        lastError = e.message || String(err);
        if (status === 404 || status === 410) {
          // Gone / not registered — delete subscription
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          expired++;
        } else {
          await admin
            .from("push_subscriptions")
            .update({ failure_count: (s.failure_count ?? 0) + 1 })
            .eq("id", s.id);
        }
      }
    }

    await admin
      .from("notifications")
      .update(
        anySent
          ? { send_status: "sent", sent_at: new Date().toISOString(), last_error: null }
          : { send_status: "failed", last_error: lastError ?? "no delivery" },
      )
      .eq("id", row.id);
    if (anySent) sent++;
    else failed++;
  }

  return { enqueue: enqueueResult ?? null, sent, failed, expired, no_subscription: noSub };
}

async function handle(request: Request): Promise<Response> {
  const apiKey =
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!expected || apiKey !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await sendPushRun();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("send-reminders failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
