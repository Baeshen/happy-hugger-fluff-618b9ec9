
CREATE OR REPLACE FUNCTION public.update_reminders_by_ref(
  _ref text,
  _phone text,
  _reminder_24h boolean,
  _reminder_2h boolean,
  _reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _reason_val text := public.normalize_reason(_reason);
BEGIN
  SELECT a.id INTO _id FROM public.appointments a
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
    AND a.status IN ('new','confirmed')
  LIMIT 1;
  IF _id IS NULL THEN RETURN false; END IF;

  IF _reason_val IS NOT NULL AND length(_reason_val) > 0 THEN
    PERFORM set_config('app.change_reason', _reason_val, true);
  END IF;

  UPDATE public.appointments
     SET reminder_24h = COALESCE(_reminder_24h, reminder_24h),
         reminder_2h  = COALESCE(_reminder_2h,  reminder_2h)
   WHERE id = _id;
  RETURN true;
END $$;
