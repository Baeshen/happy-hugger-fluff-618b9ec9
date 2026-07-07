## الحالة الراهنة

بعد فحص المشروع، الميزتان المطلوبتان **مطبّقتان بالكامل**:

### 1) JSON-LD MedicalClinic
- `src/lib/localBusinessSchema.ts` يبني كيانًا موحّدًا `MedicalClinic + LocalBusiness` بـ `@id` ثابت (`/#clinic`) يُعيد استخدامه Google كنفس المنشأة عبر كل الصفحات.
- يتضمّن: الاسم عربي/إنجليزي، العنوان (PostalAddress)، الإحداثيات (GeoCoordinates)، ساعات العمل، وسائل الدفع، `medicalSpecialty`, `contactPoint`, `sameAs`, `areaServed`, `isAcceptingNewPatients`.
- القيم تُقرأ من `clinic_settings` في قاعدة البيانات مع fallback إلى ثوابت `SITE`.
- مُضمَّن في: `/` ، `/complex` ، `/specialties` ، `/doctors` ، وصفحات التفاصيل.
- صفحات إضافية تُثري السكيمة:
  - `/doctors/$slug` → `Physician` مرتبط بالعيادة عبر `worksFor: { @id: CLINIC_ID }`
  - `/specialties/$slug` → `MedicalSpecialty` + قائمة أطباء `Physician`
  - جميعها + `BreadcrumbList`

### 2) Sitemap ديناميكي
`src/routes/sitemap[.]xml.ts` (server route) يُولّد `/sitemap.xml` في وقت الطلب ويشمل:
- **صفحات ثابتة**: `/`, `/complex`, `/specialties`, `/doctors`, `/book`, `/pharmacy`, `/lookup`, `/about`, `/faq`, `/contact`, `/health` بأولويات وترددات مناسبة.
- **أطباء ديناميكيًا**: يجلب كل `doctors` النشِطة (`is_active=true`) مع `slug` ويُنشئ `/doctors/{slug}` مع `lastmod`.
- **تخصصات ديناميكيًا**: يجلب `specialties` النشِطة ويُنشئ `/specialties/{slug}`.
- **مقالات صحية**: `/health/{slug}` للمقالات المنشورة.
- يستخدم Supabase REST مباشرة مع cache header ساعة واحدة.

## لا حاجة لأي تغييرات

الطلب مُنفَّذ بالكامل. إن رغبت بتحسينات إضافية، يمكن اقتراح مثلًا:
- إضافة `<image:image>` لروابط الصور داخل sitemap.
- تقسيم إلى sitemap-index (أطباء/تخصصات/مقالات منفصلة) إذا كبر العدد فوق ~1000.
- إضافة JSON-LD `MedicalWebPage` أو `FAQPage` على صفحات محددة.

هل تريد أن أُطبّق أيًا من هذه التحسينات؟