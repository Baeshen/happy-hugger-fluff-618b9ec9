
-- 1) Extend security_audit_log with IP + user agent
ALTER TABLE public.security_audit_log
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 2) Extend log_security_event with optional IP/UA
CREATE OR REPLACE FUNCTION public.log_security_event(
  _action text,
  _appointment_id uuid DEFAULT NULL,
  _from_status text DEFAULT NULL,
  _to_status text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.security_audit_log
    (action, actor, appointment_id, from_status, to_status, reason, metadata, ip_address, user_agent)
  VALUES
    (_action, auth.uid(), _appointment_id, _from_status, _to_status, _reason, _metadata,
     NULLIF(_ip_address,'')::inet, NULLIF(_user_agent,''));
END $$;

-- 3) List users with their roles (admin/super_admin only)
CREATE OR REPLACE FUNCTION public.list_users_with_roles()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  phone text,
  email text,
  created_at timestamptz,
  roles jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, u.email, u.created_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('role', ur.role, 'branch_id', ur.branch_id) ORDER BY ur.role)
         FROM public.user_roles ur WHERE ur.user_id = p.id),
      '[]'::jsonb
    ) AS roles
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY u.created_at DESC NULLS LAST;
END $$;

-- 4) Assign role
CREATE OR REPLACE FUNCTION public.assign_user_role(
  _user_id uuid,
  _role app_role,
  _branch_id uuid DEFAULT NULL,
  _ip text DEFAULT NULL,
  _ua text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super boolean := public.has_role(auth.uid(),'super_admin');
BEGIN
  IF auth.uid() IS NULL OR NOT (_is_super OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  -- Only super_admin may grant super_admin or admin
  IF _role IN ('super_admin','admin') AND NOT _is_super THEN
    RAISE EXCEPTION 'only super_admin may grant this role' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.user_roles (user_id, role, branch_id)
  VALUES (_user_id, _role, _branch_id)
  ON CONFLICT (user_id, role) DO UPDATE SET branch_id = EXCLUDED.branch_id;

  PERFORM public.log_security_event(
    'role_assigned', NULL, NULL, NULL, NULL,
    jsonb_build_object('target_user', _user_id, 'role', _role, 'branch_id', _branch_id),
    _ip, _ua
  );
END $$;

-- 5) Revoke role
CREATE OR REPLACE FUNCTION public.revoke_user_role(
  _user_id uuid,
  _role app_role,
  _ip text DEFAULT NULL,
  _ua text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super boolean := public.has_role(auth.uid(),'super_admin');
BEGIN
  IF auth.uid() IS NULL OR NOT (_is_super OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _role IN ('super_admin','admin') AND NOT _is_super THEN
    RAISE EXCEPTION 'only super_admin may revoke this role' USING ERRCODE='42501';
  END IF;

  -- Prevent removing the last super_admin
  IF _role = 'super_admin' THEN
    IF (SELECT count(*) FROM public.user_roles WHERE role='super_admin') <= 1 THEN
      RAISE EXCEPTION 'cannot remove the last super_admin' USING ERRCODE='check_violation';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;

  PERFORM public.log_security_event(
    'role_revoked', NULL, NULL, NULL, NULL,
    jsonb_build_object('target_user', _user_id, 'role', _role),
    _ip, _ua
  );
END $$;

-- 6) Grant execute on new RPCs
GRANT EXECUTE ON FUNCTION public.list_users_with_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_role(uuid, app_role, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, uuid, text, text, text, jsonb, text, text) TO authenticated;
