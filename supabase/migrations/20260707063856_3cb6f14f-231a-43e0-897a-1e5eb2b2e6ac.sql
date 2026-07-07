
-- Enums
CREATE TYPE public.gender_type AS ENUM ('male','female','other');
CREATE TYPE public.allergy_severity AS ENUM ('mild','moderate','severe','life_threatening');
CREATE TYPE public.medication_status AS ENUM ('active','paused','stopped','completed');
CREATE TYPE public.medical_history_category AS ENUM ('chronic','past','family','surgical_note');
CREATE TYPE public.medical_history_status AS ENUM ('active','resolved','managed');
CREATE TYPE public.attachment_category AS ENUM ('lab','imaging','report','prescription','insurance','other');

-- MRN counter
CREATE TABLE public.branch_mrn_counter (
  branch_id UUID PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  last_value BIGINT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.branch_mrn_counter TO authenticated;
GRANT ALL ON public.branch_mrn_counter TO service_role;
ALTER TABLE public.branch_mrn_counter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read counter" ON public.branch_mrn_counter FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'doctor'));

CREATE OR REPLACE FUNCTION public.generate_mrn(_branch_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _next BIGINT; _prefix TEXT;
BEGIN
  INSERT INTO public.branch_mrn_counter(branch_id, last_value) VALUES (_branch_id, 1)
  ON CONFLICT (branch_id) DO UPDATE SET last_value = branch_mrn_counter.last_value + 1
  RETURNING last_value INTO _next;
  SELECT COALESCE(UPPER(SUBSTRING(regexp_replace(COALESCE(b.name_en, b.name_ar,'BR'),'[^A-Za-z0-9]','','g') FROM 1 FOR 3)),'BR')
    INTO _prefix FROM public.branches b WHERE b.id = _branch_id;
  RETURN COALESCE(_prefix,'BR') || '-' || LPAD(_next::TEXT,7,'0');
END $$;
REVOKE EXECUTE ON FUNCTION public.generate_mrn(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_mrn(UUID) TO authenticated;

-- patients
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  mrn TEXT NOT NULL,
  profile_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name_ar TEXT NOT NULL,
  full_name_en TEXT,
  national_id TEXT,
  phone TEXT NOT NULL,
  secondary_phone TEXT,
  email TEXT,
  gender public.gender_type,
  date_of_birth DATE,
  blood_type TEXT,
  marital_status TEXT,
  nationality TEXT,
  city TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, mrn)
);
CREATE UNIQUE INDEX patients_branch_national_id_uniq ON public.patients(branch_id, national_id) WHERE national_id IS NOT NULL;
CREATE INDEX patients_branch_idx ON public.patients(branch_id);
CREATE INDEX patients_phone_idx ON public.patients(phone);
CREATE INDEX patients_name_ar_idx ON public.patients(full_name_ar);
CREATE INDEX patients_profile_idx ON public.patients(profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients read staff" ON public.patients FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
   OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'reception'))
  AND public.has_branch_access(auth.uid(), branch_id)
);
CREATE POLICY "patients read own" ON public.patients FOR SELECT TO authenticated
USING (profile_id = auth.uid());
CREATE POLICY "patients insert staff" ON public.patients FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
   OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'reception'))
  AND public.has_branch_access(auth.uid(), branch_id)
);
CREATE POLICY "patients update staff" ON public.patients FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
   OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'reception'))
  AND public.has_branch_access(auth.uid(), branch_id)
);
CREATE POLICY "patients delete admin" ON public.patients FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Access helpers
CREATE OR REPLACE FUNCTION public.can_access_patient(_patient_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id
      AND (
        p.profile_id = auth.uid()
        OR (
          (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
            OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'reception'))
          AND public.has_branch_access(auth.uid(), p.branch_id)
        )
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_patient(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_patient(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_write_patient_clinical(_patient_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id
      AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'doctor'))
      AND public.has_branch_access(auth.uid(), p.branch_id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_write_patient_clinical(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_patient_clinical(UUID) TO authenticated;

-- allergies
CREATE TABLE public.patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  allergen TEXT NOT NULL,
  reaction TEXT,
  severity public.allergy_severity NOT NULL DEFAULT 'mild',
  noted_on DATE,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patient_allergies_patient_idx ON public.patient_allergies(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_allergies TO authenticated;
GRANT ALL ON public.patient_allergies TO service_role;
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allergies read" ON public.patient_allergies FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY "allergies ins" ON public.patient_allergies FOR INSERT TO authenticated WITH CHECK (public.can_write_patient_clinical(patient_id));
CREATE POLICY "allergies upd" ON public.patient_allergies FOR UPDATE TO authenticated USING (public.can_write_patient_clinical(patient_id));
CREATE POLICY "allergies del" ON public.patient_allergies FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'doctor'));
CREATE TRIGGER trg_allergies_updated_at BEFORE UPDATE ON public.patient_allergies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- medications
CREATE TABLE public.patient_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT, frequency TEXT, route TEXT,
  start_date DATE, end_date DATE,
  status public.medication_status NOT NULL DEFAULT 'active',
  prescribed_by_name TEXT, notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patient_medications_patient_idx ON public.patient_medications(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_medications TO authenticated;
GRANT ALL ON public.patient_medications TO service_role;
ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meds read" ON public.patient_medications FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY "meds ins" ON public.patient_medications FOR INSERT TO authenticated WITH CHECK (public.can_write_patient_clinical(patient_id));
CREATE POLICY "meds upd" ON public.patient_medications FOR UPDATE TO authenticated USING (public.can_write_patient_clinical(patient_id));
CREATE POLICY "meds del" ON public.patient_medications FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'doctor'));
CREATE TRIGGER trg_meds_updated_at BEFORE UPDATE ON public.patient_medications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- history
CREATE TABLE public.patient_medical_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  condition TEXT NOT NULL,
  category public.medical_history_category NOT NULL DEFAULT 'past',
  onset_date DATE, resolution_date DATE,
  status public.medical_history_status NOT NULL DEFAULT 'active',
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patient_history_patient_idx ON public.patient_medical_history(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_medical_history TO authenticated;
GRANT ALL ON public.patient_medical_history TO service_role;
ALTER TABLE public.patient_medical_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist read" ON public.patient_medical_history FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY "hist ins" ON public.patient_medical_history FOR INSERT TO authenticated WITH CHECK (public.can_write_patient_clinical(patient_id));
CREATE POLICY "hist upd" ON public.patient_medical_history FOR UPDATE TO authenticated USING (public.can_write_patient_clinical(patient_id));
CREATE POLICY "hist del" ON public.patient_medical_history FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'doctor'));
CREATE TRIGGER trg_hist_updated_at BEFORE UPDATE ON public.patient_medical_history FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- surgeries
CREATE TABLE public.patient_surgeries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  procedure_name TEXT NOT NULL,
  surgery_date DATE,
  hospital TEXT, surgeon_name TEXT,
  outcome TEXT, complications TEXT, notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patient_surg_patient_idx ON public.patient_surgeries(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_surgeries TO authenticated;
GRANT ALL ON public.patient_surgeries TO service_role;
ALTER TABLE public.patient_surgeries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "surg read" ON public.patient_surgeries FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY "surg ins" ON public.patient_surgeries FOR INSERT TO authenticated WITH CHECK (public.can_write_patient_clinical(patient_id));
CREATE POLICY "surg upd" ON public.patient_surgeries FOR UPDATE TO authenticated USING (public.can_write_patient_clinical(patient_id));
CREATE POLICY "surg del" ON public.patient_surgeries FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'doctor'));
CREATE TRIGGER trg_surg_updated_at BEFORE UPDATE ON public.patient_surgeries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- visits
CREATE TABLE public.patient_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  visit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  chief_complaint TEXT,
  subjective TEXT, objective TEXT, assessment TEXT, plan TEXT,
  vitals JSONB DEFAULT '{}'::jsonb,
  follow_up_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patient_visits_patient_idx ON public.patient_visits(patient_id, visit_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_visits TO authenticated;
GRANT ALL ON public.patient_visits TO service_role;
ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visits read" ON public.patient_visits FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY "visits ins" ON public.patient_visits FOR INSERT TO authenticated WITH CHECK (public.can_write_patient_clinical(patient_id));
CREATE POLICY "visits upd" ON public.patient_visits FOR UPDATE TO authenticated USING (public.can_write_patient_clinical(patient_id));
CREATE POLICY "visits del" ON public.patient_visits FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'doctor'));
CREATE TRIGGER trg_visits_updated_at BEFORE UPDATE ON public.patient_visits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- attachments
CREATE TABLE public.patient_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category public.attachment_category NOT NULL DEFAULT 'other',
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patient_attach_patient_idx ON public.patient_attachments(patient_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_attachments TO authenticated;
GRANT ALL ON public.patient_attachments TO service_role;
ALTER TABLE public.patient_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attach read" ON public.patient_attachments FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY "attach ins" ON public.patient_attachments FOR INSERT TO authenticated WITH CHECK (public.can_write_patient_clinical(patient_id));
CREATE POLICY "attach upd" ON public.patient_attachments FOR UPDATE TO authenticated USING (public.can_write_patient_clinical(patient_id));
CREATE POLICY "attach del" ON public.patient_attachments FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'doctor'));
CREATE TRIGGER trg_attach_updated_at BEFORE UPDATE ON public.patient_attachments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link appointments to patients
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS appointments_patient_id_idx ON public.appointments(patient_id);

-- Storage policies for patient-files bucket
CREATE POLICY "patient files read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'patient-files' AND public.can_access_patient(((string_to_array(name,'/'))[1])::uuid));
CREATE POLICY "patient files insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'patient-files' AND public.can_write_patient_clinical(((string_to_array(name,'/'))[1])::uuid));
CREATE POLICY "patient files update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'patient-files' AND public.can_write_patient_clinical(((string_to_array(name,'/'))[1])::uuid));
CREATE POLICY "patient files delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'patient-files'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'doctor'))
  AND public.can_access_patient(((string_to_array(name,'/'))[1])::uuid)
);
