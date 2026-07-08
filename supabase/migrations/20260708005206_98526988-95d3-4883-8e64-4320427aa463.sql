
-- 1) Owner read: signed-in user sees appointments matching their profile phone
CREATE OR REPLACE FUNCTION public._appointment_belongs_to_me(_phone text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.phone IS NOT NULL
      AND regexp_replace(p.phone, '\D', '', 'g') = regexp_replace(_phone, '\D', '', 'g')
  );
$$;

DROP POLICY IF EXISTS "users read own appointments" ON public.appointments;
CREATE POLICY "users read own appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (public._appointment_belongs_to_me(patient_phone));

-- 2) Owner cancel: user can only flip status to 'cancelled' on their own upcoming appts.
--    Immutable fields are protected by comparing NEW to OLD via a trigger below.
DROP POLICY IF EXISTS "users cancel own appointments" ON public.appointments;
CREATE POLICY "users cancel own appointments"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (
    public._appointment_belongs_to_me(patient_phone)
    AND status IN ('new','confirmed')
    AND appointment_date >= CURRENT_DATE
  )
  WITH CHECK (
    public._appointment_belongs_to_me(patient_phone)
    AND status = 'cancelled'
  );

CREATE OR REPLACE FUNCTION public._enforce_owner_cancel_only()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Staff bypass: they have their own policies + audit trail.
  IF public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'super_admin')
     OR public.has_role(auth.uid(),'reception') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND public._appointment_belongs_to_me(OLD.patient_phone) THEN
    -- Owner may ONLY change status new/confirmed -> cancelled.
    IF NEW.patient_name        IS DISTINCT FROM OLD.patient_name
       OR NEW.patient_phone    IS DISTINCT FROM OLD.patient_phone
       OR NEW.national_id      IS DISTINCT FROM OLD.national_id
       OR NEW.gender           IS DISTINCT FROM OLD.gender
       OR NEW.specialty_id     IS DISTINCT FROM OLD.specialty_id
       OR NEW.doctor_id        IS DISTINCT FROM OLD.doctor_id
       OR NEW.branch_id        IS DISTINCT FROM OLD.branch_id
       OR NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
       OR NEW.appointment_time IS DISTINCT FROM OLD.appointment_time
       OR NEW.reason           IS DISTINCT FROM OLD.reason
       OR NEW.notes            IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'يمكن للمريض إلغاء الموعد فقط، دون تعديل بياناته'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointments_owner_cancel_only ON public.appointments;
CREATE TRIGGER trg_appointments_owner_cancel_only
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public._enforce_owner_cancel_only();

-- 3) Performance indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_appointments_branch_date
  ON public.appointments(branch_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_phone
  ON public.appointments((regexp_replace(patient_phone,'\D','','g')));
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date
  ON public.appointments(doctor_id, appointment_date, appointment_time);
