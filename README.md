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

## تشغيل مجموعة الاختبارات الكاملة محليًا

لتشغيل كل ما يُنفّذه CI قبل الـ push، نفّذ الأوامر التالية بالترتيب. بعضها يحتاج إلى الأسرار الثلاثة المذكورة أعلاه.

### 1. فحوصات الشكل والكود

```bash
bun run format:check
bun run lint:inserts
bun run typecheck
```

### 2. فحوصات الوثائق والأمثلة

```bash
bash tests/lint/book-docs-examples.sh
bun tests/unit/book-docs-keys.test.ts
bash tests/lint/book-guardrails.sh
```

### 3. الاختبارات الوحدوية (unit tests)

```bash
set -e
for f in tests/unit/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
```

### 4. اختبارات RLS (تتطلّب Supabase حيًا)

**أولاً: تأكّد من الأسرار**

```bash
set -a; source .env.local; set +a
```

(أو اكتبها يدويًا: `export SUPABASE_URL=...` و `SUPABASE_PUBLISHABLE_KEY=...` و `SUPABASE_SERVICE_ROLE_KEY=...`)

**ثانيًا: شغّل مجموعة RLS كاملة**

```bash
set -e
for f in tests/rls/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
```

أو استخدم السكربت الجاهز:

```bash
bun run check:rls
```

### 5. أمر واحد للمجموعة الكاملة (بعد ضبط الأسرار)

```bash
set -e
bun run format:check
bun run lint:inserts
bun run typecheck
bash tests/lint/book-docs-examples.sh
bun tests/unit/book-docs-keys.test.ts
bash tests/lint/book-guardrails.sh
for f in tests/unit/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
for f in tests/rls/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
```

> **ملاحظة:** قسم `lint-and-typecheck` في CI يشغّل أيضًا `bun run lint:book` عند الحاجة، لكن `lint:inserts` أشمل (book + pharmacy).

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

تجنّب انتظار CI لمعرفة ما إذا كانت الأسرار أو اختبارات RLS تعمل؛ شغّل الاختبارات محليًا أولًا. اتّبع الخطوات التالية بالترتيب.

### 1. تحقّق من الأسرار

نفّذ هذا الأمر لرؤية الأسماء فقط (القيم تبقى مخفيّة):

```bash
env | grep -E '^(SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_SERVICE_ROLE_KEY)='
```

إذا لم يُطبع شيء، الأسرار غير مضبوطة. نفّذ هذا التحقق المفصّل:

