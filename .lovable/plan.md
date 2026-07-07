## نطاق هذه الجلسة (EMR — المرحلة الأولى)

سنبني الأساس السريري للسجل الطبي الإلكتروني بمستوى قابل للاستخدام الفوري من قِبل الأطباء وموظفي الاستقبال، مع إبقاء الميزات المتقدمة (وصفات إلكترونية موقّعة، طلبات مختبر/أشعة، تكامل ICD-10، توقيع رقمي، تدقيق سريري كامل) لجلسات لاحقة.

## الجزء 1 — قاعدة البيانات

جداول جديدة كلها في `public` مع GRANT + RLS + `updated_at` triggers:

1. **`patients`** — الملف الأساسي للمريض
   - `id`, `branch_id`, `mrn` (رقم ملف تلقائي فريد لكل فرع), `full_name_ar`, `full_name_en`, `national_id`, `phone`, `secondary_phone`, `email`, `gender`, `date_of_birth`, `blood_type`, `marital_status`, `nationality`, `city`, `address`, `emergency_contact_name`, `emergency_contact_phone`, `notes`, `is_active`, `created_by`
   - Unique: `(branch_id, mrn)`, `(branch_id, national_id)` (nullable)
   - ربط اختياري بجدول `profiles` (patient portal) عبر `profile_id`

2. **`patient_allergies`** — الحساسية
   - `patient_id`, `allergen`, `reaction`, `severity` (mild/moderate/severe/life_threatening), `noted_on`, `notes`, `recorded_by`

3. **`patient_medications`** — الأدوية الحالية/السابقة
   - `patient_id`, `medication_name`, `dosage`, `frequency`, `route`, `start_date`, `end_date`, `status` (active/paused/stopped/completed), `prescribed_by_name`, `notes`, `recorded_by`

4. **`patient_medical_history`** — التاريخ المرضي (أمراض مزمنة/سابقة)
   - `patient_id`, `condition`, `category` (chronic/past/family/surgical_note), `onset_date`, `resolution_date`, `status` (active/resolved/managed), `notes`, `recorded_by`

5. **`patient_surgeries`** — العمليات
   - `patient_id`, `procedure_name`, `surgery_date`, `hospital`, `surgeon_name`, `outcome`, `complications`, `notes`, `recorded_by`

6. **`patient_visits`** — الزيارات السريرية (ملاحظات SOAP مبسّطة)
   - `patient_id`, `appointment_id` (nullable link), `visit_date`, `doctor_id`, `chief_complaint`, `subjective`, `objective`, `assessment`, `plan`, `vitals` (jsonb: bp/hr/temp/rr/spo2/weight/height/bmi), `follow_up_date`, `created_by`

7. **`patient_attachments`** — المرفقات (تقارير، أشعة، تحاليل)
   - `patient_id`, `visit_id` (nullable), `title`, `category` (lab/imaging/report/prescription/insurance/other), `file_path` (storage), `mime_type`, `size_bytes`, `uploaded_by`, `notes`

**Enums:** `allergy_severity`, `medication_status`, `medical_history_category`, `medical_history_status`, `attachment_category`, `gender_type`.

**سياسات RLS (نمط موحّد):**
- READ: `admin | super_admin | doctor | reception` ضمن نفس الفرع (`has_branch_access`).
- WRITE (insert/update): `admin | super_admin | doctor` — الاستقبال يقدر يسجّل مريض جديد ويحدّث بياناته الشخصية فقط (بدون بيانات سريرية).
- DELETE: `admin | super_admin` فقط.
- المريض نفسه (إذا `profile_id = auth.uid()`): READ فقط لسجله وزياراته ومرفقاته.
- إضافة دور `doctor` لـ `app_role` enum إن لم يكن موجودًا.

**Storage:**
- Bucket جديد `patient-files` (private) لمرفقات المرضى.
- سياسات على `storage.objects` مقيّدة بمسار `<patient_id>/...` وبنفس شروط قراءة/كتابة الجدول.

**دالة توليد MRN:**
- `generate_mrn(_branch_id)` — تُرجع رقمًا تسلسليًا (مثلاً `BR001-0000123`) بناءً على prefix الفرع + counter لكل فرع (`branch_mrn_counter` جدول مساعد أو `nextval`).

