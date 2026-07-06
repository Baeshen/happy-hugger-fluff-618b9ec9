
CREATE TYPE public.app_role AS ENUM ('admin', 'reception', 'pharmacy');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT, phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "admins view profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.specialties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  icon TEXT, description_ar TEXT, description_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.specialties TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.specialties TO authenticated;
GRANT ALL ON public.specialties TO service_role;
ALTER TABLE public.specialties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active specialties" ON public.specialties FOR SELECT TO anon, authenticated
USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage specialties" ON public.specialties FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty_id UUID REFERENCES public.specialties(id) ON DELETE SET NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  title_ar TEXT, title_en TEXT,
  photo_url TEXT, bio_ar TEXT, bio_en TEXT,
  languages TEXT[] DEFAULT ARRAY['ar','en']::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.doctors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.doctors TO authenticated;
GRANT ALL ON public.doctors TO service_role;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active doctors" ON public.doctors FOR SELECT TO anon, authenticated
USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage doctors" ON public.doctors FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_minutes INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.availability TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read availability" ON public.availability FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "staff manage availability" ON public.availability FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reception'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reception'));

CREATE TYPE public.appointment_status AS ENUM ('new','confirmed','completed','cancelled','no_show');
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL, patient_phone TEXT NOT NULL,
  national_id TEXT, gender TEXT,
  specialty_id UUID REFERENCES public.specialties(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL, appointment_time TIME NOT NULL,
  reason TEXT, status public.appointment_status NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT INSERT ON public.appointments TO anon;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone create appointments" ON public.appointments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "staff read appointments" ON public.appointments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reception'));
CREATE POLICY "staff update appointments" ON public.appointments FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reception'));
CREATE POLICY "admins delete appointments" ON public.appointments FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TYPE public.delivery_type AS ENUM ('pickup','delivery');
CREATE TYPE public.medicine_order_status AS ENUM ('new','preparing','ready','out_for_delivery','delivered','cancelled');
CREATE TABLE public.medicine_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL, patient_phone TEXT NOT NULL,
  address TEXT, district TEXT,
  prescription_image_url TEXT, items_text TEXT,
  delivery_type public.delivery_type NOT NULL DEFAULT 'delivery',
  notes TEXT, status public.medicine_order_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicine_orders TO authenticated;
GRANT INSERT ON public.medicine_orders TO anon;
GRANT ALL ON public.medicine_orders TO service_role;
ALTER TABLE public.medicine_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone create med orders" ON public.medicine_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "staff read med orders" ON public.medicine_orders FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacy'));
CREATE POLICY "staff update med orders" ON public.medicine_orders FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacy'));
CREATE POLICY "admins delete med orders" ON public.medicine_orders FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_medicine_orders_updated BEFORE UPDATE ON public.medicine_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed specialties
INSERT INTO public.specialties (slug, name_ar, name_en, icon, description_ar, description_en, sort_order) VALUES
('internal-medicine','الباطنة','Internal Medicine','stethoscope','تشخيص وعلاج أمراض البالغين','Diagnosis and treatment of adult diseases',1),
('surgery','الجراحة','Surgery','scissors','الجراحة العامة والتخصصية','General and specialized surgery',2),
('obgyn','النساء والولادة','Obstetrics & Gynecology','baby','رعاية صحة المرأة والحمل والولادة','Women health, pregnancy and delivery',3),
('pediatrics','الأطفال','Pediatrics','baby','رعاية صحة الأطفال والرضع','Care for infants and children',4),
('dentistry','الأسنان','Dentistry','smile','طب وجراحة الأسنان','Dental care and oral surgery',5),
('ophthalmology','العيون','Ophthalmology','eye','فحص وعلاج أمراض العيون','Eye examination and treatment',6),
('ent','الأنف والأذن والحنجرة','ENT','ear','أمراض الأنف والأذن والحنجرة','Ear, nose and throat',7),
('psychiatry','الطب النفسي','Psychiatry','brain','الصحة النفسية والعلاج السلوكي','Mental health and behavioral therapy',8),
('physiotherapy','العلاج الطبيعي','Physiotherapy','activity','إعادة التأهيل والعلاج الحركي','Rehabilitation and physical therapy',9),
('emergency','الطوارئ','Emergency','ambulance','خدمات الطوارئ على مدار الساعة','24/7 emergency services',10),
('radiology','الأشعة','Radiology','scan','خدمات التصوير والأشعة التشخيصية','Diagnostic imaging services',11),
('lab','المختبر','Laboratory','flask-conical','التحاليل الطبية الشاملة','Comprehensive laboratory tests',12),
('nutrition','التغذية العلاجية','Nutrition','apple','استشارات وخطط التغذية العلاجية','Nutrition counseling and plans',13),
('pharmacy','الصيدلية','Pharmacy','pill','صيدليات باعشن وخدمة توصيل الأدوية','Baeshen Pharmacies and medicine delivery',14);

INSERT INTO public.doctors (specialty_id, name_ar, name_en, title_ar, title_en, bio_ar, bio_en, sort_order)
SELECT id,'د. أحمد الشرابي','Dr. Ahmed Al-Sharabi','استشاري باطنة','Internal Medicine Consultant',
'استشاري باطنة عامة مع خبرة تزيد عن 15 عامًا.','Consultant with 15+ years experience.',1
FROM public.specialties WHERE slug='internal-medicine';

INSERT INTO public.doctors (specialty_id, name_ar, name_en, title_ar, title_en, bio_ar, bio_en, sort_order)
SELECT id,'د. سارة القحطاني','Dr. Sarah Al-Qahtani','أخصائية نساء وولادة','OB/GYN Specialist',
'متخصصة في متابعة الحمل والولادة.','Pregnancy and delivery specialist.',1
FROM public.specialties WHERE slug='obgyn';

INSERT INTO public.doctors (specialty_id, name_ar, name_en, title_ar, title_en, bio_ar, bio_en, sort_order)
SELECT id,'د. خالد الحربي','Dr. Khalid Al-Harbi','أخصائي أطفال','Pediatrics Specialist',
'رعاية الرضع والأطفال والتطعيمات.','Care for infants and children.',1
FROM public.specialties WHERE slug='pediatrics';

INSERT INTO public.doctors (specialty_id, name_ar, name_en, title_ar, title_en, bio_ar, bio_en, sort_order)
SELECT id,'د. منى العسيري','Dr. Mona Al-Asiri','أخصائية أسنان','Dental Specialist',
'علاج وتجميل الأسنان.','Dental care and aesthetics.',1
FROM public.specialties WHERE slug='dentistry';

INSERT INTO public.doctors (specialty_id, name_ar, name_en, title_ar, title_en, bio_ar, bio_en, sort_order)
SELECT id,'د. عبدالله باعشن','Dr. Abdullah Baeshen','استشاري جراحة عامة','General Surgery Consultant',
'استشاري جراحة عامة ومناظير.','Consultant in general and laparoscopic surgery.',1
FROM public.specialties WHERE slug='surgery';

INSERT INTO public.availability (doctor_id, weekday, start_time, end_time, slot_minutes)
SELECT d.id, wd, '09:00'::time, '17:00'::time, 30
FROM public.doctors d CROSS JOIN unnest(ARRAY[6,0,1,2,3]::smallint[]) wd;

INSERT INTO public.availability (doctor_id, weekday, start_time, end_time, slot_minutes)
SELECT d.id, 4::smallint, '09:00'::time, '13:00'::time, 30
FROM public.doctors d;
