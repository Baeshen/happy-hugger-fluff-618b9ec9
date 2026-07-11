# مراجعة خطة إعادة بناء صفحة الأطباء ونظام الحجوزات

المرجع: udh.sa/doctors و eservices.udh.sa/reservations. بعد مراجعة الشيفرة الفعلية، معظم البنية موجودة بالفعل. هذه نسخة محدَّثة تُبيّن ما اكتمل وما يجب إكماله.

---

## 1) توسيع بيانات الطبيب — ✅ مكتمل

على `public.doctors` أُضيفت الأعمدة: `gender`, `years_experience`, `languages text[]`, `avg_rating`, `ratings_count`, `booking_enabled`.
جدول الربط `doctor_branches (doctor_id, branch_id)` موجود ومُفعَّل مع RLS.
دالة `list_public_doctors(_specialty,_branch,_gender,_language,_q,_limit,_offset)` تُرجع الأطباء + التقييم + `next_available_slot` المحسوب من `availability` مع خصم `doctor_leaves` والحجوزات القائمة.

## 2) صفحة `/doctors` — ✅ مكتمل جزئيًا

`src/routes/doctors.index.tsx` (900 سطر) تعرض Hero + شريط بحث + فلاتر (تخصص/فرع/جنس/لغة/توفر) + بطاقات كبيرة للأطباء تُظهر التقييم، الخبرة، اللغات، أقرب موعد، وزرَي «الملف الشخصي» و«احجز موعد».

**متبقٍّ:**
- تدقيق أن زر «احجز موعد» يمرّر `?doctor=<id>&specialty=<id>` إلى `/book` ويقفز مباشرة إلى الخطوة المناسبة.
- Physician JSON-LD schema لكل بطاقة (حاليًا `ItemList` فقط).

## 3) صفحة الطبيب `/doctors/$slug` — ✅ مكتمل

`src/routes/doctors.$slug.tsx` (1911 سطر) تحوي Hero + معلومات جانبية + تبويبات (نبذة/تعليم/خبرات/تقييمات/جدول) + widget حجز جانبي مع أقرب المواعيد.

## 4) نظام الحجز `/book` — ✅ مكتمل

`src/routes/book.tsx` (1424 سطر) يحتوي Wizard كامل من 9 خطوات (نوع الخدمة → الفرع → التخصص → الطبيب → التاريخ → الوقت → بيانات المريض → مراجعة → نجاح) مع Stepper علوي، حفظ الحالة، تكامل مع `submitBooking()` وشاشة نجاح فيها QR ونسخ ومشاركة وواتساب.

**متبقٍّ (تحسينات صغيرة):**
- التأكد من قراءة الروابط العميقة `?doctor` و`?specialty` عبر `validateSearch` مع القفز التلقائي للخطوة المناسبة.
- حفظ الحالة في `sessionStorage` إن لم يكن مفعّلًا.

## 5) بنية الملفات

الحالي مضغوط في ملفات كبيرة (`doctors.index.tsx`, `book.tsx`) بدلاً من `src/components/booking/*` و`src/components/doctors/*` المقترحة. يعمل جيدًا لكن يصعب صيانته لاحقًا.

**اقتراح (اختياري، ليس عاجلاً):** استخراج `Stepper`, `StepDate`, `StepTime`, `StepPatientInfo`, `StepReview`, `StepSuccess` من `book.tsx` إلى `src/components/booking/`, واستخراج `DoctorCard`, `DoctorsFilterSidebar`, `DoctorsSearchBar` من `doctors.index.tsx` إلى `src/components/doctors/`. هذا لا يغيّر السلوك، فقط ينظّم الشيفرة.

## 6) المراحل المتبقية

| # | المهمة | الحالة |
|---|--------|--------|
| 1 | Migration + RPC + policies | ✅ منجز |
| 2 | صفحة `/doctors` بالفلاتر والبطاقات | ✅ منجز |
| 3 | صفحة `/doctors/$slug` بالتبويبات وWidget | ✅ منجز |
| 4 | Wizard `/book` الخطوات 1-9 | ✅ منجز |
| 5 | فحوصات Playwright E2E للحجز | ✅ منجز (`tests/e2e/booking-flow.py` + CI) |
| 6 | روابط عميقة `?doctor`/`?specialty` → قفز للخطوة | 🟡 تدقيق مطلوب |
| 7 | Physician JSON-LD لكل بطاقة طبيب | 🟡 لم يُضف |
| 8 | استخراج المكوّنات لملفات مستقلة | ⚪ اختياري |
| 9 | صور الأطباء (رفع فعلي أو placeholder موحّد) | ⚪ قرار المستخدم |

## 7) قرارات معلَّقة

- **صور الأطباء:** حاليًا Initials — هل تريد رفع صور فعلية عبر لوحة إدارة أم إبقاء Initials؟
- **قيم افتراضية:** هل نُدخل `languages = {ar,en}` لكل الأطباء الحاليين، أم نتركها فارغة؟
- **مكوّنات مفصولة:** هل تريد إعادة الهيكلة الآن أم تأجيلها؟

---

## ما سأنفّذه بعد موافقتك

1. تدقيق `?doctor` و`?specialty` deep-link في `/book` وإصلاحه إن لزم.
2. إضافة Physician JSON-LD لكل بطاقة طبيب في `/doctors`.
3. تنفيذ القرارات الثلاث في الفقرة (7) حسب اختيارك.
