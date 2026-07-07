
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK (audience IN ('staff','user')),
  user_id uuid NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NULL,
  appointment_id uuid NULL,
  metadata jsonb NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC) WHERE audience = 'user';
CREATE INDEX idx_notifications_staff ON public.notifications(created_at DESC) WHERE audience = 'staff';
CREATE INDEX idx_notifications_unread ON public.notifications(audience, read_at) WHERE read_at IS NULL;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Staff can see all staff-audience notifications
CREATE POLICY "staff read staff notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    audience = 'staff'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'reception'))
  );

-- Users see their own
CREATE POLICY "users read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (audience = 'user' AND user_id = auth.uid());

-- Staff can mark staff notifications read
CREATE POLICY "staff update staff notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    audience = 'staff'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'reception'))
  )
  WITH CHECK (
    audience = 'staff'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'reception'))
  );

-- Users can mark their own read
CREATE POLICY "users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (audience = 'user' AND user_id = auth.uid())
  WITH CHECK (audience = 'user' AND user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Trigger: whenever a reminder preference audit row is inserted, fan out to notifications.
CREATE OR REPLACE FUNCTION public.notify_on_reminder_preference_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _appt public.appointments%ROWTYPE;
  _user_id uuid;
  _kind_ar text;
  _action_ar text;
  _title text;
  _body text;
  _source_ar text;
BEGIN
  SELECT * INTO _appt FROM public.appointments WHERE id = NEW.appointment_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  _kind_ar := CASE WHEN NEW.reminder_kind = 'reminder_24h' THEN 'تذكير قبل 24 ساعة' ELSE 'تذكير قبل ساعتين' END;
  _action_ar := CASE
    WHEN NEW.new_value = true AND (NEW.old_value IS DISTINCT FROM true) THEN 'تم تفعيل'
    WHEN NEW.new_value = false AND (NEW.old_value IS DISTINCT FROM false) THEN 'تم إيقاف'
    ELSE 'تم تحديث'
  END;
  _source_ar := CASE NEW.source
    WHEN 'self_service' THEN 'المراجع'
    WHEN 'staff' THEN 'موظف الاستقبال'
    ELSE 'النظام'
  END;

  _title := _action_ar || ' ' || _kind_ar;
  _body := 'موعد ' || COALESCE(_appt.patient_name,'') ||
           ' بتاريخ ' || to_char(_appt.appointment_date,'YYYY-MM-DD') ||
           ' الساعة ' || to_char(_appt.appointment_time,'HH24:MI') ||
           ' — بواسطة: ' || _source_ar;

  -- Staff notification
  INSERT INTO public.notifications
    (audience, kind, title, body, appointment_id, metadata)
  VALUES
    ('staff', 'reminder_preference_change', _title, _body, NEW.appointment_id,
     jsonb_build_object(
       'reminder_kind', NEW.reminder_kind,
       'old_value', NEW.old_value,
       'new_value', NEW.new_value,
       'source', NEW.source,
       'patient_phone', _appt.patient_phone,
       'audit_id', NEW.id
     ));

  -- User notification (if patient's phone matches a profile)
  SELECT p.id INTO _user_id
  FROM public.profiles p
  WHERE p.phone IS NOT NULL
    AND regexp_replace(p.phone,'\D','','g') = regexp_replace(_appt.patient_phone,'\D','','g')
  LIMIT 1;

  IF _user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (audience, user_id, kind, title, body, appointment_id, metadata)
    VALUES
      ('user', _user_id, 'reminder_preference_change', _title, _body, NEW.appointment_id,
       jsonb_build_object(
         'reminder_kind', NEW.reminder_kind,
         'old_value', NEW.old_value,
         'new_value', NEW.new_value,
         'source', NEW.source,
         'audit_id', NEW.id
       ));
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_on_reminder_preference_change
  AFTER INSERT ON public.reminder_preference_audit
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reminder_preference_change();
