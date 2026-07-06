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
