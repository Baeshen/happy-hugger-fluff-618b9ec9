
## الهدف
دمج «التقييمات» و«بطاقة QR» في تجربة موحّدة مع إضافة الرد الإداري وتحسين التصميم.

## المهام

### 1. زر «تقييم سريع» داخل بطاقة QR للمريض (`PatientQrDialog.tsx`)
- إضافة زر ثانوي «QR للتقييم» بجانب زر «QR للملف».
- عند التفعيل: يبني رابط `/rate?branch={branchId}&doctor={doctorId}` مع QR + معاينة قابلة للطباعة.
- تبديل داخلي (Tabs صغيرة): «ملف المريض» ↔ «تقييم الزيارة».

### 2. مولّد بطاقة QR للتقييم — للطباعة في العيادة
- بطاقة جديدة داخل `/qr-cards` أو صفحة فرعية: يختار المستخدم (فرع + طبيب اختياري) وينتج QR بحجم كبير مع نص «قيّم تجربتك».
- تصميم قابل للطباعة (A6/A5) — بدون بيانات مريض، للتعليق في غرف الانتظار.

### 3. الرد الإداري على التقييمات
**Migration** — إضافة أعمدة إلى `patient_ratings`:
- `staff_reply text`
- `staff_reply_at timestamptz`
- `staff_reply_by uuid references auth.users(id)`

**RLS** — سياسة `UPDATE` جديدة تسمح للطاقم (admin/super_admin/reception) بتحديث حقلي الرد فقط.

**Server fn** — `replyToRating({ id, reply })` في `src/lib/ratings.functions.ts` مع تحقق دور staff.

**واجهة** — في `/ratings`:
- عرض الرد الحالي أسفل كل تقييم.
- زر «رد» يفتح Dialog بحقل نصي + حفظ.
- زر «تعديل/حذف الرد» للطاقم.

### 4. تحسين تصميم `/rate` و `/ratings`
- `/rate`: مسافات أفضل، أيقونات نجوم أكبر (animate on hover)، بطاقة نجاح محسّنة، إخفاء اختيار الطبيب إذا محدّد مسبقًا من QR.
- `/ratings`: بطاقات KPI أعلى الصفحة (المتوسط العام، عدد التقييمات، معدل الرد)، Tabs (نظرة عامة / حسب الطبيب / حسب الفرع / التقييمات).
- ألوان النجوم موحّدة (amber-500).

## الملفات
**تعديلات**:
- `src/components/PatientQrDialog.tsx` — Tabs داخلية + QR للتقييم.
- `src/routes/_authenticated/qr-cards.tsx` — قسم «بطاقات تقييم للطباعة».
- `src/routes/_authenticated/ratings.tsx` — عرض الرد + Dialog + بطاقات KPI + Tabs.
- `src/routes/rate.tsx` — تحسينات بصرية.
- `src/lib/ratings.functions.ts` — `replyToRating` + توسيع `RatingRow`.

**جديد**:
- Migration واحدة: أعمدة `staff_reply*` + سياسة UPDATE.

بدون تغييرات على تدفق التقديم العام أو مفاتيح البيانات.
