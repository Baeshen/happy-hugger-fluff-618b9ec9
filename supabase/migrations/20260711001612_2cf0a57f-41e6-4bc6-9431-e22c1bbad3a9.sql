
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.accreditations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar text NOT NULL,
  title_en text NOT NULL,
  description_ar text,
  description_en text,
  image_url text,
  year int,
  category text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.accreditations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accreditations TO authenticated;
GRANT ALL ON public.accreditations TO service_role;

ALTER TABLE public.accreditations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accreditations_public_read"
  ON public.accreditations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "accreditations_admin_write"
  ON public.accreditations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_accreditations_updated
  BEFORE UPDATE ON public.accreditations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.accreditations (title_ar, title_en, category, year, sort_order) VALUES
  ('اعتماد المركز السعودي لاعتماد المنشآت الصحية (CBAHI)', 'CBAHI Accreditation', 'اعتماد وطني', 2024, 1),
  ('اعتماد المجلس الاسترالي لمعايير الرعاية الصحية (ACHSI)', 'ACHSI International Accreditation', 'اعتماد دولي', 2023, 2),
  ('الجمعية الأمريكية لنظم إدارة معلومات الرعاية الصحية (HIMSS)', 'HIMSS Analytics', 'اعتماد رقمي', 2023, 3),
  ('اعتماد كلية علماء الأمراض الأمريكية (CAP)', 'College of American Pathologists', 'مختبرات', 2022, 4),
  ('شهادة ISO 9001 لإدارة الجودة', 'ISO 9001 Quality Management', 'جودة', 2022, 5),
  ('شهادة ISO 14001 لإدارة البيئة', 'ISO 14001 Environmental', 'بيئة', 2022, 6);

CREATE OR REPLACE FUNCTION public.specialty_doctor_counts()
RETURNS TABLE(specialty_id uuid, doctor_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT specialty_id, count(*)::bigint
  FROM public.doctors
  WHERE is_active = true AND specialty_id IS NOT NULL
  GROUP BY specialty_id;
$$;

GRANT EXECUTE ON FUNCTION public.specialty_doctor_counts() TO anon, authenticated;
