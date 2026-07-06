# نظام الحجز العام (`/book`)

واجهة حجز مواعيد عامة للمرضى مع دفاعات RLS وتحقق من جانب العميل، بالإضافة إلى نقطة نهاية API عامة (`/api/public/book`) تُعالج الإدراجات بشكل آمن وتُعيد أخطاء عربية ثابتة فقط.

## الوثائق

- [استيراد `friendlyInsertError` داخل مسارات insert](docs/book-friendly-insert-error.md) — الطريقة الصحيحة الوحيدة لاستيراد `friendlyInsertError` / `FRIENDLY_INSERT_MESSAGES` وما يُفشل قواعد `lint:inserts` على `book` و `pharmacy`.

## التشغيل السريع

```bash
bun install
bun run dev
```

## الفحوصات

```bash
bun run format:check          # prettier
bun run lint:inserts          # حماية friendlyInsertError على book + pharmacy
bun run lint:book             # نطاق ضيّق (book فقط) — للـ pre-commit
bun run typecheck
bash tests/lint/book-docs-examples.sh   # أمثلة docs لا تزال متزامنة مع القواعد
bun tests/unit/book-docs-keys.test.ts   # كل مفتاح مذكور في docs موجود ومربوط
bash tests/lint/book-guardrails.sh      # fixture يتحقق من فعّالية القواعد
```

اختبارات RLS (تتطلّب Supabase حي):

```bash
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  bun tests/rls/pharmacy-friendly-errors.test.ts
```

## إعداد أسرار Supabase لاختبارات RLS

تتطلّب اختبارات RLS مشروع Supabase حقيقيًا. يجب توفّر الأسرار التالية بأسمائها المحدّدة في GitHub Actions (Repository secrets) أو في بيئة التشغيل المحلّية:

| المتغير                     | الغرض                      | مطلوب على `main` | التوقّعات والتحقق                                |
| --------------------------- | -------------------------- | ---------------- | ------------------------------------------------ |
| `SUPABASE_URL`              | عنوان مشروع Supabase       | نعم              | يبدأ بـ `https://` وينتهي بـ `.supabase.co`. يُقرأ من `secrets.SUPABASE_URL` ويُتحقق من أنه ليس فارغًا. |
| `SUPABASE_PUBLISHABLE_KEY`  | مفتاح العميل (anon/public) | نعم              | يُستخدم لمحاكاة المستخدمين المجهولين/المسجّلين. يُقرأ من `secrets.SUPABASE_PUBLISHABLE_KEY`. |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح الخدمة               | **نعم**          | يُستخدم لتهيئة البيانات وتنظيفها بعد الاختبارات. يُقرأ من `secrets.SUPABASE_SERVICE_ROLE_KEY`. |

### التحقق المبكّر قبل `checkout` و `install`

كلتا وظيفتَي CI (`rls-tests-main` و `rls-tests-pr`) تتضمّن خطوة `verify_secrets` تُنفّذ **قبل** `actions/checkout` وقبل `bun install`. تُحقّق الخطوة من أن الأسرار الثلاثة غير فارغة عبر bash:

```bash
set -e
missing=()
[ -z "$SUPABASE_URL" ] && missing+=("SUPABASE_URL")
[ -z "$SUPABASE_PUBLISHABLE_KEY" ] && missing+=("SUPABASE_PUBLISHABLE_KEY")
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && missing+=("SUPABASE_SERVICE_ROLE_KEY")
```

إذا كانت القائمة `missing` غير فارغة، يُكتب ملخّص في `GITHUB_STEP_SUMMARY` ويُعرض `::error::` أو `::warning::` في السجلّ. لا يتم إجراء `checkout` أو تثبيت التبعيات في حال غياب الأسرار؛ والغرض هو الفشل/التخطّي السريع دون إهدار وقت التثبيت.

### إضافة الأسرار في GitHub

1. افتح المستودع على GitHub.
2. اذهب إلى **Settings → Secrets and variables → Actions → New repository secret**.
3. أضِف كل سرٍّ من الأسرار الثلاثة أعلاه باسمه بالضبط كما في الجدول.

> **تنبيه:** `SUPABASE_SERVICE_ROLE_KEY` غير متاح على Lovable Cloud. إذا كنت تستخدم Lovable Cloud، أنشئ مشروع Supabase منفصلًا خاصًا بالاختبارات لاستخراج مفتاح الخدمة منه.

### سلوك CI في GitHub Actions

تستخدم الـ CI وظيفتين منفصلتين لاختبارات RLS، وكلتاهما تبدأ بفحص مبكّر للأسرار **قبل** `checkout` و `install` لتجنّب العمل المهدور:

