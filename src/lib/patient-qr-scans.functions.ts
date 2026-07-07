/**
 * QR scan tracking for patient cards — logs and reads.
 * Only staff with branch access to the patient may log/read.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const LogInput = z.object({
  patientId: z.string().uuid(),
  source: z.string().max(32).default("qr"),
  userAgent: z.string().max(500).optional(),
});

export const logPatientQrScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LogInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const { error } = await sb.from("patient_qr_scans").insert({
      patient_id: data.patientId,
      scanned_by: context.userId,
      source: data.source,
      user_agent: data.userAgent ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PatientQrScanRow = {
  id: string;
  scanned_by: string | null;
  scanner_name: string | null;
  source: string;
  scanned_at: string;
};

export const listPatientQrScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ patientId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const { data: rows, error } = await sb
      .from("patient_qr_scans")
      .select("id, scanned_by, source, scanned_at, profiles:scanned_by(full_name)")
      .eq("patient_id", data.patientId)
      .order("scanned_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      scanned_by: r.scanned_by,
      scanner_name: r.profiles?.full_name ?? null,
      source: r.source,
      scanned_at: r.scanned_at,
    })) as PatientQrScanRow[];
  });

export const getPatientQrScanCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const { count, error } = await sb
      .from("patient_qr_scans")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", data.patientId);
    if (error) throw new Error(error.message);
    const { data: last } = await sb
      .from("patient_qr_scans")
      .select("scanned_at")
      .eq("patient_id", data.patientId)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { count: count ?? 0, lastScannedAt: (last?.scanned_at as string | null) ?? null };
  });
