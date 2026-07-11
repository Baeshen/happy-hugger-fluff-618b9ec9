
## فحص موقع الأطباء المتحدون (udh.sa)

### الأقسام الرئيسية المرصودة
1. **الواجهة (Hero متعدد الشرائح)**: ترحيب + فريق طبي + رعاية منزلية + حجز سريع.
2. **عن المستشفى**: رسالة/رؤية + رقم خدمة العملاء بارز.
3. **التخصصات الطبية**: بطاقات موحدة (أيقونة + وصف + عدد الأطباء) — 12+ تخصص.
4. **الكادر الطبي**: شبكة أطباء بالصور + رابط الملف الشخصي `?doctor=CODE`.
5. **لماذا تختارنا؟**: 3 مزايا (خبرة، تجربة المريض، شمولية).
6. **تطبيق الجوال**: مع عداد "+30,000 مستخدم" وروابط App Store / Google Play.
7. **الاعتمادات والجوائز**: كاروسيل شهادات (JCI/ACHSI/CBAHI/HIMSS/CAP/AABB/ISO/SA8000…).
8. **الخدمات المرتبطة (Sub-brands)**: الرعاية المنزلية (enaya.med.sa) + بوابة الحجز (eservices).
9. **قنوات تواصل مباشرة**: هاتف وواتساب موحّدان في كل الصفحة.

### الفجوات مقارنة بموقع باعشن الحالي
| ما لدى UDH | حالتنا في باعشن |
|---|---|
| بطاقة تخصص = أيقونة + وصف + **عدد الأطباء** | لدينا التخصصات لكن دون عدّاد الأطباء |
| صفحة **الاعتمادات والجوائز** مستقلة `/accreditations` | غير موجودة |
| كاروسيل جوائز في الصفحة الرئيسية | غير موجود |
| قسم "لماذا تختارنا" ببطاقات صور | غير موجود بشكل بصري |
| Sub-brand مستقل للرعاية المنزلية | لدينا `/home-care` كصفحة فقط |
| كاروسيل هيرو متعدد الشرائح | لدينا هيرو واحد |
| عداد إحصائي (مستخدمين/مرضى/سنوات) | غير موجود |

---

## خطة التطوير

### 1) صفحة الاعتمادات والجوائز `/accreditations` (جديدة)
- جدول Supabase `accreditations` (title_ar/en, image, year, category, description, sort).
- Server function `listAccreditations` + صفحة عرض بشبكة + Modal تفاصيل.
- إضافة الرابط في الفوتر و "عن المستشفى".

### 2) قسم الجوائز في الصفحة الرئيسية
- كاروسيل شعارات/جوائز مع Marquee بطيء (بدون auto-play مزعج).
- CTA "عرض جميع الاعتمادات" → `/accreditations`.

### 3) تحسين بطاقات التخصصات
- إضافة حقل `doctor_count` (يُحسب من جدول doctors عبر view أو RPC).
- تعديل `src/routes/specialties.index.tsx` لعرض العدد على البطاقة "X+ طبيب".

### 4) قسم "لماذا تختارنا؟" في الصفحة الرئيسية
- 4 بطاقات بصور خلفية + عنوان + وصف قصير (خبرة معتمدة، رعاية تتمحور حول المريض، خدمات شاملة، تقنية متقدمة).
- ثابت (بدون DB) في `src/routes/index.tsx`.

### 5) شريط إحصاءات (Stats Bar)
- 4 أرقام: سنوات خبرة، عدد الأطباء، عدد المرضى شهرياً، عدد التخصصات.
- Counter animation عند الظهور. مصدر الأرقام: `clinic_settings` (حقول جديدة اختيارية) أو ثوابت في `SITE`.

### 6) هيرو متعدد الشرائح في الصفحة الرئيسية
- Slider بـ 3 شرائح (ترحيب، فريق طبي، رعاية منزلية) مع مؤشرات وأسهم RTL.
- استخدام مكوّن موجود أو Embla carousel (مثبت مسبقاً).

### 7) قسم "التطبيق الرسمي" في الصفحة الرئيسية
- Banner مختصر يربط بصفحة `/app` مع شارتَي المتجرين + عداد مستخدمين.

### 8) بطاقة WhatsApp عائمة موحّدة
- زر واتساب ثابت في الزاوية على كل الصفحات (يستخدم `SITE.whatsapp`).
- إضافة إلى `ChatbotBubble` الحالي أو مكوّن منفصل `WhatsAppFab`.

---

## التفاصيل التقنية

**قاعدة البيانات (Migration جديدة):**
```sql
CREATE TABLE public.accreditations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar text NOT NULL, title_en text NOT NULL,
  description_ar text, description_en text,
  image_url text, year int, category text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.accreditations TO anon, authenticated;
GRANT ALL ON public.accreditations TO service_role;
ALTER TABLE public.accreditations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON public.accreditations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin write" ON public.accreditations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

**RPC لعدّ الأطباء لكل تخصص:**
```sql
CREATE OR REPLACE FUNCTION public.specialty_doctor_counts()
RETURNS TABLE(specialty_id uuid, doctor_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT specialty_id, count(*) FROM doctors WHERE is_active = true GROUP BY specialty_id;
$$;
GRANT EXECUTE ON FUNCTION public.specialty_doctor_counts() TO anon, authenticated;
```

**الملفات الجديدة/المعدّلة:**
- `supabase/migrations/…_accreditations.sql`
- `src/lib/accreditations.functions.ts`
- `src/routes/accreditations.tsx` + `accreditations.$slug.tsx` (اختياري)
- `src/components/home/AwardsCarousel.tsx`
- `src/components/home/WhyChooseUs.tsx`
- `src/components/home/StatsBar.tsx`
- `src/components/home/HeroSlider.tsx`
- `src/components/WhatsAppFab.tsx`
- تعديل: `src/routes/index.tsx`, `src/routes/specialties.index.tsx`, `src/components/Footer.tsx`, `src/routes/__root.tsx` (لإدراج الـ FAB).

---

## ترتيب التنفيذ المقترح
1. Migration + RPC + بذور تجريبية لجدول الاعتمادات.
2. صفحة `/accreditations` كاملة.
3. `AwardsCarousel` + `WhyChooseUs` + `StatsBar` في الرئيسية.
4. `HeroSlider` (استبدال الهيرو الحالي).
5. عدّاد الأطباء على بطاقات التخصصات.
6. `WhatsAppFab` عالمي + Banner تطبيق في الرئيسية.

هل أبدأ بتنفيذ الخطة كاملة، أم تفضّل البدء بمرحلة محددة (مثلاً 1+2 فقط)؟
