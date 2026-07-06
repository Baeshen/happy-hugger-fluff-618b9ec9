#!/usr/bin/env bash
# Fixture: يحقن import سيئًا في src/routes/book.tsx ثم يتأكد أن `bun run lint:book`
# يفشل بسبب قواعد الحماية (no-restricted-imports / no-restricted-syntax) الخاصة
# بـ friendlyInsertError، ثم يستعيد الملف الأصلي بغض النظر عن النتيجة.
set -u

FILE="src/routes/book.tsx"
BACKUP="$(mktemp)"

cleanup() {
  cp "$BACKUP" "$FILE"
  rm -f "$BACKUP"
}
trap cleanup EXIT

cp "$FILE" "$BACKUP"

# حقن استيراد سيئ + إعادة تعريف محلية في أول الملف
{
  echo 'import { friendlyInsertError } from "../lib/insert-errors";'
  echo 'const FRIENDLY_INSERT_MESSAGES = { rls: "x" } as const;'
  cat "$BACKUP"
} > "$FILE"

echo "→ تشغيل bun run lint:book على نسخة مُلوَّثة من book.tsx"
OUTPUT="$(bun run lint:book 2>&1)"
STATUS=$?

echo "$OUTPUT" | tail -40

if [ $STATUS -eq 0 ]; then
  echo "✗ فشل الاختبار: كان يجب أن يفشل lint:book لكنه نجح."
  exit 1
fi

# تحقّق أن الفشل جاء فعلًا من قواعدنا وليس من شيء آخر
MATCHES=0
echo "$OUTPUT" | grep -q "no-restricted-imports" && MATCHES=$((MATCHES+1))
echo "$OUTPUT" | grep -q "no-restricted-syntax"  && MATCHES=$((MATCHES+1))
echo "$OUTPUT" | grep -q "insert-errors"         && MATCHES=$((MATCHES+1))

if [ "$MATCHES" -lt 3 ]; then
  echo "✗ فشل lint:book لكن ليس بسبب قواعد friendlyInsertError المتوقعة (matches=$MATCHES)."
  exit 1
fi

echo "✓ نجح الاختبار: lint:book رفض التغيير برسائل no-restricted-imports/no-restricted-syntax."
exit 0
