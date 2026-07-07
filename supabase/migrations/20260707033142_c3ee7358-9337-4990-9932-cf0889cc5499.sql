
CREATE OR REPLACE FUNCTION public.list_reminder_preferences_by_ref(_ref text, _phone text)
RETURNS TABLE (
  id uuid,
  reminder_kind text,
  old_value boolean,
  new_value boolean,
  source text,
  reason text,
  changed_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rpa.id, rpa.reminder_kind, rpa.old_value, rpa.new_value, rpa.source, rpa.reason, rpa.changed_at
  FROM public.reminder_preference_audit rpa
  JOIN public.appointments a ON a.id = rpa.appointment_id
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
  ORDER BY rpa.changed_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.my_reminder_preference_audit(_appointment_id uuid)
RETURNS TABLE (
  id uuid,
  reminder_kind text,
  old_value boolean,
  new_value boolean,
  source text,
  reason text,
  changed_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rpa.id, rpa.reminder_kind, rpa.old_value, rpa.new_value, rpa.source, rpa.reason, rpa.changed_at
  FROM public.reminder_preference_audit rpa
  JOIN public.appointments a ON a.id = rpa.appointment_id
  WHERE a.id = _appointment_id
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.phone IS NOT NULL
        AND regexp_replace(p.phone,'\D','','g') = regexp_replace(a.patient_phone,'\D','','g')
    )
  ORDER BY rpa.changed_at DESC
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.list_reminder_preferences_by_ref(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_reminder_preference_audit(uuid) TO authenticated;
