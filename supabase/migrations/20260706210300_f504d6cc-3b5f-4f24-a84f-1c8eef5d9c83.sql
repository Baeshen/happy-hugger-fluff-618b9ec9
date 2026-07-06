
CREATE OR REPLACE FUNCTION public.log_appointment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  reason_raw text := NULLIF(current_setting('app.change_reason', true), '');
  -- Compute the trimmed length WITHOUT the 500-char cap so we can reject
  -- oversized input instead of silently truncating it.
  reason_trimmed_len int := CASE
    WHEN reason_raw IS NULL THEN 0
    ELSE length(
      regexp_replace(
        regexp_replace(reason_raw, '^[\s\u00A0]+', '', 'g'),
        '[\s\u00A0]+$', '', 'g'
      )
    )
  END;
  reason_val text := public.normalize_reason(reason_raw);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    -- Reject reasons longer than 500 chars AFTER trim (mirrors Zod .max(500)).
    IF reason_trimmed_len > 500 THEN
      RAISE EXCEPTION 'السبب طويل جدًا (الحد الأقصى 500 حرفًا)'
        USING ERRCODE = 'check_violation',
              HINT = 'reason_too_long',
              DETAIL = format('Reason length after trim = %s, max = 500.', reason_trimmed_len);
    END IF;

    -- Require a non-blank reason for cancellations / no-shows.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('cancelled','no_show') THEN
      IF reason_val IS NULL OR length(reason_val) = 0 THEN
        RAISE EXCEPTION 'السبب مطلوب عند تغيير الحالة إلى %', NEW.status
          USING ERRCODE = 'check_violation',
                HINT = 'reason_required_for_' || NEW.status::text,
                DETAIL = 'Reason must not be empty after trimming whitespace (including \n, \t, NBSP).';
      END IF;
    END IF;

    -- Defensive: any provided reason must not be blank after normalization.
    IF reason_raw IS NOT NULL AND (reason_val IS NULL OR length(reason_val) = 0) THEN
      RAISE EXCEPTION 'السبب المُدخل فارغ بعد إزالة الفراغات'
        USING ERRCODE = 'check_violation',
              HINT = 'reason_blank_after_trim',
              DETAIL = 'Provided reason contained only whitespace characters.';
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
