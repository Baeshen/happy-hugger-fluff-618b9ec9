
-- ============ Helper: updated_at trigger (reuse if exists) ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ prescriptions ============
CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  medication text NOT NULL,
  dosage text,
  instructions text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  refills_remaining integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patients read own prescriptions" ON public.prescriptions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.patients p WHERE p.id = prescriptions.patient_id AND p.profile_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );
CREATE POLICY "Admins manage prescriptions" ON public.prescriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor'));
CREATE INDEX idx_prescriptions_patient ON public.prescriptions(patient_id, status);
CREATE TRIGGER tg_prescriptions_updated BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ lab_reports ============
CREATE TABLE public.lab_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title text NOT NULL,
  test_type text,
  ordered_by uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  file_path text,
  summary text,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('pending','ready','revised')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lab_reports TO authenticated;
GRANT ALL ON public.lab_reports TO service_role;
ALTER TABLE public.lab_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patients read own labs" ON public.lab_reports
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.patients p WHERE p.id = lab_reports.patient_id AND p.profile_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );
CREATE POLICY "Admins manage labs" ON public.lab_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor'));
CREATE INDEX idx_lab_reports_patient ON public.lab_reports(patient_id, report_date DESC);
CREATE TRIGGER tg_labs_updated BEFORE UPDATE ON public.lab_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ radiology_reports ============
CREATE TABLE public.radiology_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  modality text NOT NULL,
  body_part text,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  findings text,
  file_path text,
  ordered_by uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('pending','ready','revised')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.radiology_reports TO authenticated;
GRANT ALL ON public.radiology_reports TO service_role;
ALTER TABLE public.radiology_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patients read own radiology" ON public.radiology_reports
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.patients p WHERE p.id = radiology_reports.patient_id AND p.profile_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );
CREATE POLICY "Admins manage radiology" ON public.radiology_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor'));
CREATE INDEX idx_radiology_patient ON public.radiology_reports(patient_id, report_date DESC);
CREATE TRIGGER tg_radiology_updated BEFORE UPDATE ON public.radiology_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ invoices ============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  invoice_number text UNIQUE,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','partially_paid','cancelled','refunded')),
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  paid_at timestamptz,
  pdf_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patients read own invoices" ON public.invoices
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.patients p WHERE p.id = invoices.patient_id AND p.profile_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Admins manage invoices" ON public.invoices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_invoices_patient ON public.invoices(patient_id, issued_at DESC);
CREATE TRIGGER tg_invoices_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ second_opinion_requests ============
CREATE TABLE public.second_opinion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL,
  phone text NOT NULL,
  email text,
  specialty text NOT NULL,
  summary text NOT NULL,
  upload_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','answered','closed')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.second_opinion_requests TO authenticated;
GRANT INSERT ON public.second_opinion_requests TO anon;
GRANT ALL ON public.second_opinion_requests TO service_role;
ALTER TABLE public.second_opinion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit second opinion" ON public.second_opinion_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read second opinion" ON public.second_opinion_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update second opinion" ON public.second_opinion_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete second opinion" ON public.second_opinion_requests
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER tg_sor_updated BEFORE UPDATE ON public.second_opinion_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ patient_stories ============
CREATE TABLE public.patient_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title_ar text NOT NULL,
  title_en text,
  excerpt text,
  body_md text,
  hero_image_url text,
  specialty text,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  published_at timestamptz,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.patient_stories TO anon, authenticated;
GRANT ALL ON public.patient_stories TO service_role;
ALTER TABLE public.patient_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published stories" ON public.patient_stories
  FOR SELECT TO anon, authenticated USING (published_at IS NOT NULL AND published_at <= now());
CREATE POLICY "Admins read all stories" ON public.patient_stories
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage stories" ON public.patient_stories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_stories_published ON public.patient_stories(published_at DESC) WHERE published_at IS NOT NULL;
CREATE TRIGGER tg_stories_updated BEFORE UPDATE ON public.patient_stories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ corporate_requests ============
CREATE TABLE public.corporate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  email text,
  employee_count integer,
  service_type text,
  notes text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','signed','declined','closed')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corporate_requests TO authenticated;
GRANT INSERT ON public.corporate_requests TO anon;
GRANT ALL ON public.corporate_requests TO service_role;
ALTER TABLE public.corporate_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit corporate request" ON public.corporate_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read corporate requests" ON public.corporate_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update corporate requests" ON public.corporate_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete corporate requests" ON public.corporate_requests
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER tg_corp_updated BEFORE UPDATE ON public.corporate_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
