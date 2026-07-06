
-- 1) Audit table
CREATE TABLE public.appointment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_status public.appointment_status,
  new_status public.appointment_status,
  old_notes text,
  new_notes text,
  reason text
);
CREATE INDEX appointment_audit_appt_idx ON public.appointment_audit(appointment_id, changed_at DESC);

GRANT SELECT ON public.appointment_audit TO authenticated;
GRANT ALL ON public.appointment_audit TO service_role;

ALTER TABLE public.appointment_audit ENABLE ROW LEVEL SECURITY;

-- Only admin/reception can read; nobody can INSERT/UPDATE/DELETE directly
-- (audit rows are written by the SECURITY DEFINER trigger below).
CREATE POLICY "staff read audit"
  ON public.appointment_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'reception'));

-- 2) Trigger function
CREATE OR REPLACE FUNCTION public.log_appointment_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reason_val text := NULLIF(current_setting('app.change_reason', true), '');
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.notes IS DISTINCT FROM OLD.notes THEN
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
END $$;

DROP TRIGGER IF EXISTS trg_appointment_audit ON public.appointments;
CREATE TRIGGER trg_appointment_audit
  AFTER UPDATE OF status, notes ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.log_appointment_change();

-- 3) RPCs that carry the reason into the same transaction as the UPDATE.
--    SECURITY INVOKER so RLS on public.appointments still applies to the caller.
CREATE OR REPLACE FUNCTION public.update_appointment_status(
  _id uuid,
  _status public.appointment_status,
  _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.change_reason', COALESCE(_reason,''), true);
  UPDATE public.appointments SET status = _status WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.update_appointment_notes(
  _id uuid,
  _notes text,
  _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.change_reason', COALESCE(_reason,''), true);
  UPDATE public.appointments SET notes = _notes WHERE id = _id;
END $$;

GRANT EXECUTE ON FUNCTION public.update_appointment_status(uuid, public.appointment_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_appointment_notes(uuid, text, text) TO authenticated;
