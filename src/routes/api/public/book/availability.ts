/**
 * Public API — GET /api/public/book/availability?doctor_id=UUID&date=YYYY-MM-DD
 *
 * Returns the list of appointment_time slots that are ALREADY booked for a
 * given doctor on a given date (statuses other than cancelled / no_show).
 * The public /book UI uses this to disable already-taken time buttons
 * before submit so users get instant feedback instead of hitting the
 * server-side conflict check.
 *
 * Response shape: { ok: true, booked: string[] } where each string is
 * "HH:MM" (24h). Times are trimmed to HH:MM to match the client picker.
 *
 * Uses the admin client to bypass the RLS block on public SELECT of
 * appointments; only the time-of-day is exposed, never any PII.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/book/availability")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const doctorId = url.searchParams.get("doctor_id");
        const date = url.searchParams.get("date");

        if (!doctorId || !UUID_RE.test(doctorId)) {
          return json(400, { ok: false, error: "invalid_doctor_id" });
        }
        if (!date || !DATE_RE.test(date)) {
          return json(400, { ok: false, error: "invalid_date" });
        }

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { data, error } = await supabaseAdmin
            .from("appointments")
            .select("appointment_time,status")
            .eq("doctor_id", doctorId)
            .eq("appointment_date", date);
          if (error) {
            return json(200, { ok: true, booked: [] });
          }
          const booked = Array.from(
            new Set(
              (data ?? [])
                .filter(
                  (r) => r.status !== "cancelled" && r.status !== "no_show",
                )
                .map((r) => String(r.appointment_time).slice(0, 5)),
            ),
          );
          return json(200, { ok: true, booked });
        } catch {
          return json(200, { ok: true, booked: [] });
        }
      },
    },
  },
});
