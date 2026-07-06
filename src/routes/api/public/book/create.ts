/**
 * Public API — POST /api/public/book/create
 *
 * Server-side alternative to the client-only insert in /book. Both paths
 * MUST return the same Arabic strings for both Zod validation failures and
 * PostgREST/RLS failures, so external callers, e2e harnesses, and the UI
 * see one consistent user-facing error surface.
 *
 * Rules:
 *   - Validation errors → HTTP 400 { ok:false, kind:'validation', message }
 *     where `message` is the FIRST Zod issue's Arabic message.
 *   - DB / RLS errors    → HTTP 400 { ok:false, kind:'db', message }
 *     where `message` is `friendlyInsertError(error)` (from
 *     src/lib/insert-errors.ts) — NEVER the raw PostgREST text.
 *   - Success            → HTTP 200 { ok:true }.
 *
 * The endpoint uses the publishable (anon) Supabase key so DB triggers and
 * RLS behave exactly as they do for the public /book UI. Bad JSON is folded
 * into the generic `unknown` friendly message rather than leaking a parser
 * error.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  friendlyInsertError,
  FRIENDLY_INSERT_MESSAGES,
} from "@/lib/insert-errors";

// Mirrors the client-side caps in src/routes/book.tsx so both paths reject
// identically. Any change here MUST also update book.tsx (and vice versa).
const NAME_MIN = 2, NAME_MAX = 120;
const PHONE_MIN = 6, PHONE_MAX = 32;
const NID_MAX = 20;
const REASON_MAX = 500;
const PHONE_RE = /^[+0-9\s\-()]+$/;

const bookingCreateSchema = z.object({
  patient_name: z.string().trim()
    .min(NAME_MIN, "الاسم قصير جدًا (٢ أحرف على الأقل)")
    .max(NAME_MAX, "الاسم طويل جدًا"),
  patient_phone: z.string().trim()
    .min(PHONE_MIN, "رقم الهاتف قصير جدًا")
    .max(PHONE_MAX, "رقم الهاتف طويل جدًا")
    .regex(PHONE_RE, "رقم الهاتف يحتوي على أحرف غير مسموحة"),
  national_id: z.string().trim().max(NID_MAX, "رقم الهوية طويل جدًا")
    .optional().nullable(),
  gender: z.enum(["male", "female"], { message: "الجنس غير صالح" })
    .optional(),
  specialty_id: z.string().uuid("قيمة غير صالحة").optional().nullable(),
  doctor_id: z.string().uuid("قيمة غير صالحة").optional().nullable(),
  appointment_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح"),
  appointment_time: z.string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "وقت غير صالح"),
  reason: z.string().trim()
    .max(REASON_MAX, `السبب طويل جدًا (الحد الأقصى ${REASON_MAX} حرفًا)`)
    .optional().nullable(),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/book/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, {
            ok: false,
            kind: "validation",
            message: FRIENDLY_INSERT_MESSAGES.unknown,
          });
        }

        const parsed = bookingCreateSchema.safeParse(body);
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? "بيانات غير صالحة";
          return json(400, { ok: false, kind: "validation", message });
        }

        const url = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !anonKey) {
          return json(500, {
            ok: false,
            kind: "db",
            message: FRIENDLY_INSERT_MESSAGES.unknown,
          });
        }

        const supa = createClient(url, anonKey, {
          auth: {
            storage: undefined,
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        const { error } = await supa.from("appointments").insert({
          patient_name: parsed.data.patient_name,
          patient_phone: parsed.data.patient_phone,
          national_id: parsed.data.national_id ?? null,
          gender: parsed.data.gender,
          specialty_id: parsed.data.specialty_id ?? null,
          doctor_id: parsed.data.doctor_id ?? null,
          appointment_date: parsed.data.appointment_date,
          appointment_time: parsed.data.appointment_time,
          reason: parsed.data.reason ?? null,
        });

        if (error) {
          return json(400, {
            ok: false,
            kind: "db",
            message: friendlyInsertError(error as { message?: string; code?: string }),
          });
        }

        return json(200, { ok: true });
      },
    },
  },
});
