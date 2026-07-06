# المرحلة التالية — تصلّب شامل

ثلاثة مسارات مستقلة، مرتّبة من الأقل مخاطرة إلى الأعلى. كل مسار قابل للتنفيذ منفردًا.

---

## المسار 1 — توسيع `format:check` للمشروع كاملًا

### الحالة الحالية
- CI يشغّل `format:check:book` فقط (نطاق ضيّق: ملفّي book).
- تشغيل `bunx prettier --check .` محليًا يفشل على **56 ملفًا** قديمًا (معظمها `tests/rls/*` و `src/styles.css` وبعض المكوّنات).

### التنفيذ
1. `bun run format` على المشروع كاملًا → إعادة تنسيق الـ56 ملفًا مرة واحدة.
2. حذف السكربت الضيّق `format:check:book` من `package.json` وإبقاء `format:check` فقط.
3. تعديل `.github/workflows/ci.yml`: استبدال `bun run format:check:book` بـ `bun run format:check`.
4. التحقق: `bun run format:check && bun run lint:book && bun run typecheck`.

### مخاطر
- تغييرات تنسيقية واسعة داخل commit واحد (لا تغيير سلوكي).

---

## المسار 2 — تعميم نمط `friendlyInsertError` على مسارات insert أخرى

### النطاق المكتشف
مسارات تحتوي `.insert(` خارج book:
- `src/routes/pharmacy.tsx` — طلبات دواء (medicine_orders) من المستخدم.
- `src/lib/admin.functions.ts` — server functions إدارية.

### التنفيذ
1. **ربط pharmacy.tsx بـ `@/lib/insert-errors`:** استبدال أي تعامل يدوي مع أخطاء الـ insert بـ `toast.error(friendlyInsertError(error))`.
2. **مراجعة `admin.functions.ts`:** إن كانت الأخطاء تعود إلى الواجهة، نفس المعاملة؛ إن كانت داخلية فقط تُترك كما هي (تبقى `.throw()`).
3. **توسيع eslint guardrails في `eslint.config.js`:** تعميم block الحالي المخصّص لـ book ليشمل `src/routes/pharmacy.tsx` (ومسارات insert مستقبلية عبر نمط glob). أو إضافة block ثانٍ بنفس القواعد وبنفس الرسالة.
4. **توسيع سكربت lint:** إضافة `"lint:inserts": "eslint <book files> src/routes/pharmacy.tsx --max-warnings=0"` وربطه بـ CI. الإبقاء على `lint:book` كاسم مألوف (alias).
5. **توسيع سكربت prettier:** `format:check:inserts` بنفس النطاق (مؤقتًا حتى ينتهي المسار 1؛ يُلغى بعده).
6. **توسيع التوثيق:** تعديل `docs/book-friendly-insert-error.md` — تغيير العنوان إلى "استيراد `friendlyInsertError` داخل مسارات insert"، وتحديث قائمة المسارات المشمولة (book + pharmacy + …). اختبار `book-docs-examples.sh` لا يتغيّر (الأمثلة نفسها لا تزال تفشل بنفس الطريقة).
7. **اختبارات:** إضافة اختبار end-to-end في `tests/rls/pharmacy-friendly-errors.test.ts` على غرار `book-api-friendly-errors.test.ts` (يستفزّ RLS/duplicate ويؤكد رسالة عربية).

### مخاطر
- تغيير سلوك رسائل الأخطاء لمستخدم pharmacy (رسائل موحّدة بدل نص المزوّد).

---

## المسار 3 — تشغيل `tests/rls/*` داخل CI

### المتطلّبات (يحتاج تدخّل يدوي منك)
اختبارات RLS تصل إلى Supabase الحيّ وتحتاج ثلاثة أسرار GitHub Actions repo secrets:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**لا يمكنني إضافتها من هنا** — تُضاف من GitHub → Settings → Secrets and variables → Actions → New repository secret. القيم موجودة في Lovable Cloud فقط ولا تُعرض في هذا السياق (خاصة SERVICE_ROLE_KEY).

### التنفيذ
1. **job جديدة** `rls-tests` في `.github/workflows/ci.yml` بجوار `lint-and-typecheck` (متوازية، لا تعتمد عليها).
2. تشغيل كل ملفّات `tests/rls/*.test.ts` بحلقة `bun` واحدة:
   ```yaml
   - name: RLS tests
     env:
       SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
       SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
       SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
     run: |
       set -e
       for f in tests/rls/*.test.ts; do
         echo "── $f ──"
         bun "$f"
       done
   ```
   (إن كانت الأسرار غائبة، الاختبارات تطبع `(skipping — missing Supabase env vars)` وتخرج بنجاح — الحماية موجودة أصلًا في الملفات.)
3. **قرار تشغيل شرطي:** الخيار الأنظف هو ربط الـ job بحدث `push` على `main` فقط (وليس على PRs من فروع خارجية لأسباب أمنية — GitHub Actions يخفي secrets عن PRs من forks). تشغيلها أيضًا على PRs داخلية (workflow: `pull_request` لكن مع فحص `secrets.SUPABASE_URL != ''`).

### مخاطر
- الاختبارات تكتب في DB الإنتاج نفسه (تنشئ users مؤقتين، تحذفهم في `finally`). راجع الملفات — التنظيف موجود لكنه أفضل جهد.
- مدة CI ستزيد (اختبارات RLS بطيئة نسبيًا).

### قرار مطلوب
هل تريد تشغيل RLS على:
- **A)** كل PR + push على main (يتطلّب أسرار GitHub جاهزة).
- **B)** push على main فقط.
- **C)** يدويًا عبر `workflow_dispatch` (زر Run في GitHub Actions).

---

## الترتيب المقترح للتنفيذ

1. **المسار 1 أولًا** — يمهّد للتنسيق الموحّد قبل أي refactor لـ pharmacy.
2. **المسار 2** — refactor + guardrails + اختبار جديد.
3. **المسار 3** — أخيرًا، بعد أن تُضيف أسرار GitHub.

هل أبدأ بالثلاثة بالترتيب، أم بمسار واحد فقط؟ وأي خيار (A/B/C) للمسار 3؟
