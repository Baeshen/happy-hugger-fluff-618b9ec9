
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
  _count_24 int := 0;
  _count_2  int := 0;
  _push_24  int := 0;
  _push_2   int := 0;
  _staff_push_24 int := 0;
  _staff_push_2  int := 0;
  _win_24_start timestamptz := now() + interval '23 hours 50 minutes';
  _win_24_end   timestamptz := now() + interval '24 hours 10 minutes';
  _win_2_start  timestamptz := now() + interval '1 hour 50 minutes';
  _win_2_end    timestamptz := now() + interval '2 hours 10 minutes';
BEGIN
  -- 24h reminders
  FOR _appt IN
    SELECT a.* FROM public.appointments a
    WHERE a.status IN ('new','confirmed')
      AND a.reminder_24h = true
      AND (a.appointment_date + a.appointment_time)::timestamptz
          BETWEEN _win_24_start AND _win_24_end
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.appointment_id = a.id AND n.kind = 'reminder_24h'
      )
  LOOP
    _title := 'تذكير: موعدك غدًا';
    _body  := 'موعد ' || coalesce(_appt.patient_name,'') ||
              ' غدًا بتاريخ ' || to_char(_appt.appointment_date,'YYYY-MM-DD') ||
              ' الساعة ' || to_char(_appt.appointment_time,'HH24:MI');
    _staff_title := 'تذكير — موعد غدًا';
    _url   := '/appointment-tracker?ref=' || substring(replace(_appt.id::text,'-','') for 8);

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
        ('user',_user_id,'reminder_24h',_title,_body,_appt.id,_appt.branch_id,'in_app','sent',now(),
         jsonb_build_object('event','reminder_24h','url',_url));

      INSERT INTO public.notifications
        (audience,user_id,kind,title,body,appointment_id,branch_id,channel,send_status,metadata)
      VALUES
        ('user',_user_id,'reminder_24h',_title,_body,_appt.id,_appt.branch_id,'web_push','pending',
         jsonb_build_object('event','reminder_24h','url',_url));
      _push_24 := _push_24 + 1;
    END IF;

    -- Staff in-app
    INSERT INTO public.notifications
      (audience,kind,title,body,appointment_id,branch_id,channel,send_status,sent_at,metadata)
    VALUES
      ('staff','reminder_24h',_staff_title,_body,_appt.id,_appt.branch_id,'in_app','sent',now(),
       jsonb_build_object('event','reminder_24h','patient_phone',_appt.patient_phone,'url','/admin/appointments'));

    -- Staff web_push (fanned out at delivery time)
    INSERT INTO public.notifications
      (audience,kind,title,body,appointment_id,branch_id,channel,send_status,metadata)
    VALUES
      ('staff','reminder_24h',_staff_title,_body,_appt.id,_appt.branch_id,'web_push','pending',
       jsonb_build_object('event','reminder_24h','patient_phone',_appt.patient_phone,'url','/admin/appointments',
                          'staff_roles', jsonb_build_array('admin','reception','super_admin')));
    _staff_push_24 := _staff_push_24 + 1;

    _count_24 := _count_24 + 1;
  END LOOP;

  -- 2h reminders
  FOR _appt IN
    SELECT a.* FROM public.appointments a
    WHERE a.status IN ('new','confirmed')
      AND a.reminder_2h = true
      AND (a.appointment_date + a.appointment_time)::timestamptz
          BETWEEN _win_2_start AND _win_2_end
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.appointment_id = a.id AND n.kind = 'reminder_2h'
      )
  LOOP
    _title := 'تذكير: موعدك بعد ساعتين';
    _body  := 'موعد ' || coalesce(_appt.patient_name,'') ||
              ' اليوم الساعة ' || to_char(_appt.appointment_time,'HH24:MI');
    _staff_title := 'تذكير — موعد بعد ساعتين';
    _url   := '/appointment-tracker?ref=' || substring(replace(_appt.id::text,'-','') for 8);

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
        ('user',_user_id,'reminder_2h',_title,_body,_appt.id,_appt.branch_id,'in_app','sent',now(),
         jsonb_build_object('event','reminder_2h','url',_url));

      INSERT INTO public.notifications
        (audience,user_id,kind,title,body,appointment_id,branch_id,channel,send_status,metadata)
      VALUES
        ('user',_user_id,'reminder_2h',_title,_body,_appt.id,_appt.branch_id,'web_push','pending',
         jsonb_build_object('event','reminder_2h','url',_url));
      _push_2 := _push_2 + 1;
    END IF;

    INSERT INTO public.notifications
      (audience,kind,title,body,appointment_id,branch_id,channel,send_status,sent_at,metadata)
    VALUES
      ('staff','reminder_2h',_staff_title,_body,_appt.id,_appt.branch_id,'in_app','sent',now(),
       jsonb_build_object('event','reminder_2h','patient_phone',_appt.patient_phone,'url','/admin/appointments'));

    INSERT INTO public.notifications
      (audience,kind,title,body,appointment_id,branch_id,channel,send_status,metadata)
    VALUES
      ('staff','reminder_2h',_staff_title,_body,_appt.id,_appt.branch_id,'web_push','pending',
       jsonb_build_object('event','reminder_2h','patient_phone',_appt.patient_phone,'url','/admin/appointments',
                          'staff_roles', jsonb_build_array('admin','reception','super_admin')));
    _staff_push_2 := _staff_push_2 + 1;

    _count_2 := _count_2 + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reminder_24h_created', _count_24,
    'reminder_2h_created',  _count_2,
    'reminder_24h_web_push_pending', _push_24,
    'reminder_2h_web_push_pending',  _push_2,
    'staff_reminder_24h_web_push_pending', _staff_push_24,
    'staff_reminder_2h_web_push_pending',  _staff_push_2,
    'ran_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminders() TO anon, authenticated, service_role;
