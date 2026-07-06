# خطة: تصلّب واجهة الحجز العامة (`/book`)

## الوضع الحالي

- `/book` يستدعي `supabase.from("appointments").insert(...)` مباشرةً من العميل بدون مستخدم مُصادق (دور `anon`).
- الدفاعات القائمة في DB:
  - RLS `anyone create appointments` WITH CHECK: `patient_name` طوله 2-120، `patient_phone` طوله 6-32، `appointment_date >= CURRENT_DATE`.
  - Trigger `trg_force_appointment_defaults` (BEFORE INSERT): يفرض `status='new'` و`notes=NULL` عند غياب الدور الموظف.
  - RLS SELECT/UPDATE/DELETE: staff فقط. `anon` لا يقرأ.
- ثغرات:
  - العميل لا يفرض حدود طول على `reason`/`national_id`/`gender`/الاسم/الهاتف قبل الإرسال.
  - `specialty_id`/`doctor_id`/`appointment_time` غير مربوطين بفحص وجود/توفر على مستوى DB.
  - رسائل الخطأ من DB تُعرض حرفيًا للمستخدم (`toast.error(error.message)`).
  - لا حدود على `reason` قد يقبل نصًا طويلًا جدًا يمر بلا حدّ من الطول.

## المخرجات

### 1) اختبارات e2e تُثبّت الدفاعات الحالية (خطر انحدار)

جميعها ضد `/book` عبر Playwright كـ `anon`:

- `tests/e2e/book_defaults_enforced.py` — يحقن `status:"confirmed"` و`notes:"leaked"` في جسم طلب إدراج `appointments` عبر `page.route`. يتحقق أن الصف المُنشأ في DB يظهر `status='new'` و`notes=NULL`.
- `tests/e2e/book_rls_check_boundaries.py` — يجرّب من الواجهة:
  - اسم قصير جدًا (`ا`) → توست خطأ + لا صف.
  - هاتف قصير (`123`) → مرفوض.
  - تاريخ في الماضي (اعتراض الطلب وتبديل `appointment_date` إلى أمس) → مرفوض.
- `tests/e2e/book_anon_cannot_read.py` — بعد إنشاء موعد، يتأكد أن `supabase.from("appointments").select(...)` من نفس صفحة `/book` بجلسة `anon` يُعيد صفرًا.

### 2) اختبارات تكامل RPC-Level (سريعة، بدون متصفح)

`tests/rls/book_anon_insert_hardening.test.ts`:
- إدراج بمفتاح `anon` مع `status`/`notes` قيم عبثية → القيم مُطبّعة.
- إدراج بتاريخ الأمس → 42501 أو 42501 من RLS WITH CHECK.
- اسم مكوّن من فراغات فقط (`   `) → مرفوض (`btrim` طوله 0).
- SELECT بـ `anon` بعد INSERT → مصفوفة فارغة.

### 3) تشديد جانب العميل + السيرفر

- `src/routes/book.tsx`:
  - Zod `bookingFormSchema`: `name` 2-120، `phone` 6-32 مع regex أرقام+`+`، `national_id` 5-20، `gender ∈ {male,female}`، `reason` 0-500 (يطابق `REASON_MAX`).
  - قبل الإرسال: `parse()` وعرض أول رسالة خطأ بالعربية.
  - استبدال `toast.error(error.message)` برسائل عربية مصنّفة (RLS / تعارض / شبكة / عام) عبر خريطة صغيرة — لا نسرّب نصوص PostgREST/PL/pgSQL.
- إضافة `maxLength` على `<input>`/`<textarea>` مطابقة لـ Zod كطبقة أولى.

### 4) اختياري — لا نبنيه الآن، فقط نُدرجه للنقاش لاحقًا

- ربط `specialty_id`/`doctor_id`/`appointment_time` بفحص وجود/توفر عبر server route عام (`/api/public/book`) بدل `insert` مباشر — يفتح باب rate-limiting وCAPTCHA وحلقة تحقق سلوت زمني حقيقي.
- Rate-limit anonymous inserts (نقطة مطلوبة قبل الإنتاج).

## تفاصيل تقنية

- الاعتراض في الاختبارات: نفس نمط `reason_501_rejected.py` — `page.route("**/*", ...)` يعدّل `post_data` قبل إرسال طلبات `/rest/v1/appointments` أو `/_serverFn/*`.
- التنظيف: كل اختبار يحذف صفوفه في `appointments`/`appointment_audit` عبر `SERVICE_ROLE_KEY`.
- خريطة الأخطاء العربية:
  ```text
  new row violates row-level security  → "تعذر الحفظ. تحقق من الاسم/الهاتف/التاريخ."
  duplicate key value                  → "الموعد محجوز مسبقًا."
  Failed to fetch / NetworkError       → "تعذر الاتصال بالخادم."
  <fallback>                            → "حدث خطأ غير متوقع."
  ```

## خارج النطاق

- تغييرات schema أو سياسات RLS جديدة.
- ربط CAPTCHA أو رسائل SMS للتأكيد.
- نقل المسار إلى server route (يُطرح في مرحلة لاحقة).
