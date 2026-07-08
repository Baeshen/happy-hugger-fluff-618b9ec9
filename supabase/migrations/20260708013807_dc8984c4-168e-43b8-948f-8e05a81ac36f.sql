
-- 1) New column: list of reminder offsets in minutes before appointment
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_offsets_minutes int[] NOT NULL DEFAULT ARRAY[1440, 120];

-- Backfill from existing booleans
UPDATE public.appointments
SET reminder_offsets_minutes =
  ARRAY(
    SELECT o FROM (
      VALUES (CASE WHEN reminder_24h THEN 1440 END),
             (CASE WHEN reminder_2h  THEN 120  END)
    ) AS t(o) WHERE o IS NOT NULL
  )
WHERE reminder_offsets_minutes = ARRAY[1440, 120]
  AND (reminder_24h = false OR reminder_2h = false);

-- 2) Sync trigger: keep booleans and array consistent both ways
CREATE OR REPLACE FUNCTION public.sync_reminder_offsets()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _offsets int[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Prefer explicit array; if only booleans provided, derive
    IF NEW.reminder_offsets_minutes IS NULL THEN
      NEW.reminder_offsets_minutes := ARRAY(
        SELECT o FROM (
          VALUES (CASE WHEN COALESCE(NEW.reminder_24h,true) THEN 1440 END),
                 (CASE WHEN COALESCE(NEW.reminder_2h ,true) THEN 120  END)
        ) t(o) WHERE o IS NOT NULL
      );
    END IF;
    -- Sanitize: unique, positive, capped 1..10080 (1 week)
    NEW.reminder_offsets_minutes := ARRAY(
      SELECT DISTINCT x FROM unnest(NEW.reminder_offsets_minutes) x
      WHERE x BETWEEN 1 AND 10080
      ORDER BY x DESC
    );
    NEW.reminder_24h := 1440 = ANY(NEW.reminder_offsets_minutes);
    NEW.reminder_2h  := 120  = ANY(NEW.reminder_offsets_minutes);
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.reminder_offsets_minutes IS DISTINCT FROM OLD.reminder_offsets_minutes THEN
    -- Array is source of truth
    NEW.reminder_offsets_minutes := ARRAY(
      SELECT DISTINCT x FROM unnest(COALESCE(NEW.reminder_offsets_minutes, ARRAY[]::int[])) x
      WHERE x BETWEEN 1 AND 10080
      ORDER BY x DESC
    );
    NEW.reminder_24h := 1440 = ANY(NEW.reminder_offsets_minutes);
    NEW.reminder_2h  := 120  = ANY(NEW.reminder_offsets_minutes);
  ELSIF NEW.reminder_24h IS DISTINCT FROM OLD.reminder_24h
     OR NEW.reminder_2h  IS DISTINCT FROM OLD.reminder_2h  THEN
    _offsets := COALESCE(NEW.reminder_offsets_minutes, ARRAY[]::int[]);
    -- toggle 1440
    IF NEW.reminder_24h AND NOT (1440 = ANY(_offsets)) THEN
      _offsets := array_append(_offsets, 1440);
    ELSIF NOT NEW.reminder_24h AND (1440 = ANY(_offsets)) THEN
      _offsets := array_remove(_offsets, 1440);
    END IF;
    -- toggle 120
    IF NEW.reminder_2h AND NOT (120 = ANY(_offsets)) THEN
      _offsets := array_append(_offsets, 120);
    ELSIF NOT NEW.reminder_2h AND (120 = ANY(_offsets)) THEN
      _offsets := array_remove(_offsets, 120);
    END IF;
    NEW.reminder_offsets_minutes := ARRAY(
      SELECT DISTINCT x FROM unnest(_offsets) x
      WHERE x BETWEEN 1 AND 10080
      ORDER BY x DESC
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_reminder_offsets ON public.appointments;
CREATE TRIGGER trg_sync_reminder_offsets
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.sync_reminder_offsets();

-- 3) Rewrite enqueue to iterate custom offsets
CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _appt public.appointments%ROWTYPE;
  _user_id uuid;
  _title text;
  _body text;
  _url text;
  _staff_title text;
  _kind text;
  _offset_min int;
  _target_ts timestamptz;
  _label_ar text;
  _created int := 0;
  _staff_push int := 0;
  _user_push int := 0;
BEGIN
  FOR _appt IN
    SELECT a.* FROM public.appointments a
    WHERE a.status IN ('new','confirmed')
      AND a.reminder_offsets_minutes IS NOT NULL
      AND cardinality(a.reminder_offsets_minutes) > 0
      AND (a.appointment_date + a.appointment_time)::timestamptz
          BETWEEN now() + interval '5 minutes' AND now() + interval '10080 minutes' + interval '10 minutes'
  LOOP
    FOREACH _offset_min IN ARRAY _appt.reminder_offsets_minutes
    LOOP
      _target_ts := (_appt.appointment_date + _appt.appointment_time)::timestamptz - make_interval(mins => _offset_min);

      -- Fire when we're within ±5 minutes of the target
      CONTINUE WHEN now() < _target_ts - interval '5 minutes'
                OR now() > _target_ts + interval '5 minutes';

      -- Reminder kind: keep legacy names for 24h/2h for back-compat, else reminder_<n>m
      _kind := CASE _offset_min
                 WHEN 1440 THEN 'reminder_24h'
                 WHEN 120  THEN 'reminder_2h'
                 ELSE 'reminder_' || _offset_min::text || 'm'
               END;

      -- Skip if already enqueued
      IF EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.appointment_id = _appt.id AND n.kind = _kind
      ) THEN
        CONTINUE;
      END IF;

      -- Human label
      _label_ar := CASE
        WHEN _offset_min >= 1440 AND _offset_min % 1440 = 0
          THEN 'قبل ' || (_offset_min/1440)::text || ' يوم'
        WHEN _offset_min >= 60 AND _offset_min % 60 = 0
          THEN 'قبل ' || (_offset_min/60)::text || ' ساعة'
        ELSE 'قبل ' || _offset_min::text || ' دقيقة'
      END;

      _title := 'تذكير: موعدك ' || _label_ar;
      _body  := 'موعد ' || coalesce(_appt.patient_name,'') ||
                ' بتاريخ ' || to_char(_appt.appointment_date,'YYYY-MM-DD') ||
                ' الساعة ' || to_char(_appt.appointment_time,'HH24:MI');
      _staff_title := 'تذكير — موعد ' || _label_ar;
      _url := '/appointment-tracker?ref=' || substring(replace(_appt.id::text,'-','') for 8);

      _user_id := NULL;
      IF _appt.patient_id IS NOT NULL THEN
        SELECT p.profile_id INTO _user_id FROM public.patients p WHERE p.id = _appt.patient_id;
      END IF;
      IF _user_id IS NULL THEN
        SELECT pr.id INTO _user_id FROM public.profiles pr
        WHERE pr.phone IS NOT NULL
          AND regexp_replace(pr.phone,'\D','','g') = regexp_replace(_appt.patient_phone,'\D','','g')
        LIMIT 1;
      END IF;

      IF _user_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (audience,user_id,kind,title,body,appointment_id,branch_id,channel,send_status,sent_at,metadata)
        VALUES
          ('user',_user_id,_kind,_title,_body,_appt.id,_appt.branch_id,'in_app','sent',now(),
           jsonb_build_object('event',_kind,'offset_min',_offset_min,'url',_url));

        INSERT INTO public.notifications
          (audience,user_id,kind,title,body,appointment_id,branch_id,channel,send_status,metadata)
        VALUES
          ('user',_user_id,_kind,_title,_body,_appt.id,_appt.branch_id,'web_push','pending',
           jsonb_build_object('event',_kind,'offset_min',_offset_min,'url',_url));
        _user_push := _user_push + 1;
      END IF;

      INSERT INTO public.notifications
        (audience,kind,title,body,appointment_id,branch_id,channel,send_status,sent_at,metadata)
      VALUES
        ('staff',_kind,_staff_title,_body,_appt.id,_appt.branch_id,'in_app','sent',now(),
         jsonb_build_object('event',_kind,'offset_min',_offset_min,'patient_phone',_appt.patient_phone,'url','/admin/appointments'));

      INSERT INTO public.notifications
        (audience,kind,title,body,appointment_id,branch_id,channel,send_status,metadata)
      VALUES
        ('staff',_kind,_staff_title,_body,_appt.id,_appt.branch_id,'web_push','pending',
         jsonb_build_object('event',_kind,'offset_min',_offset_min,'patient_phone',_appt.patient_phone,'url','/admin/appointments',
                            'staff_roles', jsonb_build_array('admin','reception','super_admin')));
      _staff_push := _staff_push + 1;

      _created := _created + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'reminders_created', _created,
    'user_web_push_pending', _user_push,
    'staff_web_push_pending', _staff_push,
    'ran_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminders() TO anon, authenticated, service_role;
