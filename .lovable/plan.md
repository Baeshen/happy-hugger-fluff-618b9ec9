## الوضع الحالي

الصفحة الرئيسية `/` تحتوي بالفعل على JSON-LD كامل من نوع `MedicalClinic` + `LocalBusiness` (إحداثيات جغرافية، ساعات عمل السبت–الخميس والجمعة، عنوان بريدي، طرق دفع، تخصصات، contactPoint عربي/إنجليزي).
كما توجد `GeoCoordinates` جزئية في `/about` وصفحات الأطباء.

الصفحات `/contact` و `/complex` — وهي الأهم لنتائج جوجل المحلية ("مجمع باعشن صبيا"، "عيادات صبيا"، "أرقام العيادات") — لا تحتوي على أي JSON-LD حتى الآن.

## المطلوب

تعزيز Local SEO عبر:

1. **`src/lib/localBusinessSchema.ts`** (جديد): استخراج كائن `MedicalClinic/LocalBusiness` المشترك من `index.tsx` إلى دالة قابلة لإعادة الاستخدام تأخذ `{ pageUrl, pageType }` وتعيد الـ JSON-LD مع الحقول الأساسية (geo, address, openingHoursSpecification, contactPoint, medicalSpecialty, sameAs, hasMap, areaServed).

2. **`src/routes/contact.tsx`**: إضافة JSON-LD كامل عبر الدالة الجديدة، مع BreadcrumbList، وإثراء الـ meta الحالي بـ `og:url` و`canonical` يشيران للصفحة نفسها. هذه الصفحة الأهم لاستعلامات "أرقام / موقع / وسائل التواصل".

3. **`src/routes/complex.tsx`**: إضافة JSON-LD مماثل + `amenityFeature` (صيدلية داخلية، اعتماد CBAHI، مواقف، خدمات طوارئ) + BreadcrumbList.

4. **`src/routes/index.tsx`**: تبديل الكائن المضمّن باستخدام الدالة المشتركة (بدون تغيير الحقول) لضمان اتساق البيانات عبر الصفحات.

5. **`src/routes/__root.tsx`**: التحقق من عدم إضافة JSON-LD متضاربة سيتم فحصها فقط.

## ملاحظات تقنية

- الحفاظ على `@id` موحّد `${SITE_URL}/#clinic` في جميع الصفحات (Schema.org يفضّل معرّف كيان واحد لنفس المنشأة).
- لكل صفحة `@type` مختلف عند اللزوم: الرئيسية والاتصال `MedicalClinic + LocalBusiness`، `/complex` تضيف `Place` لتوصيف المرافق.
- الاعتماد على `SITE` من `src/lib/site.ts` (موجود مسبقاً) — لا حاجة لأي متغيرات جديدة.
- لا تغييرات على قاعدة البيانات أو الترجمات.

## ملفات ستُعدّل

- إنشاء: `src/lib/localBusinessSchema.ts`
- تعديل: `src/routes/index.tsx`, `src/routes/contact.tsx`, `src/routes/complex.tsx`