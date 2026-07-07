
-- 1) Extend audit log with branch/table/record context
ALTER TABLE public.security_audit_log
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS table_name text,
  ADD COLUMN IF NOT EXISTS record_id uuid;

CREATE INDEX IF NOT EXISTS security_audit_log_branch_idx ON public.security_audit_log(branch_id);
CREATE INDEX IF NOT EXISTS security_audit_log_table_idx ON public.security_audit_log(table_name);
CREATE INDEX IF NOT EXISTS security_audit_log_record_idx ON public.security_audit_log(record_id);

-- 2) Generic row-change auditor
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row jsonb;
  _old jsonb;
  _new jsonb;
  _diff jsonb := '{}'::jsonb;
  _key text;
  _rec_id uuid := NULL;
  _branch uuid := NULL;
  _action text;
  _rec jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _rec := to_jsonb(OLD);
  ELSE
    _rec := to_jsonb(NEW);
  END IF;

  -- Extract record id / branch id if present
  IF _rec ? 'id' THEN
    BEGIN _rec_id := (_rec->>'id')::uuid; EXCEPTION WHEN OTHERS THEN _rec_id := NULL; END;
  END IF;
  IF _rec ? 'branch_id' THEN
    BEGIN _branch := (_rec->>'branch_id')::uuid; EXCEPTION WHEN OTHERS THEN _branch := NULL; END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _action := TG_TABLE_NAME || '.insert';
    _new := to_jsonb(NEW) - ARRAY['storage_path','file_url','password','password_hash','encrypted_password','auth_token'];
    INSERT INTO public.security_audit_log
      (action, actor, table_name, record_id, branch_id, metadata)
    VALUES
      (_action, auth.uid(), TG_TABLE_NAME, _rec_id, _branch,
       jsonb_build_object('new', _new));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _action := TG_TABLE_NAME || '.delete';
    _old := to_jsonb(OLD) - ARRAY['storage_path','file_url','password','password_hash','encrypted_password','auth_token'];
    INSERT INTO public.security_audit_log
      (action, actor, table_name, record_id, branch_id, metadata)
    VALUES
      (_action, auth.uid(), TG_TABLE_NAME, _rec_id, _branch,
       jsonb_build_object('old', _old));
    RETURN OLD;
  ELSE
    _action := TG_TABLE_NAME || '.update';
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    -- Compute changed fields only, skipping noisy timestamps
    FOR _key IN SELECT jsonb_object_keys(_new) LOOP
      IF _key IN ('updated_at','created_at') THEN CONTINUE; END IF;
      IF _new->_key IS DISTINCT FROM (_old->_key) THEN
        _diff := _diff || jsonb_build_object(
          _key,
          jsonb_build_object(
            'old', _old->_key,
            'new', _new->_key
          )
        );
      END IF;
    END LOOP;
    IF _diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.security_audit_log
      (action, actor, table_name, record_id, branch_id, metadata)
    VALUES
      (_action, auth.uid(), TG_TABLE_NAME, _rec_id, _branch,
       jsonb_build_object('changes', _diff));
    RETURN NEW;
  END IF;
END $$;

-- 3) Attach triggers to sensitive tables
DO $$
DECLARE
  t text;
  targets text[] := ARRAY[
    'patients','patient_visits','patient_allergies','patient_medications',
    'patient_medical_history','patient_surgeries','patient_attachments',
    'doctors','availability','doctor_leaves','medicine_orders',
    'branches','clinic_settings','user_roles','specialties',
    'faqs','health_articles','health_categories','about_sections'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$s
         AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();',
      t
    );
  END LOOP;
END $$;
