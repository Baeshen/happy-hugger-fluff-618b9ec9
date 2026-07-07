
-- Recreate the table with the per-kind shape.
DROP TABLE IF EXISTS public.reminder_preference_audit;

CREATE TABLE public.reminder_preference_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  reminder_kind text NOT NULL,          -- 'reminder_24h' | 'reminder_2h'
  changed_by uuid,
  source text NOT NULL,                 -- 'staff' | 'self_service' | 'system'
  old_value boolean,
  new_value boolean,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_pref_audit_kind_chk
    CHECK (reminder_kind IN ('reminder_24h','reminder_2h')),
  CONSTRAINT reminder_pref_audit_source_chk
    CHECK (source IN ('staff','self_service','system')),
  CONSTRAINT reminder_pref_audit_actual_change_chk
    CHECK (old_value IS DISTINCT FROM new_value)
);

CREATE INDEX reminder_pref_audit_appt_idx
  ON public.reminder_preference_audit (appointment_id, changed_at DESC);
CREATE INDEX reminder_pref_audit_kind_idx
  ON public.reminder_preference_audit (appointment_id, reminder_kind, changed_at DESC);
CREATE INDEX reminder_pref_audit_changed_at_idx
  ON public.reminder_preference_audit (changed_at DESC);

GRANT SELECT ON public.reminder_preference_audit TO authenticated;
GRANT ALL    ON public.reminder_preference_audit TO service_role;

ALTER TABLE public.reminder_preference_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read reminder preference audit"
  ON public.reminder_preference_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'reception')
  );

-- Trigger function: one row per changed reminder kind.
CREATE OR REPLACE FUNCTION public.log_reminder_preference_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _source text;
  _reason text := NULLIF(current_setting('app.change_reason', true), '');
BEGIN
  IF _actor IS NULL THEN
    _source := 'self_service';
  ELSIF public.has_role(_actor, 'admin') OR public.has_role(_actor, 'reception') THEN
    _source := 'staff';
  ELSE
    _source := 'system';
  END IF;

  IF NEW.reminder_24h IS DISTINCT FROM OLD.reminder_24h THEN
    INSERT INTO public.reminder_preference_audit
      (appointment_id, reminder_kind, changed_by, source, old_value, new_value, reason)
    VALUES
      (NEW.id, 'reminder_24h', _actor, _source, OLD.reminder_24h, NEW.reminder_24h, _reason);
  END IF;

  IF NEW.reminder_2h IS DISTINCT FROM OLD.reminder_2h THEN
    INSERT INTO public.reminder_preference_audit
      (appointment_id, reminder_kind, changed_by, source, old_value, new_value, reason)
    VALUES
      (NEW.id, 'reminder_2h', _actor, _source, OLD.reminder_2h, NEW.reminder_2h, _reason);
  END IF;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.log_reminder_preference_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_reminder_preference_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_reminder_preference_change() FROM authenticated;

DROP TRIGGER IF EXISTS trg_log_reminder_preference_change ON public.appointments;
CREATE TRIGGER trg_log_reminder_preference_change
AFTER UPDATE OF reminder_24h, reminder_2h
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.log_reminder_preference_change();
