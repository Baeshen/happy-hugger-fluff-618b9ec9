
CREATE OR REPLACE FUNCTION public.log_auth_event(
  _action text,
  _user_id uuid DEFAULT NULL,
  _email text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _ua text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _meta jsonb := COALESCE(_metadata, '{}'::jsonb);
BEGIN
  IF _email IS NOT NULL THEN
    _meta := _meta || jsonb_build_object('email', _email);
  END IF;
  INSERT INTO public.security_audit_log
    (action, actor, metadata, ip_address, user_agent)
  VALUES
    (_action, COALESCE(_user_id, auth.uid()), _meta,
     NULLIF(_ip,'')::inet, NULLIF(_ua,''));
END $$;

GRANT EXECUTE ON FUNCTION public.log_auth_event(text, uuid, text, text, text, jsonb) TO anon, authenticated;
