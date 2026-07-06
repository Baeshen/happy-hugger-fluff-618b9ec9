#!/usr/bin/env bash
set -euo pipefail

# فحص مبكّر للأسرار المطلوبة لاختبارات RLS (نفس منطق CI)
# يُستخدم كـ pre-push hook أو يدويًا عبر: bun run check:rls

missing=()
[ -z "${SUPABASE_URL:-}" ]              && missing+=("SUPABASE_URL")
[ -z "${SUPABASE_PUBLISHABLE_KEY:-}" ]  && missing+=("SUPABASE_PUBLISHABLE_KEY")
[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && missing+=("SUPABASE_SERVICE_ROLE_KEY")

if [ ${#missing[@]} -gt 0 ]; then
  echo "❌ فشل فحص RLS قبل الـ push — الأسرار الناقصة: ${missing[*]}"
  echo ""
  echo "المطلوب: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY"
  echo "يمكنك ضبطها مؤقتًا:"
  echo "  SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SERVICE_ROLE_KEY=... bun run check:rls"
  echo "أو وضعها في ملف .env.local ثم: source .env.local && bun run check:rls"
  exit 1
fi

echo "✅ جميع أسرار Supabase موجودة — جارٍ تشغيل اختبارات RLS..."

failed=0
for f in tests/rls/*.test.ts; do
  echo "── $f ──"
  if ! bun "$f"; then
    failed=$((failed + 1))
  fi
done

if [ "$failed" -gt 0 ]; then
  echo ""
  echo "❌ $failed ملف(ملفات) من اختبارات RLS فشلت. تم رفض الـ push."
  exit 1
fi

echo ""
echo "✅ جميع اختبارات RLS نجحت — يمكن المتابعة بالـ push."
