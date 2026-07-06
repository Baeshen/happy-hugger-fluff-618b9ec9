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

## اختبار الأسرار و RLS محليًا قبل تشغيل CI

تجنّب انتظار CI لمعرفة ما إذا كانت الأسرار أو اختبارات RLS تعمل؛ شغّل الاختبارات محليًا أولًا.

### 1. تأكّد من توفّر الأسرار

أيّ من الأوامر التالية يكشف ما إذا كانت الأسرار الثلاثة مضبوطة في البيئة الحالية:

```bash
# طريقة 1: اعرض الأسماء فقط (القيم تبقى مخفيّة)
env | grep -E '^(SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_SERVICE_ROLE_KEY)=' || echo "One or more secrets are missing"

# طريقة 2: تحقق سريع من أنها ليست فارغة
bash -c '
  missing=()
  [ -z "$SUPABASE_URL" ]              && missing+=("SUPABASE_URL")
  [ -z "$SUPABASE_PUBLISHABLE_KEY" ]  && missing+=("SUPABASE_PUBLISHABLE_KEY")
  [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && missing+=("SUPABASE_SERVICE_ROLE_KEY")
  if [ ${#missing[@]} -gt 0 ]; then
    echo "❌ Missing: ${missing[*]}"
    exit 1
  fi
  echo "✅ All Supabase secrets are set"
'
```

### 2. ضع الأسرار في ملف `.env` محلي (اختياري)

إذا أردت عدم كتابتها في كل أمر، أنشئ ملفًا باسم `.env.local` (لا ترفعه إلى Git) يحتوي على:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

ثم شغّل الاختبارات مع تحميلها:

```bash
set -a; source .env.local; set +a
```

### 3. شغّل اختبار RLS واحدًا

```bash
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  bun tests/rls/appointments.rls.test.ts
```

استبدل `appointments.rls.test.ts` بأي ملف آخر تحت `tests/rls/`.

### 4. شغّل كامل مجموعة RLS كما يفعل CI

```bash
set -e
for f in tests/rls/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
```

### 5. أمثلة على أخطاء محليّة شائعة

| الخطأ المحلي | السبب | الحل |
| ------------ | ----- | ---- |
| `Missing: SUPABASE_SERVICE_ROLE_KEY` | لم يُضبط السرّ في البيئة | صدّر الأسرار أو حمّل `.env.local`. |
| `fetch failed` / `401 Unauthorized` | `SUPABASE_URL` أو مفتاح خاطئ | تأكّد من تطابق المفاتيح مع المشروع. |
| `permission denied for table` | `SUPABASE_SERVICE_ROLE_KEY` غير صحيح أو RLS مفقود | تأكّد من المفتاح، ومن أن الجداول تملك GRANTs و RLS policies. |
| فشل فقط في بعض ملفّات الـ RLS | تغييرات في السكيما لم تُنفّذ | شغّل آخر migration على قاعدة البيانات المحليّة/الحية. |

### 6. استخدم سكربت `check:rls` كحاجز قبل الـ push

المشروع يتضمّن سكربتًا (`scripts/pre-push-rls-checks.sh`) يُنفّذ نفس فحوصات CI محليًا قبل أي `push`. يتحقّق من الأسرار ثم يشغّل كل ملفّات `tests/rls/*.test.ts`.

تشغيله يدويًا:

```bash
bun run check:rls
```

أو مع تحميل أسرار من `.env.local`:

```bash
set -a; source .env.local; set +a
bun run check:rls
```

> **تنبيه:** إذا كانت الأسرار غير مضبوطة، سيفشل السكربت فورًا ويمنع تشغيل الاختبارات — تمامًا كما تفعل وظيفة `rls-tests-main` على `main`.

#### تفعيله كـ `pre-push` hook (اختياري)

إذا كنت تستخدم `husky` (مفعّل تلقائيًا عبر `bun run prepare`)، فالسكربت مفعّل كـ `pre-push` hook بالفعل ويمنع أي `push` يكسر اختبارات RLS أو يفتقر إلى الأسرار. لتشغيله يدويًا أو تجاوزه:

```bash
# تفعيل الـ hooks (مرة واحدة بعد الاستنساخ)
bun run prepare

# تجاوز الـ pre-push في دفعة واحدة (مثال: push عاجل)
git push --no-verify
```

## استكشاف أخطاء CI المتعلقة بالأسرار

| العَرَض | السبب المحتمل | الحل |
| -------- | -------------- | ---- |
| `## ❌ RLS tests failed on main — missing Supabase secrets` في `GITHUB_STEP_SUMMARY` | واحد أو أكثر من أسرار Supabase غير مضبوط في Repository secrets | أضِف الأسرار الناقصة في **Settings → Secrets and variables → Actions** بأسمائها بالضبط: `SUPABASE_URL`، `SUPABASE_PUBLISHABLE_KEY`، `SUPABASE_SERVICE_ROLE_KEY`. |
| `## ⚠️ RLS tests skipped on PR — missing Supabase secrets` | نفس الأسباب السابقة لكن على PR | اختياري على PR؛ إذا أردت تشغيل الاختبارات على PR أضِف الأسرار. إذا كنت تستخدم Lovable Cloud، فالتخطّي المتكرّر متوقّع. |
| لا يظهر وظيفة `rls-tests-pr` في CI لـ PR | الـ PR قادم من `fork` | الوظيفة تُستثني الـ forks لأن GitHub لا يكشف أسرار المستودع الأصلي للـ forks. ادمج الفرع في المستودع الأصلي أولًا. |
| الاختبارات تفشل بعد الفحص المبكّر مع خطأ `401 Unauthorized` أو `403 Forbidden` | مفتاح خاطئ أو عنوان مشروع غير صحيح | تأكّد من أن `SUPABASE_URL` يبدأ بـ `https://` وينتهي بـ `.supabase.co`، وأن المفتاح المستخدَم يتطابق مع المشروع (لا تخلط بين مفتاحي `PUBLISHABLE` و `SERVICE_ROLE`). |
| لا أستطيع الحصول على `SUPABASE_SERVICE_ROLE_KEY` | Lovable Cloud لا يوفّر مفتاح الخدمة | أنشئ مشروع Supabase منفصلًا خاصًا بالاختبارات واستخدم `SUPABASE_SERVICE_ROLE_KEY` الخاص به. |
| تكرار رسالة التخطّي على كل PR | الأسرار مضبوطة لكن الوظيفة ما زالت تتخطّى | تأكّد أن الأسرار مضبوطة في **Repository secrets** (وليس Environment secrets فقط)، وأن أسماؤها متطابقة تمامًا (حسّاسة لحالة الأحرف). |

### قائمة مرجعية سريعة

1. افتح المستودع على GitHub.
2. اذهب إلى **Settings → Secrets and variables → Actions**.
3. تحقّق من وجود الأسرار الثلاثة بالأسماء التالية:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. إذا كانت ناقصة، أضِفها بقيمها الصحيحة.
5. أعد تشغيل الوظيفة (re-run) في GitHub Actions.

## حمايات مهمة

- لا يُعرض للمستخدم أي نص خطأ إنجليزي قادم من PostgREST/PL/pgSQL — الرسائل العربية الثابتة فقط.
- `friendlyInsertError` و `FRIENDLY_INSERT_MESSAGES` يُستورَدان من `@/lib/insert-errors` فقط داخل كل مسارات insert (`book.tsx` و `pharmacy.tsx` و API الحجز).
- Pre-commit hook، CI workflow، واختبارات fixture/unit/rls يحرسون هذه القاعدة.
