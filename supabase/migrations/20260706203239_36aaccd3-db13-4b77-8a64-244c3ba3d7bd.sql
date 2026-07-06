
CREATE OR REPLACE FUNCTION public.log_appointment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  reason_val text := NULLIF(current_setting('app.change_reason', true), '');
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('cancelled','no_show')
       AND (reason_val IS NULL OR length(trim(reason_val)) = 0) THEN
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
       reason_val);
  END IF;
  RETURN NEW;
END $function$;
