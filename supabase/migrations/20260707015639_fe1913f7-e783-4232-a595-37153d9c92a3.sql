
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_24h boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_2h  boolean NOT NULL DEFAULT true;

-- Extend lookup_appointment to include reminder prefs
DROP FUNCTION IF EXISTS public.lookup_appointment(text, text);
CREATE OR REPLACE FUNCTION public.lookup_appointment(_ref text, _phone text)
 RETURNS TABLE(id uuid, patient_name text, patient_phone text, appointment_date date, appointment_time time without time zone, status appointment_status, reason text, notes text, specialty_id uuid, doctor_id uuid, specialty_name_ar text, specialty_name_en text, doctor_name_ar text, doctor_name_en text, created_at timestamp with time zone, reminder_24h boolean, reminder_2h boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.id, a.patient_name, a.patient_phone, a.appointment_date, a.appointment_time,
         a.status, a.reason, a.notes, a.specialty_id, a.doctor_id,
         s.name_ar, s.name_en, d.name_ar, d.name_en, a.created_at,
         a.reminder_24h, a.reminder_2h
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_appointment(text, text) TO anon, authenticated;

-- RPC for the guest to toggle reminders from /lookup
CREATE OR REPLACE FUNCTION public.update_reminders_by_ref(
  _ref text, _phone text, _reminder_24h boolean, _reminder_2h boolean
)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _id uuid;
BEGIN
  SELECT a.id INTO _id FROM public.appointments a
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
    AND a.status IN ('new','confirmed')
  LIMIT 1;
  IF _id IS NULL THEN RETURN false; END IF;

  UPDATE public.appointments
     SET reminder_24h = COALESCE(_reminder_24h, reminder_24h),
         reminder_2h  = COALESCE(_reminder_2h,  reminder_2h)
   WHERE id = _id;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.update_reminders_by_ref(text, text, boolean, boolean) TO anon, authenticated;
