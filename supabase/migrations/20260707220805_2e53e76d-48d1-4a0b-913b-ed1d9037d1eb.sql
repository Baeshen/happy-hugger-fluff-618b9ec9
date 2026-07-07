CREATE TABLE public.patient_qr_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  scanned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'qr',
  user_agent text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_qr_scans_patient ON public.patient_qr_scans(patient_id, scanned_at DESC);
CREATE INDEX idx_patient_qr_scans_scanned_at ON public.patient_qr_scans(scanned_at DESC);

GRANT SELECT, INSERT ON public.patient_qr_scans TO authenticated;
GRANT ALL ON public.patient_qr_scans TO service_role;

ALTER TABLE public.patient_qr_scans ENABLE ROW LEVEL SECURITY;

-- Staff (admin/super_admin/doctor/reception) with branch access to the patient can read
CREATE POLICY "staff can read qr scans"
  ON public.patient_qr_scans FOR SELECT
  TO authenticated
  USING (public.can_access_patient(patient_id));

-- Any authenticated staff with patient access can insert their own scan record
CREATE POLICY "staff can insert own qr scan"
  ON public.patient_qr_scans FOR INSERT
  TO authenticated
  WITH CHECK (
    scanned_by = auth.uid()
    AND public.can_access_patient(patient_id)
  );

-- Aggregate helper: scan count + last scan per patient (staff only)
CREATE OR REPLACE FUNCTION public.patient_qr_scan_stats(_patient_ids uuid[])
RETURNS TABLE(patient_id uuid, scan_count bigint, last_scanned_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  SELECT s.patient_id, count(*)::bigint, max(s.scanned_at)
  FROM public.patient_qr_scans s
  WHERE s.patient_id = ANY(_patient_ids)
  GROUP BY s.patient_id;
END $$;

GRANT EXECUTE ON FUNCTION public.patient_qr_scan_stats(uuid[]) TO authenticated;