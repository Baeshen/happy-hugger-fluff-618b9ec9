
-- Categories
CREATE TABLE public.health_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  description_en text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.health_categories TO anon, authenticated;
GRANT ALL ON public.health_categories TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.health_categories TO authenticated;

ALTER TABLE public.health_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_categories public read"
  ON public.health_categories FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "health_categories admin write"
  ON public.health_categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_health_categories_updated_at
  BEFORE UPDATE ON public.health_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Articles
CREATE TABLE public.health_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  category_id uuid REFERENCES public.health_categories(id) ON DELETE SET NULL,
  title_ar text NOT NULL,
  title_en text,
  excerpt_ar text NOT NULL,
  excerpt_en text,
  content_ar text NOT NULL,
  content_en text,
  cover_image_url text,
  keywords text[] NOT NULL DEFAULT '{}',
  season text CHECK (season IN ('spring','summer','autumn','winter','all')) DEFAULT 'all',
  reading_minutes int NOT NULL DEFAULT 3,
  author_name text DEFAULT 'فريق مجمع باعشن الطبي',
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.health_articles TO anon, authenticated;
GRANT ALL ON public.health_articles TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.health_articles TO authenticated;

ALTER TABLE public.health_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_articles public read published"
  ON public.health_articles FOR SELECT
  USING (is_published = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "health_articles admin write"
  ON public.health_articles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_health_articles_updated_at
  BEFORE UPDATE ON public.health_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_health_articles_published ON public.health_articles(is_published, published_at DESC);
CREATE INDEX idx_health_articles_category ON public.health_articles(category_id);
CREATE INDEX idx_health_articles_season ON public.health_articles(season);

-- Seed categories
INSERT INTO public.health_categories (slug, name_ar, name_en, description_ar, description_en, sort_order) VALUES
  ('prevention', 'الوقاية', 'Prevention', 'نصائح وقائية للحفاظ على صحتك', 'Preventive tips to maintain your health', 1),
  ('nutrition', 'التغذية', 'Nutrition', 'أساسيات التغذية الصحية', 'Healthy nutrition essentials', 2),
  ('child-health', 'صحة الطفل', 'Child Health', 'دليل الأمهات والآباء في رعاية أطفالهم', 'Guide for parents in caring for their children', 3),
  ('seasonal-diseases', 'الأمراض الموسمية', 'Seasonal Diseases', 'الأمراض الشائعة حسب المواسم وكيفية التعامل معها', 'Common seasonal illnesses and how to handle them', 4);

-- Seed articles
INSERT INTO public.health_articles (slug, category_id, title_ar, excerpt_ar, content_ar, keywords, season, reading_minutes, is_published, published_at) VALUES
  (
    'summer-heatstroke-prevention',
    (SELECT id FROM public.health_categories WHERE slug='seasonal-diseases'),
    'كيف تحمي عائلتك من ضربة الشمس في صيف جازان',
    'دليل عملي لتجنب ضربات الشمس والإجهاد الحراري خلال أشهر الصيف الحارة في منطقة جازان.',
    E'## ما هي ضربة الشمس؟\n\nضربة الشمس حالة طارئة تحدث عندما ترتفع درجة حرارة الجسم فوق 40°م بسبب التعرض المطوّل للحرارة.\n\n## الأعراض\n\n- ارتفاع درجة الحرارة\n- احمرار الجلد وجفافه\n- صداع شديد ودوخة\n- تسارع النبض\n- غثيان وقيء\n\n## الوقاية\n\n1. **اشرب الماء بانتظام** — 2-3 لتر يومياً\n2. **تجنّب الخروج بين 11ص و4م**\n3. **ارتدِ ملابس فاتحة وفضفاضة**\n4. **استخدم واقي الشمس SPF 30+**\n\n## متى تزور الطوارئ؟\n\nإذا فقد المصاب وعيه أو تجاوزت حرارته 39°م، توجه فوراً إلى قسم الطوارئ في [مجمع باعشن الطبي](/contact).',
    ARRAY['ضربة الشمس','صيف جازان','الإجهاد الحراري','الوقاية من الحر'],
    'summer', 4, true, now()
  ),
  (
    'winter-flu-vaccination',
    (SELECT id FROM public.health_categories WHERE slug='prevention'),
    'تطعيم الإنفلونزا الموسمية: من يحتاجه ومتى؟',
    'كل ما تريد معرفته عن لقاح الإنفلونزا الموسمية وأهميته لك ولعائلتك قبل حلول الشتاء.',
    E'## لماذا التطعيم مهم؟\n\nيقلل لقاح الإنفلونزا خطر الإصابة بنسبة 40-60% ويحمي كبار السن والأطفال والحوامل من مضاعفات خطيرة.\n\n## أفضل وقت للتطعيم\n\nيُفضّل التطعيم في أكتوبر ونوفمبر قبل موسم الذروة (ديسمبر - فبراير).\n\n## من يحتاج اللقاح؟\n\n- الأطفال من عمر 6 أشهر\n- كبار السن (65+)\n- الحوامل\n- مرضى السكري والربو وأمراض القلب\n- العاملون في القطاع الصحي\n\n## هل توجد آثار جانبية؟\n\nعادة تكون خفيفة: ألم مكان الحقنة أو حرارة بسيطة لمدة يوم.\n\nاحجز موعد تطعيمك الآن عبر [صفحة الحجز](/book).',
    ARRAY['لقاح الإنفلونزا','التطعيم الموسمي','الوقاية','الشتاء'],
    'winter', 3, true, now()
  ),
  (
    'child-nutrition-back-to-school',
    (SELECT id FROM public.health_categories WHERE slug='child-health'),
    'وجبات مدرسية صحية: دليل الأم للعودة إلى المدارس',
    'أفكار عملية لإعداد وجبات مدرسية متوازنة تمد طفلك بالطاقة والتركيز طوال اليوم الدراسي.',
    E'## أساسيات الوجبة المدرسية المتوازنة\n\nيجب أن تحتوي الوجبة على:\n\n- **بروتين**: بيض، جبن، دجاج مشوي\n- **كربوهيدرات**: خبز بر، شوفان، بطاطا\n- **خضروات وفواكه** طازجة\n- **سوائل**: ماء، لبن، عصير طبيعي\n\n## أفكار سريعة\n\n1. سندويش زبدة الفول السوداني مع الموز\n2. شرائح تفاح مع جبن قريش\n3. لفائف تورتيا بالدجاج والخضار\n4. زبادي مع عسل وشوفان\n\n## تجنّب هذه الأطعمة\n\n- المشروبات الغازية والعصائر المصنعة\n- الحلويات والشوكولاتة اليومية\n- الشيبس والوجبات السريعة\n\nلاستشارة اختصاصي تغذية أطفال، زر [قسم أطباء الأطفال](/specialties).',
    ARRAY['تغذية الأطفال','وجبات مدرسية','صحة الطفل','العودة للمدارس'],
    'autumn', 4, true, now()
  );
