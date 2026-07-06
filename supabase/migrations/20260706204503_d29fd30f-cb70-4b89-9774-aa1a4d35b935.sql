
CREATE OR REPLACE FUNCTION public.normalize_reason(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Mirror of src/lib/reason.ts normalizeReason():
  -- strips leading/trailing Unicode whitespace incl. NBSP (\u00A0),
  -- tabs, newlines, carriage returns, and caps length at 500.
  SELECT CASE
    WHEN _raw IS NULL THEN NULL
    ELSE substring(
      regexp_replace(
        regexp_replace(_raw, '^[\s\u00A0]+', '', 'g'),
        '[\s\u00A0]+$', '', 'g'
      )
      from 1 for 500
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.log_appointment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  reason_raw text := NULLIF(current_setting('app.change_reason', true), '');
  reason_val text := public.normalize_reason(reason_raw);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('cancelled','no_show')
       AND (reason_val IS NULL OR length(reason_val) = 0) THEN
      RAISE EXCEPTION 'reason_required_for_%', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.appointment_audit
      (appointment_id, changed_by, old_status, new_status, old_notes, new_notes, reason)
    VALUES
      (NEW.id, auth.uid(),
       CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN OLD.status END,
       CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN NEW.status END,
       CASE WHEN NEW.notes  IS DISTINCT FROM OLD.notes  THEN OLD.notes  END,
       CASE WHEN NEW.notes  IS DISTINCT FROM OLD.notes  THEN NEW.notes  END,
       NULLIF(reason_val, ''));
  END IF;
  RETURN NEW;
END $function$;
