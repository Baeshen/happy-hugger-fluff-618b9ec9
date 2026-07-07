
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
