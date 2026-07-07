
-- Extend lookup to include doctor_id / specialty_id (needed to fetch availability)
DROP FUNCTION IF EXISTS public.lookup_appointment(text, text);
CREATE OR REPLACE FUNCTION public.lookup_appointment(_ref text, _phone text)
 RETURNS TABLE(id uuid, patient_name text, patient_phone text, appointment_date date, appointment_time time without time zone, status appointment_status, reason text, notes text, specialty_id uuid, doctor_id uuid, specialty_name_ar text, specialty_name_en text, doctor_name_ar text, doctor_name_en text, created_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.id, a.patient_name, a.patient_phone, a.appointment_date, a.appointment_time,
         a.status, a.reason, a.notes, a.specialty_id, a.doctor_id,
         s.name_ar, s.name_en, d.name_ar, d.name_en, a.created_at
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
  LIMIT 1;
$$;

-- Reschedule appointment by ref+phone (guest self-service)
CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_ref(
  _ref text, _phone text, _new_date date, _new_time time without time zone, _reason text DEFAULT NULL
)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
  _doctor uuid;
  _reason_val text := public.normalize_reason(_reason);
BEGIN
  SELECT a.id, a.doctor_id INTO _id, _doctor
  FROM public.appointments a
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
    AND a.status IN ('new','confirmed')
  LIMIT 1;

  IF _id IS NULL THEN
    RETURN false;
  END IF;

  -- Must be a future date/time
  IF (_new_date + _new_time) <= now() THEN
    RAISE EXCEPTION 'الموعد الجديد يجب أن يكون في المستقبل' USING ERRCODE='check_violation';
  END IF;

  -- Prevent double booking on same doctor+slot
  IF _doctor IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.appointments
    WHERE doctor_id = _doctor
      AND appointment_date = _new_date
      AND appointment_time = _new_time
      AND status IN ('new','confirmed')
      AND id <> _id
  ) THEN
    RAISE EXCEPTION 'هذا الموعد محجوز بالفعل، الرجاء اختيار وقت آخر' USING ERRCODE='unique_violation';
  END IF;

  IF _reason_val IS NULL OR length(_reason_val) = 0 THEN
    _reason_val := 'إعادة جدولة من المراجع';
  END IF;

  PERFORM set_config('app.change_reason', _reason_val, true);
  UPDATE public.appointments
     SET appointment_date = _new_date,
         appointment_time = _new_time,
         status = 'new'
   WHERE id = _id;

  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment_by_ref(text, text, date, time, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_appointment(text, text) TO anon, authenticated;
