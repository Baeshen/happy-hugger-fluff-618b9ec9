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

تتطلّب اختبارات RLS مشروع Supabase حقيقيًا. أضِف الأسرار التالية في بيئة التشغيل أو في GitHub Actions:

| المتغير | الغرض | مطلوب على `main` | ملاحظات |
| --- | --- | --- | --- |
| `SUPABASE_URL` | عنوان مشروع Supabase | نعم | يبدأ بـ `https://` وينتهي بـ `.supabase.co`. |
| `SUPABASE_PUBLISHABLE_KEY` | مفتاح العميل (anon/public) | نعم | يُستخدم لمحاكاة المستخدمين المجهولين/المسجّلين. |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح الخدمة | **نعم** | يُستخدم لتهيئة البيانات وتنظيفها بعد الاختبارات. |

### إضافة الأسرار في GitHub

1. افتح المستودع على GitHub.
2. اذهب إلى **Settings → Secrets and variables → Actions → New repository secret**.
3. أضِف كل سرٍّ من الأسرار الثلاثة أعلاه.

> **تنبيه:** `SUPABASE_SERVICE_ROLE_KEY` غير متاح على Lovable Cloud. إذا كنت تستخدم Lovable Cloud، أنشئ مشروع Supabase منفصلًا خاصًا بالاختبارات لاستخراج مفتاح الخدمة منه.

### السلوك في CI

- على فرع `main`: إذا كان أي سرٍّ من الأسرار الثلاثة مفقودًا، تفشل وظيفة `rls-tests` فورًا مع رسالة توضيحية في ملخّص المهمة.
- على طلبات السحب (PRs): إذا كانت الأسرار غير مضبوطة، تُتخطّى الاختبارات مع تحذير واضح في ملخّص المهمة.

## حمايات مهمة

- لا يُعرض للمستخدم أي نص خطأ إنجليزي قادم من PostgREST/PL/pgSQL — الرسائل العربية الثابتة فقط.
- `friendlyInsertError` و `FRIENDLY_INSERT_MESSAGES` يُستورَدان من `@/lib/insert-errors` فقط داخل كل مسارات insert (`book.tsx` و `pharmacy.tsx` و API الحجز).
- Pre-commit hook، CI workflow، واختبارات fixture/unit/rls يحرسون هذه القاعدة.
