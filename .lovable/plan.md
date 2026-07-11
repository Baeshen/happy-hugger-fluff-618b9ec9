
# خطة إعادة بناء صفحة الأطباء ونظام الحجوزات

المرجع: udh.sa/doctors و eservices.udh.sa/reservations. النطاق كبير — سيُنفَّذ على مراحل مع الحفاظ على الروابط الحالية `/doctors` و`/book`.

---

## 1) توسيع بيانات الطبيب (Migration)

إضافة أعمدة اختيارية على `doctors`:
- `gender` (male/female) — للفلترة
- `years_experience` (int)
- `languages` (text[]) — مثل `{ar,en}`
- `avg_rating` (numeric) و`ratings_count` (int) — محسوبة من `patient_ratings` عبر trigger أو view
- `available_branches` — بديل: جدول ربط `doctor_branches (doctor_id, branch_id)` لدعم طبيب في أكثر من فرع (حاليًا `branch_id` مفرد)
- `booking_enabled` (bool، افتراضي true)
- `next_available_slot` — view/RPC محسوب من `availability` + `appointments` + `doctor_leaves`

RPC عام جديد: `list_public_doctors(_specialty, _branch, _gender, _language, _q, _limit, _offset)` يُرجع الأطباء + التقييم + أقرب موعد متاح.

---

## 2) صفحة `/doctors` — نسخة مطابقة لـ udh.sa/doctors

مكونات جديدة تحت `src/routes/doctors.index.tsx`:
- **Hero** + شريط بحث كبير (بحث بالاسم/التخصص).
- **شريط فلاتر جانبي** (Sidebar على desktop، Sheet/Drawer على mobile):
  - التخصص (checkbox متعدد)
  - الفرع (checkbox متعدد)
  - الجنس (رجل/امرأة)
  - اللغة
  - التوفر (متاح اليوم/هذا الأسبوع)
- **قائمة الأطباء**: بطاقات كبيرة تُظهر:
  - الصورة، الاسم، اللقب، التخصص، الفرع
  - النجوم + عدد التقييمات
  - سنوات الخبرة، اللغات
  - "أقرب موعد متاح: يوم/تاريخ"
  - زران: "الملف الشخصي" و"احجز موعد" (يفتح مباشرة على الطبيب في `/book`)
- ترقيم صفحات (Pagination) أو Load more.
- SEO: JSON-LD `ItemList` (موجود) + Physician schema لكل بطاقة.

## 3) صفحة الطبيب `/doctors/$slug` — تحسين

- Hero بصورة الطبيب + معلومات جانبية (لغات، خبرة، فروع).
- تبويبات: **نبذة | التعليم | الخبرات | التقييمات | الجدول**.
- Widget "احجز موعد" مثبت جانبيًا يعرض أقرب 3 مواعيد ويربط بالمعالج.

---

## 4) نظام الحجز الجديد `/book` — Wizard متعدد الخطوات

استبدال كامل لـ `src/routes/book.tsx` + المكونات المرتبطة، مع الإبقاء على `booking-submit.ts` و`/api/public/book/create`.

### الخطوات (Stepper علوي)
1. **نوع الخدمة**: عيادات / أشعة / مختبر / متابعة (زر لكل نوع).
2. **الفرع**: بطاقات الفروع (اسم، عنوان، بُعد إن أمكن).
3. **التخصص**: شبكة أيقونات التخصصات (مثل udh).
4. **الطبيب**: قائمة أطباء التخصص في الفرع (بطاقات مختصرة + "أول موعد متاح").
5. **التاريخ**: تقويم شهري يُبرز الأيام المتاحة (من `availability` مع خصم `doctor_leaves` والحجوزات).
6. **الوقت**: شبكة أزرار slots صباح/عصر/مساء (مأخوذة من `/api/public/book/availability`).
7. **بيانات المريض**: الاسم، الجوال (تحقق سعودي)، الهوية، الجنس، سبب الزيارة، تفضيلات التذكير.
8. **مراجعة وتأكيد**: ملخص كل الخيارات → زر تأكيد يُنشئ الحجز عبر endpoint الحالي.
9. **شاشة النجاح**: رقم مرجعي BAA-XXXX + QR + رابط تتبع + خيار PDF (موجود).

### تحسينات UX
- شريط تقدم علوي (Stepper) مع إمكانية الرجوع.
- حفظ الحالة في `sessionStorage` حتى لا تُفقد عند التحديث.
- تفعيل "التالي" فقط عند اكتمال الخطوة.
- روابط عميقة: `?doctor=` و`?specialty=` يقفزان مباشرة لخطوة الطبيب.
- يدعم RTL كاملًا، بطاقات مرتبة بصريًا مثل udh.

### إعادة استخدام
- `submitBooking()` كما هو (لا تغيير على backend).
- تحديث `/api/public/book/availability` فقط إذا لزم لدعم فترات صباح/عصر.

---

## 5) بنية الملفات

```text
src/routes/
  doctors.index.tsx        (يعاد كتابته)
  doctors.$slug.tsx        (تحسين)
  book.tsx                 (يعاد كتابته — wizard)
src/components/booking/
  BookingWizard.tsx
  Stepper.tsx
  Step1ServiceType.tsx
  Step2Branch.tsx
  Step3Specialty.tsx
  Step4Doctor.tsx
  Step5Date.tsx (Calendar)
  Step6Time.tsx (Slots)
  Step7PatientInfo.tsx
  Step8Review.tsx
  useBookingState.ts       (Zustand/reducer + sessionStorage)
src/components/doctors/
  DoctorCard.tsx
  DoctorsFilterSidebar.tsx
  DoctorsSearchBar.tsx
supabase/migrations/
  <ts>_doctors_extended_fields.sql
  <ts>_list_public_doctors_rpc.sql
```

---

## 6) مراحل التنفيذ (بالترتيب)

| # | الخطوة | التسليم |
|---|--------|---------|
| 1 | Migration: أعمدة الطبيب الجديدة + RPC العام + policies | جاهز في backend |
| 2 | صفحة `/doctors` الجديدة (Hero + Filters + Cards) | نسخة UDH-style |
| 3 | تحسين `/doctors/$slug` (تبويبات + widget حجز) | صفحة ملف شخصي كاملة |
| 4 | Wizard `/book` — الهيكل + خطوات 1-4 | التنقل بين الخطوات |
| 5 | Wizard — خطوات 5-6 (تقويم + slots) | اختيار موعد فعلي |
| 6 | Wizard — خطوات 7-9 (بيانات + تأكيد + نجاح) | حجز كامل يعمل |
| 7 | ربط الأزرار: "احجز" من `/doctors` → تقفز لخطوة الطبيب مباشرة | تجربة متكاملة |
| 8 | فحص عبر Playwright + اختبارات RLS الحالية | التأكد من عدم كسر شيء |

---

## 7) نقاط تحتاج قرارك قبل البدء

- **صور الأطباء**: هل ستُرفع لاحقًا أم نستخدم placeholder موحد الآن؟ (سأستخدم initials كما هو الآن).
- **جنس الطبيب واللغات**: هل تريدني أُدخل قيم افتراضية لكل الأطباء الحاليين (مثلاً `{ar,en}`) أم أتركها فارغة لتُملأ يدويًا من لوحة الإدارة؟
- **دعم طبيب/عدة فروع**: هل نضيف جدول `doctor_branches` الآن، أم نبقي `branch_id` مفرد ونؤجل ذلك؟

سأنتظر موافقتك قبل تنفيذ Migration رقم 1، ثم أُنفّذ المراحل تباعًا كل واحدة في رسالة مستقلة لسهولة المراجعة.

