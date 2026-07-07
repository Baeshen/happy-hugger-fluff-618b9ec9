
-- 1) Audit table for reminder preference changes
CREATE TABLE public.reminder_preference_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  changed_by uuid,                    -- auth.uid() when available (staff); null for anon self-service
  source text NOT NULL,               -- 'staff' | 'self_service' | 'system'
  old_reminder_24h boolean,
  new_reminder_24h boolean,
  old_reminder_2h  boolean,
  new_reminder_2h  boolean,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_pref_audit_source_chk
    CHECK (source IN ('staff','self_service','system')),
  CONSTRAINT reminder_pref_audit_actual_change_chk
    CHECK (old_reminder_24h IS DISTINCT FROM new_reminder_24h
        OR old_reminder_2h  IS DISTINCT FROM new_reminder_2h)
);

CREATE INDEX reminder_pref_audit_appt_idx
  ON public.reminder_preference_audit (appointment_id, changed_at DESC);
CREATE INDEX reminder_pref_audit_changed_at_idx
  ON public.reminder_preference_audit (changed_at DESC);

-- 2) Grants — staff read via RLS, service_role full, no anon
GRANT SELECT ON public.reminder_preference_audit TO authenticated;
GRANT ALL    ON public.reminder_preference_audit TO service_role;

-- 3) RLS: staff-only read; block all direct writes (only the trigger writes,
--    and the trigger runs as SECURITY DEFINER so RLS does not gate it).
ALTER TABLE public.reminder_preference_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read reminder preference audit"
  ON public.reminder_preference_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'reception')
  );

-- No INSERT/UPDATE/DELETE policies → all direct writes denied for
-- anon/authenticated. Only the SECURITY DEFINER trigger below can write.

-- 4) Trigger function: log every actual reminder-flag change
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
  -- Only log when a reminder flag actually changed.
  IF NEW.reminder_24h IS NOT DISTINCT FROM OLD.reminder_24h
     AND NEW.reminder_2h IS NOT DISTINCT FROM OLD.reminder_2h THEN
    RETURN NEW;
  END IF;

  IF _actor IS NULL THEN
    _source := 'self_service';         -- anon RPC path (update_reminders_by_ref)
  ELSIF public.has_role(_actor, 'admin')
     OR public.has_role(_actor, 'reception') THEN
    _source := 'staff';
  ELSE
    _source := 'system';
  END IF;

  INSERT INTO public.reminder_preference_audit
    (appointment_id, changed_by, source,
     old_reminder_24h, new_reminder_24h,
     old_reminder_2h,  new_reminder_2h,
     reason)
  VALUES
    (NEW.id, _actor, _source,
     OLD.reminder_24h, NEW.reminder_24h,
     OLD.reminder_2h,  NEW.reminder_2h,
     _reason);

  RETURN NEW;
END $$;

-- 5) Trigger on appointments — AFTER UPDATE, only when reminder cols change
DROP TRIGGER IF EXISTS trg_log_reminder_preference_change ON public.appointments;
CREATE TRIGGER trg_log_reminder_preference_change
AFTER UPDATE OF reminder_24h, reminder_2h
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.log_reminder_preference_change();
