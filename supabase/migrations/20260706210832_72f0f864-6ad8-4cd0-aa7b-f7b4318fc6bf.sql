
CREATE OR REPLACE FUNCTION public.update_appointment_notes(_id uuid, _notes text, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  notes_raw text := _notes;
  notes_trimmed_len int := CASE
    WHEN notes_raw IS NULL THEN 0
    ELSE length(
      regexp_replace(
        regexp_replace(notes_raw, '^[\s\u00A0]+', '', 'g'),
        '[\s\u00A0]+$', '', 'g'
      )
    )
  END;
  notes_val text := public.normalize_reason(notes_raw); -- same edge-trim + 500 cap
BEGIN
  -- NULL means "clear notes"; that is allowed.
  IF notes_raw IS NOT NULL THEN
    -- Reject > 500 chars AFTER trim (mirrors Zod .max(500)).
    IF notes_trimmed_len > 500 THEN
      RAISE EXCEPTION 'الملاحظات طويلة جدًا (الحد الأقصى 500 حرفًا)'
        USING ERRCODE = 'check_violation',
              HINT = 'notes_too_long',
              DETAIL = format('Notes length after trim = %s, max = 500.', notes_trimmed_len);
    END IF;

    -- Provided-but-blank-after-trim → reject (use NULL to clear instead).
    IF notes_val IS NULL OR length(notes_val) = 0 THEN
      RAISE EXCEPTION 'الملاحظات المُدخلة فارغة بعد إزالة الفراغات'
        USING ERRCODE = 'check_violation',
              HINT = 'notes_blank_after_trim',
              DETAIL = 'Provided notes contained only whitespace characters.';
    END IF;
  END IF;

  PERFORM set_config('app.change_reason', COALESCE(_reason,''), true);
  UPDATE public.appointments SET notes = notes_val WHERE id = _id;
END $function$;
