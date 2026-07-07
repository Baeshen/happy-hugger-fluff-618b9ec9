
-- 1. log_auth_event: prevent log forgery
CREATE OR REPLACE FUNCTION public.log_auth_event(_action text, _user_id uuid DEFAULT NULL::uuid, _email text DEFAULT NULL::text, _ip text DEFAULT NULL::text, _ua text DEFAULT NULL::text, _metadata jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _meta jsonb := COALESCE(_metadata, '{}'::jsonb);
  _actor uuid;
BEGIN
  -- Never trust the client-supplied _user_id. If the caller is authenticated,
  -- attribute the log to them; otherwise (pre-auth login attempt) leave actor NULL.
  IF auth.uid() IS NOT NULL THEN
    _actor := auth.uid();
  ELSE
    _actor := NULL;
  END IF;

  IF _email IS NOT NULL THEN
    _meta := _meta || jsonb_build_object('email', _email);
  END IF;
  INSERT INTO public.security_audit_log
    (action, actor, metadata, ip_address, user_agent)
  VALUES
    (_action, _actor, _meta,
     NULLIF(_ip,'')::inet, NULLIF(_ua,''));
END $function$;

-- 2. Guest ref RPCs: reject short refs (require ≥8 hex chars)
CREATE OR REPLACE FUNCTION public.lookup_appointment(_ref text, _phone text)
 RETURNS TABLE(id uuid, patient_name text, patient_phone text, appointment_date date, appointment_time time without time zone, status appointment_status, reason text, notes text, specialty_id uuid, doctor_id uuid, specialty_name_ar text, specialty_name_en text, doctor_name_ar text, doctor_name_en text, created_at timestamp with time zone, reminder_24h boolean, reminder_2h boolean, cancel_reason text, cancelled_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _ref IS NULL OR length(regexp_replace(_ref,'[^0-9a-fA-F]','','g')) < 8 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT a.id, a.patient_name, a.patient_phone, a.appointment_date, a.appointment_time,
         a.status, a.reason, a.notes, a.specialty_id, a.doctor_id,
         s.name_ar, s.name_en, d.name_ar, d.name_en, a.created_at,
         a.reminder_24h, a.reminder_2h,
         (SELECT au.reason FROM public.appointment_audit au
            WHERE au.appointment_id = a.id AND au.new_status = 'cancelled'
            ORDER BY au.changed_at DESC LIMIT 1) AS cancel_reason,
         (SELECT au.changed_at FROM public.appointment_audit au
            WHERE au.appointment_id = a.id AND au.new_status = 'cancelled'
            ORDER BY au.changed_at DESC LIMIT 1) AS cancelled_at
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
  LIMIT 1;
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_by_ref(_ref text, _phone text, _reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _reason_val text := public.normalize_reason(_reason);
BEGIN
  IF _ref IS NULL OR length(regexp_replace(_ref,'[^0-9a-fA-F]','','g')) < 8 THEN
    RETURN false;
  END IF;

  SELECT a.id INTO _id
  FROM public.appointments a
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
    AND a.status IN ('new','confirmed')
  LIMIT 1;

  IF _id IS NULL THEN
    RETURN false;
  END IF;

  IF _reason_val IS NULL OR length(_reason_val) = 0 THEN
    _reason_val := 'إلغاء من المراجع';
  END IF;

  PERFORM set_config('app.change_reason', _reason_val, true);
  UPDATE public.appointments SET status = 'cancelled' WHERE id = _id;
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_ref(_ref text, _phone text, _new_date date, _new_time time without time zone, _reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _doctor uuid;
  _reason_val text := public.normalize_reason(_reason);
BEGIN
  IF _ref IS NULL OR length(regexp_replace(_ref,'[^0-9a-fA-F]','','g')) < 8 THEN
    RETURN false;
  END IF;

  SELECT a.id, a.doctor_id INTO _id, _doctor
  FROM public.appointments a
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
    AND a.status IN ('new','confirmed')
  LIMIT 1;

  IF _id IS NULL THEN RETURN false; END IF;

  IF (_new_date + _new_time) <= now() THEN
    RAISE EXCEPTION 'الموعد الجديد يجب أن يكون في المستقبل' USING ERRCODE='check_violation';
  END IF;

  IF _doctor IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.appointments
    WHERE doctor_id = _doctor
      AND appointment_date = _new_date
      AND appointment_time = _new_time
      AND status IN ('new','confirmed')
      AND id <> _id
  ) THEN
    RAISE EXCEPTION 'هذا الموعد محجوز بالفعل، الرجاء اختيار وقت آخر' USING ERRCODE='unique_violation';
  END IF;

  IF _reason_val IS NULL OR length(_reason_val) = 0 THEN
    _reason_val := 'إعادة جدولة من المراجع';
  END IF;

  PERFORM set_config('app.change_reason', _reason_val, true);
  UPDATE public.appointments
     SET appointment_date = _new_date,
         appointment_time = _new_time,
         status = 'new'
   WHERE id = _id;

  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.update_reminders_by_ref(_ref text, _phone text, _reminder_24h boolean, _reminder_2h boolean, _reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _reason_val text := public.normalize_reason(_reason);
BEGIN
  IF _ref IS NULL OR length(regexp_replace(_ref,'[^0-9a-fA-F]','','g')) < 8 THEN
    RETURN false;
  END IF;

  SELECT a.id INTO _id FROM public.appointments a
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
    AND a.status IN ('new','confirmed')
  LIMIT 1;
  IF _id IS NULL THEN RETURN false; END IF;

  IF _reason_val IS NOT NULL AND length(_reason_val) > 0 THEN
    PERFORM set_config('app.change_reason', _reason_val, true);
  END IF;

  UPDATE public.appointments
     SET reminder_24h = COALESCE(_reminder_24h, reminder_24h),
         reminder_2h  = COALESCE(_reminder_2h,  reminder_2h)
   WHERE id = _id;
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.list_reminder_preferences_by_ref(_ref text, _phone text)
 RETURNS TABLE(id uuid, reminder_kind text, old_value boolean, new_value boolean, source text, reason text, changed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _ref IS NULL OR length(regexp_replace(_ref,'[^0-9a-fA-F]','','g')) < 8 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT rpa.id, rpa.reminder_kind, rpa.old_value, rpa.new_value, rpa.source, rpa.reason, rpa.changed_at
  FROM public.reminder_preference_audit rpa
  JOIN public.appointments a ON a.id = rpa.appointment_id
  WHERE lower(replace(a.id::text,'-','')) LIKE lower(_ref) || '%'
    AND regexp_replace(a.patient_phone,'\D','','g') = regexp_replace(_phone,'\D','','g')
  ORDER BY rpa.changed_at DESC
  LIMIT 200;
END $function$;

-- 4. has_branch_access: stop treating NULL branch_id as wildcard implicitly.
-- Introduce is_global flag; backfill existing NULL-branch rows to preserve behaviour.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

UPDATE public.user_roles
   SET is_global = true
 WHERE branch_id IS NULL AND is_global = false;

CREATE OR REPLACE FUNCTION public.has_branch_access(_user_id uuid, _branch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND (ur.is_global OR ur.branch_id = _branch_id)
    )
  );
$function$;

-- 3. assign/revoke role: enforce branch scope for non-super_admin actors
CREATE OR REPLACE FUNCTION public.assign_user_role(_user_id uuid, _role app_role, _branch_id uuid DEFAULT NULL::uuid, _ip text DEFAULT NULL::text, _ua text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_super boolean := public.has_role(auth.uid(),'super_admin');
BEGIN
  IF auth.uid() IS NULL OR NOT (_is_super OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _role IN ('super_admin','admin') AND NOT _is_super THEN
    RAISE EXCEPTION 'only super_admin may grant this role' USING ERRCODE='42501';
  END IF;

  -- Branch-scoped admins must have access to the target branch and cannot grant
  -- roles without a branch (global-scope roles are super_admin territory).
  IF NOT _is_super THEN
    IF _branch_id IS NULL THEN
      RAISE EXCEPTION 'branch_id required for branch-scoped admins' USING ERRCODE='42501';
    END IF;
    IF NOT public.has_branch_access(auth.uid(), _branch_id) THEN
      RAISE EXCEPTION 'no access to target branch' USING ERRCODE='42501';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role, branch_id, is_global)
  VALUES (_user_id, _role, _branch_id, _is_super AND _branch_id IS NULL)
  ON CONFLICT (user_id, role) DO UPDATE
    SET branch_id = EXCLUDED.branch_id,
        is_global = EXCLUDED.is_global;

  PERFORM public.log_security_event(
    'role_assigned', NULL, NULL, NULL, NULL,
    jsonb_build_object('target_user', _user_id, 'role', _role, 'branch_id', _branch_id),
    _ip, _ua
  );
END $function$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(_user_id uuid, _role app_role, _ip text DEFAULT NULL::text, _ua text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_super boolean := public.has_role(auth.uid(),'super_admin');
  _target_branch uuid;
  _target_is_global boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (_is_super OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _role IN ('super_admin','admin') AND NOT _is_super THEN
    RAISE EXCEPTION 'only super_admin may revoke this role' USING ERRCODE='42501';
  END IF;

  IF _role = 'super_admin' THEN
    IF (SELECT count(*) FROM public.user_roles WHERE role='super_admin') <= 1 THEN
      RAISE EXCEPTION 'cannot remove the last super_admin' USING ERRCODE='check_violation';
    END IF;
  END IF;

  SELECT branch_id, is_global INTO _target_branch, _target_is_global
    FROM public.user_roles WHERE user_id = _user_id AND role = _role;

  -- Non-super_admins may only revoke roles scoped to a branch they manage.
  IF NOT _is_super THEN
    IF _target_is_global OR _target_branch IS NULL
       OR NOT public.has_branch_access(auth.uid(), _target_branch) THEN
      RAISE EXCEPTION 'no access to target branch' USING ERRCODE='42501';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;

  PERFORM public.log_security_event(
    'role_revoked', NULL, NULL, NULL, NULL,
    jsonb_build_object('target_user', _user_id, 'role', _role),
    _ip, _ua
  );
END $function$;

-- 5. Prescriptions bucket: require upload path tied to a recent pending order
DROP POLICY IF EXISTS "anyone upload prescriptions" ON storage.objects;

CREATE POLICY "prescription upload requires pending order"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'prescriptions'
  AND (storage.foldername(name))[1] = 'orders'
  AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.medicine_orders mo
    WHERE mo.id = ((storage.foldername(name))[2])::uuid
      AND mo.status = 'new'
      AND mo.prescription_image_url IS NULL
      AND mo.created_at > now() - interval '15 minutes'
  )
);