```bash
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

### 2. اضبط الأسرار في الجلسة (أو في `.env.local`)

**الخيار أ — يدويًا في الجلسة:**

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

**الخيار ب — ملف `.env.local` (لا ترفعه إلى Git):**

نسّخ الملف المُجهّز `.env.example`:

```bash
cp .env.example .env.local
```

ثم عدّل `.env.local` وضع القيم الحقيقية:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

ثم حمّله قبل كل تشغيل:

```bash
set -a; source .env.local; set +a
```

### 3. شغّل اختبار RLS واحدًا

```bash
bun tests/rls/appointments.rls.test.ts
```

استبدل `appointments.rls.test.ts` بأي ملف آخر تحت `tests/rls/`. أمثلة:

```bash
bun tests/rls/book-api-friendly-errors.test.ts
bun tests/rls/pharmacy-friendly-errors.test.ts
bun tests/rls/appt-reason-too-long.test.ts
```

> **ملاحظة:** إذا لم تستخدم `export` أو `.env.local`، اكتب الأسرار قبل كل أمر:
> ```bash
> SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
>   bun tests/rls/appointments.rls.test.ts
> ```

### 4. شغّل مجموعة RLS كاملة كما يفعل CI

```bash
set -e
for f in tests/rls/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
```

أو استخدم السكربت الجاهز:

```bash
bun run check:rls
```

### 5. تحقّق من النتيجة

- إذا ظهر `✅ جميع اختبارات RLS نجحت`، يمكنك المتابعة.
- إذا ظهر `❌ Missing: ...`، أعد الخطوة 2.
- إذا ظهرت أخطاء في الاختبارات، راجع `tests/rls/` ثم حلّ المشكلة قبل الـ push.

### 6. أمثلة على أخطاء محليّة شائعة

| الخطأ المحلي | السبب | الحل |
| ------------ | ----- | ---- |
| `Missing: SUPABASE_SERVICE_ROLE_KEY` | لم يُضبط السرّ في البيئة | صدّر الأسرار أو حمّل `.env.local`. |
| `fetch failed` / `401 Unauthorized` | `SUPABASE_URL` أو مفتاح خاطئ | تأكّد من تطابق المفاتيح مع المشروع. |
| `permission denied for table` | `SUPABASE_SERVICE_ROLE_KEY` غير صحيح أو RLS مفقود | تأكّد من المفتاح، ومن أن الجداول تملك GRANTs و RLS policies. |
| فشل فقط في بعض ملفّات الـ RLS | تغييرات في السكيما لم تُنفّذ | شغّل آخر migration على قاعدة البيانات المحليّة/الحية. |

### 7. استخدم سكربت `check:rls` كحاجز قبل الـ push

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

## تشغيل الاختبارات في Docker أو Devcontainer (نفس بيئة CI)

CI يستخدم `oven-sh/setup-bun@v2` بإصدار `latest` على Linux. لإعادة إنتاج نفس البيئة محليًا اختَر أحد المسارين التاليين.

### الخيار 1: Docker Compose (موصى به)

المتطلبات: Docker Desktop أو Docker Engine + plugin `compose`.

1. جهّز الأسرار في `.env.local` (انظر قسم `.env.example` أعلاه):
   ```bash
   cp .env.example .env.local
   # عدِّل .env.local وضَع القيم الحقيقية
   ```
2. ابنِ الصورة (مرة واحدة أو بعد تغيير `package.json`):
   ```bash
   docker compose -f docker-compose.test.yml build
   ```
3. شغّل مجموعة الاختبارات الكاملة كما في CI:
   ```bash
   docker compose -f docker-compose.test.yml run --rm tests
   ```
4. لتشغيل أمر واحد فقط داخل الحاوية (مثلاً اختبارات RLS):
   ```bash
   docker compose -f docker-compose.test.yml run --rm tests bash -lc "bun run check:rls"
   ```
5. للدخول تفاعليًا للتصحيح:
   ```bash
   docker compose -f docker-compose.test.yml run --rm tests bash
   ```

### الخيار 2: Dockerfile مباشرة (بدون Compose)

```bash
docker build -f Dockerfile.test -t app-tests .
docker run --rm --env-file .env.local -v "$PWD":/app -w /app app-tests
```

### الخيار 3: Devcontainer (VS Code / Cursor / GitHub Codespaces)

المتطلبات: إضافة **Dev Containers** في VS Code، أو فتح المستودع في Codespaces.

1. جهّز `.env.local` كما في الخيار 1 (Devcontainer يقرأه عبر `runArgs`).
2. افتح المشروع في VS Code ثم نفّذ من لوحة الأوامر:
   `Dev Containers: Reopen in Container`.
3. انتظر انتهاء `postCreateCommand` (يشغّل `bun install` تلقائيًا).
4. من طرفية الحاوية شغّل نفس أوامر CI:
   ```bash
   bun run format:check
   bun run lint
   bun run typecheck
   bun test
   bun run check:rls
   ```

### ملاحظات

- ملف `.env.local` مُستثنى من Git عبر `.gitignore` (`*.local`) ولن يُنسَخ إلى الصورة في `docker build`؛ يُمرَّر وقت التشغيل عبر `--env-file` أو `env_file` في Compose.
- إذا فشل `bun install --frozen-lockfile` لأن lockfile قديم، Dockerfile يقع تلقائيًا على `bun install`.
- على Apple Silicon: الصورة `oven/bun:1-debian` متعددة المعمارية ولا تحتاج `--platform`.

## حمايات مهمة

- لا يُعرض للمستخدم أي نص خطأ إنجليزي قادم من PostgREST/PL/pgSQL — الرسائل العربية الثابتة فقط.
- `friendlyInsertError` و `FRIENDLY_INSERT_MESSAGES` يُستورَدان من `@/lib/insert-errors` فقط داخل كل مسارات insert (`book.tsx` و `pharmacy.tsx` و API الحجز).
- Pre-commit hook، CI workflow، واختبارات fixture/unit/rls يحرسون هذه القاعدة.
