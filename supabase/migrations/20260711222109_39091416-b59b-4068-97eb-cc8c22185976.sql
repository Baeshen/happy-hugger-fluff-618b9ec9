CREATE OR REPLACE FUNCTION public.track_appointment(_ref text, _phone_last4 text)
 RETURNS TABLE(reference text, status text, appointment_date date, appointment_time time without time zone, patient_name text, doctor_name_ar text, specialty_name_ar text, created_at timestamp with time zone, cancelled_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  hex_prefix text;
  ref_re text := '^BAA-[0-9A-F]{8}$';
BEGIN
  IF _ref IS NULL OR _phone_last4 IS NULL THEN
    RETURN;
  END IF;
  IF _ref !~ ref_re THEN
    RETURN;
  END IF;
  IF _phone_last4 !~ '^[0-9]{4}$' THEN
    RETURN;
  END IF;

  hex_prefix := lower(substring(_ref FROM 5 FOR 8));

  RETURN QUERY
  SELECT
    ('BAA-' || upper(substring(replace(a.id::text, '-', '') FROM 1 FOR 8)))::text AS reference,
    a.status::text,
    a.appointment_date,
    a.appointment_time,
    a.patient_name,
    d.name_ar,
    s.name_ar,
    a.created_at,
    CASE WHEN a.status::text = 'cancelled' THEN a.updated_at ELSE NULL END::timestamptz AS cancelled_at
  FROM public.appointments a
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  WHERE replace(a.id::text, '-', '') LIKE (hex_prefix || '%')
    AND right(regexp_replace(a.patient_phone, '[^0-9]', '', 'g'), 4) = _phone_last4
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$function$;