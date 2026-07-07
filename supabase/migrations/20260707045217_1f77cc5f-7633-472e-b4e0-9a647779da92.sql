
-- ============ FAQs ============
CREATE TABLE public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_ar text NOT NULL,
  question_en text,
  answer_ar text NOT NULL,
  answer_en text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.faqs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT ALL ON public.faqs TO service_role;

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active faqs"
  ON public.faqs FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage faqs"
  ON public.faqs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_faqs_updated_at
  BEFORE UPDATE ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ About sections ============
CREATE TABLE public.about_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  title_ar text,
  title_en text,
  body_ar text,
  body_en text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.about_sections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.about_sections TO authenticated;
GRANT ALL ON public.about_sections TO service_role;

ALTER TABLE public.about_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active about sections"
  ON public.about_sections FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage about sections"
  ON public.about_sections FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_about_sections_updated_at
  BEFORE UPDATE ON public.about_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Seed FAQs (current hard-coded content) ============
INSERT INTO public.faqs (question_ar, question_en, answer_ar, answer_en, sort_order) VALUES
  ('كيف أحجز موعدًا؟',
   'How do I book an appointment?',
   'من صفحة «احجز موعدًا»، اختر التخصص ثم الطبيب ثم التاريخ والوقت، وأكمل بياناتك. سيتواصل معك فريقنا للتأكيد.',
   'Go to Book Appointment, choose the specialty, doctor, date and time, then submit your details. Our team will confirm.',
   10),
  ('هل الخدمة متاحة للجميع؟',
   'Do I need an account?',
   'نعم، يمكن لأي مريض حجز موعد أو طلب دواء دون الحاجة لإنشاء حساب.',
   'No, any patient can book an appointment or request medicine without signing up.',
   20),
  ('هل يمكنني طلب دواء بدون وصفة؟',
   'Can I order medicine without a prescription?',
   'بعض الأدوية تحتاج وصفة نظامية. أرفق صورة الوصفة إن وُجدت، وسيتواصل معك الصيدلي للتأكيد.',
   'Some medicines require a valid prescription. Upload a photo if available and the pharmacist will confirm.',
   30),
  ('ما هي مناطق التوصيل؟',
   'What areas do you deliver to?',
   'نوصل الأدوية داخل مدينة صبيا. يرجى إدخال الحي والعنوان بدقة.',
   'We deliver within Sabya city. Please provide the district and full address.',
   40),
  ('ما هي ساعات العمل؟',
   'What are the working hours?',
   'السبت – الأربعاء: 9 صباحًا – 9 مساءً | الخميس: 9 صباحًا – 1 ظهرًا. الطوارئ على مدار الساعة.',
   'Sat – Wed: 9am – 9pm | Thu: 9am – 1pm. Emergency 24/7.',
   50);

-- ============ Seed About sections (current hard-coded content) ============
INSERT INTO public.about_sections (section_key, title_ar, title_en, body_ar, body_en, sort_order) VALUES
  ('hero_subtitle',
   NULL, NULL,
   'منشأة صحية خاصة معتمدة من هيئة CBAHI تقدم خدمات طبية عامة وتخصصية تحت سقف واحد.',
   'A CBAHI-accredited private healthcare facility offering general and specialty medical services under one roof.',
   0),
  ('paragraph_location',
   'موقعنا', 'Our location',
   'يقع مجمع باعشن الطبي في محافظة صبيا بمنطقة جازان، تحديدًا على طريق الملك عبدالعزيز في حي الظبية. يضم المجمع صيدلية داخلية (صيدليات باعشن) لخدمة المراجعين.',
   'Baeshen Medical Complex is located in Sabya, Jazan region, on King Abdulaziz Road in Al-Dhabya. It houses an in-house pharmacy (Baeshen Pharmacies) serving our patients.',
   10),
  ('paragraph_quality',
   'التزامنا بالجودة', 'Our commitment to quality',
   'نلتزم بأعلى معايير الجودة والسلامة، ونعمل مع نخبة من الاستشاريين والأخصائيين لتقديم رعاية شاملة للمرضى وعائلاتهم.',
   'We commit to the highest standards of quality and safety, working with leading consultants and specialists to provide comprehensive care to patients and their families.',
   20);
