-- 1) Patient notification preferences
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_whatsapp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT false;

-- 2) Snapshot email on appointments (used when patient row not linked)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_email text;

-- 3) Notification channel/dispatch columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE public.notification_channel AS ENUM ('in_app','sms','whatsapp','email');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_send_status') THEN
    CREATE TYPE public.notification_send_status AS ENUM ('pending','queued','sent','failed','skipped');
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS channel public.notification_channel NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS recipient text,
  ADD COLUMN IF NOT EXISTS send_status public.notification_send_status NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS notifications_pending_idx
  ON public.notifications (send_status, channel, created_at)
  WHERE send_status IN ('pending','failed');

-- Staff (admin/reception) may update send status
DROP POLICY IF EXISTS "notifications_staff_update_status" ON public.notifications;
CREATE POLICY "notifications_staff_update_status" ON public.notifications
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'reception')
)
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'reception')
);

-- 4) Helper: append one notification row per enabled channel
CREATE OR REPLACE FUNCTION public._emit_appointment_notification(
  _appt public.appointments,
  _kind text,
  _title text,
  _body text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p_email text;
  p_phone text := _appt.patient_phone;
  p_notify_sms boolean := true;
  p_notify_wa  boolean := COALESCE(_appt.whatsapp_opt_in, true);
  p_notify_email boolean := false;
  p_user uuid;
  meta jsonb := jsonb_build_object(
    'event', _kind,
    'appointment_date', _appt.appointment_date,
    'appointment_time', _appt.appointment_time,
    'status', _appt.status
  );
BEGIN
  -- Resolve patient prefs (by patient_id, else by phone match)
  IF _appt.patient_id IS NOT NULL THEN
    SELECT p.email, p.notify_sms, p.notify_whatsapp, p.notify_email, p.profile_id
      INTO p_email, p_notify_sms, p_notify_wa, p_notify_email, p_user
    FROM public.patients p WHERE p.id = _appt.patient_id;
  ELSE
    SELECT p.email, p.notify_sms, p.notify_whatsapp, p.notify_email, p.profile_id
      INTO p_email, p_notify_sms, p_notify_wa, p_notify_email, p_user
    FROM public.patients p
    WHERE regexp_replace(p.phone,'\D','','g') = regexp_replace(_appt.patient_phone,'\D','','g')
    LIMIT 1;
  END IF;

  IF p_email IS NULL THEN p_email := _appt.patient_email; END IF;

  -- Staff in-app (always)
  INSERT INTO public.notifications
    (audience, kind, title, body, appointment_id, branch_id, channel, send_status, sent_at, metadata)
  VALUES
    ('staff', _kind, _title, _body, _appt.id, _appt.branch_id, 'in_app', 'sent', now(), meta);

  -- Patient in-app (if linked to a profile)
  IF p_user IS NOT NULL THEN
    INSERT INTO public.notifications
      (audience, user_id, kind, title, body, appointment_id, branch_id, channel, send_status, sent_at, metadata)
    VALUES
      ('user', p_user, _kind, _title, _body, _appt.id, _appt.branch_id, 'in_app', 'sent', now(), meta);
  END IF;

  -- SMS (pending until a provider is wired)
  IF p_notify_sms AND p_phone IS NOT NULL AND length(p_phone) > 0 THEN
    INSERT INTO public.notifications
      (audience, user_id, kind, title, body, appointment_id, branch_id, channel, recipient, send_status, metadata)
    VALUES
      ('user', p_user, _kind, _title, _body, _appt.id, _appt.branch_id, 'sms', p_phone, 'pending', meta);
  END IF;

  -- WhatsApp
  IF p_notify_wa AND p_phone IS NOT NULL AND length(p_phone) > 0 THEN
    INSERT INTO public.notifications
      (audience, user_id, kind, title, body, appointment_id, branch_id, channel, recipient, send_status, metadata)
    VALUES
      ('user', p_user, _kind, _title, _body, _appt.id, _appt.branch_id, 'whatsapp', p_phone, 'pending', meta);
  END IF;

  -- Email
  IF p_notify_email AND p_email IS NOT NULL AND length(p_email) > 0 THEN
    INSERT INTO public.notifications
      (audience, user_id, kind, title, body, appointment_id, branch_id, channel, recipient, send_status, metadata)
    VALUES
      ('user', p_user, _kind, _title, _body, _appt.id, _appt.branch_id, 'email', p_email, 'pending', meta);
  END IF;
END $$;

-- 5) Trigger dispatcher on appointments
CREATE OR REPLACE FUNCTION public.trg_appointments_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _title text;
  _body  text;
  _kind  text;
  _time_lbl text := to_char(NEW.appointment_time,'HH24:MI');
  _date_lbl text := to_char(NEW.appointment_date,'YYYY-MM-DD');
BEGIN
  IF TG_OP = 'INSERT' THEN
    _kind  := 'appointment_created';
    _title := 'تم استلام حجزكم';
    _body  := 'تم تسجيل حجز باسم ' || COALESCE(NEW.patient_name,'') ||
              ' بتاريخ ' || _date_lbl || ' الساعة ' || _time_lbl ||
              '. الحالة: قيد الانتظار.';
    PERFORM public._emit_appointment_notification(NEW, _kind, _title, _body);
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      _kind := 'appointment_confirmed';
      _title := 'تم تأكيد موعدكم';
      _body  := 'تم تأكيد موعد ' || COALESCE(NEW.patient_name,'') ||
                ' بتاريخ ' || _date_lbl || ' الساعة ' || _time_lbl || '.';
      PERFORM public._emit_appointment_notification(NEW, _kind, _title, _body);
    ELSIF NEW.status = 'cancelled' THEN
      _kind := 'appointment_cancelled';
      _title := 'تم إلغاء موعدكم';
      _body  := 'تم إلغاء موعد ' || COALESCE(NEW.patient_name,'') ||
                ' بتاريخ ' || _date_lbl || ' الساعة ' || _time_lbl ||
                COALESCE('. السبب: ' || NULLIF(current_setting('app.change_reason', true), ''), '') || '.';
      PERFORM public._emit_appointment_notification(NEW, _kind, _title, _body);
    END IF;
  END IF;

  IF (NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
      OR NEW.appointment_time IS DISTINCT FROM OLD.appointment_time)
     AND NEW.status NOT IN ('cancelled','no_show','completed') THEN
    _kind := 'appointment_rescheduled';
    _title := 'تم تغيير موعدكم';
    _body  := 'الموعد الجديد لـ ' || COALESCE(NEW.patient_name,'') ||
              ' بتاريخ ' || _date_lbl || ' الساعة ' || _time_lbl ||
              ' (بدلاً من ' || to_char(OLD.appointment_date,'YYYY-MM-DD') ||
              ' ' || to_char(OLD.appointment_time,'HH24:MI') || ').';
    PERFORM public._emit_appointment_notification(NEW, _kind, _title, _body);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointments_notify_ins ON public.appointments;
CREATE TRIGGER trg_appointments_notify_ins
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.trg_appointments_notify();

DROP TRIGGER IF EXISTS trg_appointments_notify_upd ON public.appointments;
CREATE TRIGGER trg_appointments_notify_upd
AFTER UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.trg_appointments_notify();