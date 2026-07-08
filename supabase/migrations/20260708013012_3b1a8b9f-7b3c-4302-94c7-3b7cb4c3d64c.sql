
-- 1) Add web_push channel to notifications
ALTER TYPE public.notification_channel ADD VALUE IF NOT EXISTS 'web_push';

-- 2) Push subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  failure_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Index to speed up dedup lookups on reminders
CREATE INDEX IF NOT EXISTS idx_notifications_appt_kind
  ON public.notifications(appointment_id, kind);

-- 4) Reminder enqueue function (called by cron every ~5 min)
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
  _count_24 int := 0;
  _count_2  int := 0;
  _push_24  int := 0;
  _push_2   int := 0;
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
    _url   := '/appointment-tracker?ref=' || substring(replace(_appt.id::text,'-','') for 8);

    -- Resolve user
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

    -- Patient in-app + web_push (if we have a user)
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

    -- Staff in-app (always)
    INSERT INTO public.notifications
      (audience,kind,title,body,appointment_id,branch_id,channel,send_status,sent_at,metadata)
    VALUES
      ('staff','reminder_24h','تذكير — موعد غدًا',_body,_appt.id,_appt.branch_id,'in_app','sent',now(),
       jsonb_build_object('event','reminder_24h','patient_phone',_appt.patient_phone));

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
      ('staff','reminder_2h','تذكير — موعد بعد ساعتين',_body,_appt.id,_appt.branch_id,'in_app','sent',now(),
       jsonb_build_object('event','reminder_2h','patient_phone',_appt.patient_phone));

    _count_2 := _count_2 + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reminder_24h_created', _count_24,
    'reminder_2h_created',  _count_2,
    'reminder_24h_web_push_pending', _push_24,
    'reminder_2h_web_push_pending',  _push_2,
    'ran_at', now()
  );
END $$;

-- Allow the public cron endpoint (anon key) to trigger the enqueuer
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminders() TO anon, authenticated, service_role;

-- 5) Function for the signed-in user to list & count their in-app notifications
CREATE OR REPLACE FUNCTION public.my_notifications(_limit int DEFAULT 30)
RETURNS TABLE(
  id uuid, kind text, title text, body text,
  appointment_id uuid, metadata jsonb, read_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.kind, n.title, n.body, n.appointment_id, n.metadata, n.read_at, n.created_at
  FROM public.notifications n
  WHERE n.channel = 'in_app'
    AND n.audience = 'user'
    AND n.user_id = auth.uid()
  ORDER BY n.created_at DESC
  LIMIT GREATEST(_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(_ids uuid[] DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  UPDATE public.notifications
    SET read_at = now()
    WHERE user_id = auth.uid()
      AND channel = 'in_app'
      AND read_at IS NULL
      AND (_ids IS NULL OR id = ANY(_ids));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

GRANT EXECUTE ON FUNCTION public.my_notifications(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;