| الوظيفة                | الفرع/الحدث                      | السلوك عند غياب الأسرار        |
| ---------------------- | -------------------------------- | ------------------------------ |
| `rls-tests-main`       | `push` إلى `main` فقط            | فشل فوري (`exit 1`)            |
| `rls-tests-pr`         | PRs من نفس المستودع فقط (لا الـ forks) | تخطٍّ آمن (`skip`) لا يفشل الـ PR |

الوظيفتان تتحققان من وجود الأسرار التالية قبل تشغيل أي خطوة أخرى:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

#### على فرع `main` (`rls-tests-main`)

إذا كان أي سرٍ من الأسرار الثلاثة مفقودًا:

- تُطبع رسالة `::error::` في سجلّ الوظيفة.
- يُكتب ملخّص في `GITHUB_STEP_SUMMARY` بالعنوان:

  ```
  ## ❌ RLS tests failed on main — missing Supabase secrets
  ```

- يتضمّن الملخّص:
  - أن الفحص يجري مبكرًا قبل checkout/install.
  - قائمة بالأسرار الناقصة (مثل `SUPABASE_SERVICE_ROLE_KEY`).
  - رابط مباشر إلى إعدادات أسرار المستودع.
  - ملاحظة أن `SUPABASE_SERVICE_ROLE_KEY` غير متاح على Lovable Cloud.
- تفشل الوظيفة فورًا برمز `1` وتظهر العلامة الحمراء في CI.

إذا كانت جميع الأسرار موجودة، تكتب الوظيفة:

```
✅ All Supabase secrets present — proceeding with checkout, install, and full RLS suite.
```

ثم تُكمل checkout، تثبيت التبعيات، وتشغيل كامل اختبارات `tests/rls/*.test.ts` بصورة صارمة.

#### على طلبات السحب (`rls-tests-pr`)

إذا كانت الأسرار غير مضبوطة:

- تُطبع رسالة `::warning::` في سجلّ الوظيفة.
- يُكتب ملخّص في `GITHUB_STEP_SUMMARY` بالعنوان:

  ```
  ## ⚠️ RLS tests skipped on PR — missing Supabase secrets
  ```

- يتضمّن الملخّص:
  - أن الفحص يجري مبكرًا قبل checkout/install لتخطٍ سريع.
  - قائمة بالأسرار الناقصة.
  - توضيح أن PRs تستطيع التخطّي بينما `main` صارم.
  - رابط إعدادات أسرار المستودع.
  - ملاحظة أن `SUPABASE_SERVICE_ROLE_KEY` غير متاح على Lovable Cloud.
- لا تفشل الوظيفة، ويتم تخطّي خطوات checkout، install، والاختبارات.

### أمثلة لمحتوى `GITHUB_STEP_SUMMARY`

#### مثال على `main` عند غياب `SUPABASE_SERVICE_ROLE_KEY` و `SUPABASE_PUBLISHABLE_KEY`

```markdown
## ❌ RLS tests failed on main — missing Supabase secrets

This early check runs **before** checkout/install to fail fast on `main`.

The following secrets are **required** but missing:
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Add them here: [Repository secrets](https://github.com/owner/repo/settings/secrets/actions)

Note: `SUPABASE_SERVICE_ROLE_KEY` is not available on Lovable Cloud. For full RLS tests you need a separate Supabase project.
```

يعرض سجلّ الوظيفة أيضًا:

```
::error::RLS tests failed on main — missing secrets: SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY. See job summary for details.
```

#### مثال على PR عند غياب كل الأسرار

```markdown
## ⚠️ RLS tests skipped on PR — missing Supabase secrets

This early check runs **before** checkout/install so we skip fast on PRs without wasted work.

The following secrets are missing:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

PR runs are allowed to skip; `main` is strict.

Add them here: [Repository secrets](https://github.com/owner/repo/settings/secrets/actions)

Note: `SUPABASE_SERVICE_ROLE_KEY` is not available on Lovable Cloud. For full tests you need a separate Supabase project; otherwise this job will keep skipping safely on PRs.
```

يعرض سجلّ الوظيفة أيضًا:

```
::warning::RLS tests skipped on PR — missing secrets: SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY. See job summary.
```

> **ملاحظة:** PRs القادمة من `forks` تُستثنى من هذه الوظيفة لأن GitHub لا يكشف أسرار المستودع الأصلي للـ forks.

## حمايات مهمة

- لا يُعرض للمستخدم أي نص خطأ إنجليزي قادم من PostgREST/PL/pgSQL — الرسائل العربية الثابتة فقط.
- `friendlyInsertError` و `FRIENDLY_INSERT_MESSAGES` يُستورَدان من `@/lib/insert-errors` فقط داخل كل مسارات insert (`book.tsx` و `pharmacy.tsx` و API الحجز).
- Pre-commit hook، CI workflow، واختبارات fixture/unit/rls يحرسون هذه القاعدة.
