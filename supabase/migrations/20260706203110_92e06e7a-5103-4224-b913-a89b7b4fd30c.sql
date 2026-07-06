
CREATE TABLE public.security_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  actor UUID,
  appointment_id UUID,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view security audit log"
  ON public.security_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX security_audit_log_appointment_idx ON public.security_audit_log(appointment_id);
CREATE INDEX security_audit_log_actor_idx ON public.security_audit_log(actor);
CREATE INDEX security_audit_log_created_idx ON public.security_audit_log(created_at DESC);

CREATE OR REPLACE FUNCTION public.log_security_event(
  _action TEXT,
  _appointment_id UUID DEFAULT NULL,
  _from_status TEXT DEFAULT NULL,
  _to_status TEXT DEFAULT NULL,
  _reason TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.security_audit_log
    (action, actor, appointment_id, from_status, to_status, reason, metadata)
  VALUES
    (_action, auth.uid(), _appointment_id, _from_status, _to_status, _reason, _metadata);
END $$;

GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;
