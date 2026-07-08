# المرحلة 4 — بوابة المريض + خدمات الجودة

بعد اكتمال المراحل 1-3 (البنية، الفروع، مراكز التميز، الخدمات المتقدمة) وصقل تجربة الحجز والتتبع، ننتقل لآخر مرحلة في الخطة الكبرى.

## الحالة الحالية

موجود بالفعل: `/complaints`, `/emergency`, `/my` (نسخة أولية), `/careers`, `/telemedicine`, `/insurance`, `/home-care`, `/international-patients`, `/media/news`, `/packages`.

الناقص من المرحلة 4:
- إعادة تصميم `/my` كبوابة تبويبية شاملة
- `/second-opinion` — الرأي الطبي الثاني
- `/app` — صفحة تنزيل التطبيق
- Chatbot عائم بسيط
- `/media/stories` — قصص المرضى (تبقّى من المرحلة 3)
- `/corporate` — خدمات الشركات (تبقّى من المرحلة 3)

## نطاق المرحلة

### 1) إعادة تصميم `/my` كبوابة تبويبية (الأولوية القصوى)
5 تبويبات داخل الصفحة (تحت `_authenticated`):
- **المواعيد** — الحالية + قادمة + سابقة (موجود جزئياً، يُنقل تحت تبويب).
- **الوصفات النشطة** — قراءة من `prescriptions` (جديد).
- **تقارير المختبر** — قراءة من `lab_reports` + رابط تحميل PDF من Storage bucket `lab-reports`.
- **تقارير الأشعة** — من `radiology_reports` + رابط PDF من `radiology-reports`.
- **الفواتير** — من `invoices` + زر "طلب مطالبة تأمين".

### 2) `/second-opinion`
نموذج طلب رأي طبي ثاني: بيانات المريض، التخصص، ملخص الحالة، رفع تقارير سابقة (Storage bucket `second-opinion-uploads`، RLS: إدراج عام لمستخدم مسجّل، قراءة للأدمن).
جدول `second_opinion_requests`.

### 3) `/app`
صفحة تسويقية لتطبيق الجوال: hero + مزايا + بطاقات App Store / Google Play (روابط placeholders + QR code).

### 4) Chatbot عائم
مكوّن `<ChatbotBubble />` في `__root.tsx`:
- زر عائم أسفل يمين (يحترم `QuickBar` الموجود).
- نافذة صغيرة تعرض أسئلة شائعة من `faqs` (قراءة عبر Supabase publishable).
- fallback: زر "تحدث معنا على واتساب" يفتح `wa.me` برسالة مُعدّة.
- بدون AI في هذه المرحلة (بحث نصي بسيط داخل عناوين `faqs`).

### 5) `/media/stories` (تكميل المرحلة 3)
قصص مرضى: جدول `patient_stories` + صفحة فهرس + صفحة تفصيلية `$slug`.

### 6) `/corporate` (تكميل المرحلة 3)
صفحة اتفاقيات الشركات + نموذج طلب اتفاقية → `corporate_requests`.

## الجداول والـStorage الجديدة

```text
prescriptions            (id, patient_id, doctor_id, medication, dosage, start_date, end_date, status, notes)
lab_reports              (id, patient_id, title, ordered_by, report_date, file_path, status)
radiology_reports        (id, patient_id, modality, body_part, report_date, file_path, findings)
invoices                 (id, patient_id, appointment_id?, total, currency, status, issued_at, pdf_path)
second_opinion_requests  (id, patient_name, phone, specialty, summary, uploads[], status, created_at)
patient_stories          (id, slug, title_ar, excerpt, body_md, hero_image_url, published_at)
corporate_requests       (id, company_name, contact_name, phone, email, employee_count, notes, status)

Storage buckets: lab-reports, radiology-reports, invoice-pdfs, second-opinion-uploads
```

## تفاصيل تقنية

- جميع الجداول الجديدة تتبع القاعدة الصارمة: `CREATE TABLE public.*` → `GRANT` لكل دور مسموح → `ENABLE ROW LEVEL SECURITY` → `CREATE POLICY`.
- سياسات RLS للجداول الشخصية (`prescriptions`, `lab_reports`, `radiology_reports`, `invoices`): SELECT مقيّد بـ `patient_id = auth.uid()` + admin عبر `has_role`.
- الجداول العامة (`patient_stories`): SELECT للـ `anon` عندما `published_at IS NOT NULL`.
- كل ملف مسار تحت `src/routes/` بـ `head()` مستقل: title/description/og:title/og:description/canonical على `https://happy-hugger-fluff.lovable.app/...`.
- Storage: buckets خاصة (غير عامة) — تُقدَّم عبر `createSignedUrl` من server function محمي بـ `requireSupabaseAuth`.
- SSR: كل صفحة عامة تستخدم `loader` + `ensureQueryData` + `useSuspenseQuery`. الصفحات تحت `_authenticated` تستخدم `useServerFn` داخل `useQuery`.
- Chatbot: مكوّن client-only يُلفّ بـ `useHydrated()` لتجنّب mismatch.
- بيانات تجريبية (seed) للجداول الجديدة تُضاف عبر migration منفصلة (ليست في نفس migration الإنشاء).

## التنفيذ التدريجي

سأنفّذها بترتيب الأولوية:
1. بوابة `/my` التبويبية + جداول الوصفات/المختبر/الأشعة/الفواتير (الأكبر أثراً).
2. `/second-opinion` + `/app` + `/corporate` + `/media/stories` (صفحات جديدة مستقلة).
3. Chatbot العائم (لمسة نهائية عبر الموقع كله).

بعد الانتهاء يكون الموقع مطابقاً لنطاق HMG وظيفياً، مع صقل تجربة أحدث وأسرع.
