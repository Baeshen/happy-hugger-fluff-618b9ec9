# استيراد `friendlyInsertError` داخل مسارات book

> يشمل: `src/routes/book.tsx` و `src/routes/api/public/book/**/*.{ts,tsx}`

## الطريقة الصحيحة الوحيدة

```ts
import {
  friendlyInsertError,
  FRIENDLY_INSERT_MESSAGES,
  type FriendlyInsertKey,
} from "@/lib/insert-errors";
```

- المصدر الوحيد المعتمد: `@/lib/insert-errors` (alias مطلق).
- كلا الرمزين ثابتان: لا تُغلَّف، لا تُعاد تصديرها من ملف وسيط، ولا تُنسَخ نصوصها العربية في مكان آخر.
- الرسائل تُعرض للمستخدم كما هي؛ التعديل يتم داخل `src/lib/insert-errors.ts` فقط لكي يبقى المصدر واحدًا لكل من UI (`book.tsx`) والـ API (`api/public/book/create.ts`) والاختبارات (`tests/rls/*`).

## ما الذي يُفشل `bun run lint:book`

القاعدتان مفعّلتان في `eslint.config.js` على block خاص بمسارات book:

### 1. `no-restricted-imports` — منع أي مصدر بديل

يفشل أي استيراد يطابق النمط `*insert-errors*` باستثناء `@/lib/insert-errors`:

```ts
// ✗ خطأ: مسار نسبي
import { friendlyInsertError } from "../lib/insert-errors";
import { friendlyInsertError } from "../../lib/insert-errors";

// ✗ خطأ: نسخة/فرع محلي
import { friendlyInsertError } from "@/features/book/insert-errors";
import { friendlyInsertError } from "@/lib/insert-errors.local";
```

الرسالة:
> استورد friendlyInsertError / FRIENDLY_INSERT_MESSAGES من '@/lib/insert-errors' فقط — لا تعيد تعريفها أو تستوردها من مسار آخر.

### 2. `no-restricted-syntax` — منع إعادة التعريف المحلية

يفشل أي تعريف محلي للاسمين داخل مسارات book:

```ts
// ✗ خطأ: إعادة تعريف الدالة
function friendlyInsertError(err: unknown) { return "..."; }
const friendlyInsertError = (err: unknown) => "...";

// ✗ خطأ: نسخة محلية من جدول الرسائل
const FRIENDLY_INSERT_MESSAGES = { rls: "..." } as const;
```

الرسالة:
> لا تعرّف friendlyInsertError أو FRIENDLY_INSERT_MESSAGES محليًا داخل مسارات book — استوردهما من '@/lib/insert-errors'.

كما يفشل أي `ImportDeclaration` مصدره يحتوي `insert-errors` وليس بالضبط `@/lib/insert-errors` (يمسك أيضًا حالات لم تلتقطها القائمة أعلاه).

## طبقات الحماية

| الطبقة | الأمر | متى تعمل |
|--------|-------|----------|
| Pre-commit hook | `.husky/pre-commit` | تلقائيًا عند `git commit` على أي ملف من book |
| CI | `.github/workflows/ci.yml` → `bun run lint:book` + `bun run typecheck` | على كل PR وعلى الدمج إلى `main` |
| Fixture اختبار | `bash tests/lint/book-guardrails.sh` | يدويًا للتأكد أن القواعد نفسها لا تزال فعّالة |

## عند إضافة رسالة جديدة

1. أضف المفتاح والنص العربي في `FRIENDLY_INSERT_MESSAGES` داخل `src/lib/insert-errors.ts`.
2. أضف الشرط (رمز Postgres أو نمط نصي) داخل `friendlyInsertError`.
3. غطِّه في `tests/rls/friendly-insert-error.test.ts` (shape + real حين أمكن) وفي `tests/rls/book-api-friendly-errors.test.ts`.
4. **لا تغيّر شيئًا داخل `src/routes/book.tsx` أو `src/routes/api/public/book/**`** — سيلتقطها كلاهما تلقائيًا لأن الاستيراد واحد.

### خطوات عملية مفصّلة

لنفترض أنك تريد إضافة رسالة لحالة **تجاوز حد التزامن** (SQLSTATE `40001` — `serialization_failure`) برسالة عربية مسموح بها:
`"النظام مشغول الآن. حاول مرة أخرى بعد لحظات."`

#### 1) `src/lib/insert-errors.ts` — أضف المفتاح داخل الجدول

```ts
export const FRIENDLY_INSERT_MESSAGES = {
  duplicate: "الموعد محجوز مسبقًا. اختر وقتًا آخر.",
  rls:       "تعذر الحفظ. تأكد من الاسم والهاتف وأن التاريخ ليس في الماضي.",
  // ... باقي المفاتيح الحالية ...
  unknown:   "حدث خطأ غير متوقع أثناء الحفظ.",
  busy:      "النظام مشغول الآن. حاول مرة أخرى بعد لحظات.", // ← جديد
} as const;
```

#### 2) نفس الملف — أضف الشرط داخل `friendlyInsertError`

ضع الفحص قبل fallback `unknown` وبعد الفحوصات الأكثر تحديدًا:

```ts
if (code === "40001" || msg.includes("could not serialize access")) {
  return FRIENDLY_INSERT_MESSAGES.busy;
}

return FRIENDLY_INSERT_MESSAGES.unknown;
```

#### 3) `tests/rls/friendly-insert-error.test.ts` — غطِّ الحالتين

```ts
it("يعيد رسالة busy عند رمز 40001", () => {
  expect(friendlyInsertError({ code: "40001", message: "could not serialize access due to concurrent update" }))
    .toBe(FRIENDLY_INSERT_MESSAGES.busy);
});

it("يعيد رسالة busy عند تطابق نصي فقط", () => {
  expect(friendlyInsertError({ message: "could not serialize access" }))
    .toBe(FRIENDLY_INSERT_MESSAGES.busy);
});
```

وإن أمكن أضف اختبار end-to-end في `tests/rls/book-api-friendly-errors.test.ts` يستفزّ الحالة فعليًا على DB.

#### 4) `src/routes/book.tsx` و `src/routes/api/public/book/**` — لا تلمسهما

كلاهما يستدعي `friendlyInsertError(err)` بدون معرفة المفاتيح، فيلتقط `busy` تلقائيًا. أي محاولة لإضافة نص الرسالة أو المفتاح يدويًا داخل هذه المسارات ستُرفض من `bun run lint:book`:

```ts
// ✗ إعادة تعريف الجدول محليًا لإضافة مفتاح جديد
const FRIENDLY_INSERT_MESSAGES = { ...imported, busy: "..." } as const;

```

بدلًا من ذلك اكتفِ باستدعاء واحد:

```ts
// ✓ الصواب — يظهر النص الجديد تلقائيًا بمجرد تحديث src/lib/insert-errors.ts
toast.error(friendlyInsertError(error));
```

#### 5) تحقق قبل الالتزام

```bash
bun run lint:book              # قواعد الحماية على مسارات book
bun run typecheck              # يتحقق من نوع FriendlyInsertKey
bash tests/lint/book-docs-examples.sh   # أمثلة هذه الوثيقة لا تزال متزامنة مع القواعد
```

