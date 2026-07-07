
-- 1) whatsapp opt-in flag (optional)
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT true;

-- 2) Public lookup by ref (first 8 hex of id) + phone
CREATE OR REPLACE FUNCTION public.lookup_appointment(_ref text, _phone text)
RETURNS TABLE (
  id uuid,
  patient_name text,
  patient_phone text,
  appointment_date date,
  appointment_time time,
  status appointment_status,
  reason text,
  notes text,
  specialty_name_ar text,
  specialty_name_en text,
  doctor_name_ar text,
  doctor_name_en text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.patient_name, a.patient_phone, a.appointment_date, a.appointment_time,
         a.status, a.reason, a.notes,
         s.name_ar, s.name_en, d.name_ar, d.name_en, a.created_at
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_appointment(text, text) TO anon, authenticated;

-- 3) Authenticated: my appointments by matching profile.phone
CREATE OR REPLACE FUNCTION public.my_appointments()
RETURNS TABLE (
  id uuid,
  patient_name text,
  patient_phone text,
  appointment_date date,
  appointment_time time,
  status appointment_status,
  reason text,
  notes text,
  specialty_name_ar text,
  specialty_name_en text,
  doctor_name_ar text,
  doctor_name_en text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.patient_name, a.patient_phone, a.appointment_date, a.appointment_time,
         a.status, a.reason, a.notes,
         s.name_ar, s.name_en, d.name_ar, d.name_en, a.created_at
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.phone IS NOT NULL
        AND regexp_replace(p.phone,'\D','','g') = regexp_replace(a.patient_phone,'\D','','g')
    )
  ORDER BY a.appointment_date DESC, a.appointment_time DESC;
$$;

GRANT EXECUTE ON FUNCTION public.my_appointments() TO authenticated;

-- 4) Cancel appointment by ref + phone (guest self-service)
CREATE OR REPLACE FUNCTION public.cancel_appointment_by_ref(_ref text, _phone text, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _reason_val text := public.normalize_reason(_reason);
BEGIN
  SELECT a.id INTO _id
  FROM public.appointments a
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
    AND a.status IN ('new','confirmed')
  LIMIT 1;

  IF _id IS NULL THEN
    RETURN false;
  END IF;

  IF _reason_val IS NULL OR length(_reason_val) = 0 THEN
    _reason_val := 'إلغاء من المراجع';
  END IF;

  PERFORM set_config('app.change_reason', _reason_val, true);
  UPDATE public.appointments SET status = 'cancelled' WHERE id = _id;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_ref(text, text, text) TO anon, authenticated;