## الجزء 2 — الواجهة

مسارات جديدة تحت `_authenticated/`:

1. **`/patients`** — قائمة المرضى (بحث بالاسم/الجوال/الهوية/MRN، تصفية بالفرع، Pagination، زر "مريض جديد").
2. **`/patients/new`** — نموذج إنشاء ملف (بيانات شخصية أساسية + جهة اتصال طوارئ).
3. **`/patients/$patientId`** — الملف الكامل بتبويبات (Tabs):
   - **نظرة عامة**: البيانات الشخصية + آخر زيارة + تنبيهات (حساسية severe/life_threatening بشريط أحمر بارز).
   - **الحساسية**: قائمة + إضافة/تعديل/حذف.
   - **الأدوية**: قائمة (نشط/موقوف) + إضافة/تعديل.
   - **التاريخ المرضي**: قائمة مصنّفة (مزمن/سابق/عائلي).
   - **العمليات**: قائمة زمنية + إضافة.
   - **الزيارات**: قائمة زمنية + نموذج SOAP مبسّط + Vitals + ربط بموعد.
   - **المرفقات**: رفع/تنزيل/حذف (استخدام Supabase Storage + signed URLs).
4. **`/patients/$patientId/visits/new`** — نموذج زيارة سريرية مع Vitals و SOAP.

**تكاملات صغيرة:**
- زر "فتح ملف المريض" من صفحة `/admin` (المواعيد) عند وجود `patient_id` مربوط بالموعد.
- إضافة عمود `patient_id` (nullable) إلى `appointments` لربط الحجز بملف رسمي (اختياري، لا يكسر الحجز العام).
- رابط "السجلات الطبية" في شريط الأدمن.

**الصلاحيات في الواجهة:**
- الأزرار السريرية (زيارات/أدوية/حساسية/تاريخ/عمليات) تظهر فقط لدور `doctor | admin | super_admin`.
- الاستقبال يرى قائمة المرضى والبيانات الشخصية فقط.

## خارج النطاق (مؤجّل)

وصفات إلكترونية موقّعة، قوالب SOAP متعددة، ICD-10/SNOMED، طلبات مختبر/أشعة داخلية مع نتائج، توقيع رقمي، تدقيق سريري كامل (audit trail لكل حقل)، بوابة المريض لعرض ملفه بالكامل (سنكتفي بـ RLS read للمالك)، طباعة PDF للسجل، دمج ملفات، تكامل DICOM، ذكاء اصطناعي طبي.

## تفاصيل تقنية

- كل عمليات القراءة/الكتابة عبر Supabase client مباشرة من المكوّنات (RLS يحمي)، لا حاجة لـ `createServerFn` إلا لتوليد signed URLs للمرفقات (لتفادي كشف الـ path).
- Storage: `supabase.storage.from('patient-files').createSignedUrl(path, 300)` من عبر `createServerFn` مع `requireSupabaseAuth` + فحص أن المستخدم له صلاحية على `patient_id`.
- رفع الملفات: من المتصفح مباشرة إلى Storage (بعد التحقق من RLS)، ثم إدراج سجل في `patient_attachments`.
- تصميم: shadcn `Tabs`, `Card`, `Table`, `Dialog`, `Form` (react-hook-form + zod)، ألوان design tokens فقط.
- i18n: مفاتيح جديدة عربية/إنجليزية للأقسام الجديدة.
- التحقق: Zod schemas لكل نموذج (رقم هوية 10 أرقام سعودي، جوال SA، تاريخ ميلاد ≤ اليوم، إلخ).

## سؤال قبل التنفيذ

هل توافق على هذا النطاق كما هو؟ أم تفضّل:
- (أ) تقسيمه لجلستين: **الآن** = جداول + قائمة/إنشاء ملف + تبويب "نظرة عامة" وحساسية وأدوية فقط، و**لاحقًا** = الزيارات (SOAP + Vitals) والمرفقات والتاريخ والعمليات؟
- (ب) البدء بجزء المرفقات + الزيارات فقط (إذا كان الأهم عندك توثيق الفحص)؟

اختر (الكل / أ / ب) وسأبدأ فورًا.