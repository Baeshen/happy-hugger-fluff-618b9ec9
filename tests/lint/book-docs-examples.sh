#!/usr/bin/env bash
# يتحقق أن الأمثلة داخل docs/book-friendly-insert-error.md
# لا تزال متوافقة فعليًا مع قواعد `bun run lint:book`:
#   - كل مقتطف مسبوق بـ `// ✗` يجب أن يُفشل lint بالقواعد المتوقعة.
#   - المقتطف الصحيح (الكتلة الأولى) موجود حرفيًا داخل src/routes/book.tsx
#     (المصدر الوحيد للحقيقة).
# يستعيد الملف الأصلي دائمًا حتى عند الفشل.
set -u

DOC="docs/book-friendly-insert-error.md"
FILE="src/routes/book.tsx"
BACKUP="$(mktemp)"

cleanup() {
  cp "$BACKUP" "$FILE"
  rm -f "$BACKUP"
}
trap cleanup EXIT
cp "$FILE" "$BACKUP"

if [ ! -f "$DOC" ]; then
  echo "✗ لم يُعثر على $DOC"
  exit 1
fi

# 1) baseline نظيف قبل أي حقن
BASELINE="$(bun run lint:book 2>&1 || true)"
if echo "$BASELINE" | grep -Eq "no-restricted-(imports|syntax).*insert-errors|insert-errors.*no-restricted"; then
  echo "✗ baseline يحتوي مسبقًا على انتهاكات لقواعد friendlyInsertError:"
  echo "$BASELINE" | grep -E "no-restricted|insert-errors" | head -10
  exit 1
fi

# 2) استخراج الأمثلة من الوثيقة عبر python
mapfile -t BAD_LINES < <(python3 - "$DOC" <<'PY'
import re, sys, pathlib
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
blocks = re.findall(r"```ts\n(.*?)```", text, flags=re.S)
bad = []
for b in blocks:
    lines = b.splitlines()
    mark = False
    for ln in lines:
        s = ln.strip()
        if s.startswith("// ✗"):
            mark = True
            continue
        if not s or s.startswith("//"):
            mark = False
            continue
        if mark:
            bad.append(ln.rstrip())
            mark = False
for ln in bad:
    print(ln)
PY
)

# استخراج الكتلة الصحيحة (الأولى) للتحقق من التطابق مع book.tsx
GOOD_BLOCK="$(python3 - "$DOC" <<'PY'
import re, sys, pathlib
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
blocks = re.findall(r"```ts\n(.*?)```", text, flags=re.S)
for b in blocks:
    if "// ✗" not in b and "from \"@/lib/insert-errors\"" in b:
        print(b, end="")
        break
PY
)"

if [ ${#BAD_LINES[@]} -eq 0 ]; then
  echo "✗ لم أستخرج أي مثال سيئ من $DOC — تأكد من وجود تعليقات '// ✗'."
  exit 1
fi
if [ -z "$GOOD_BLOCK" ]; then
  echo "✗ لم أستخرج المثال الصحيح من $DOC."
  exit 1
fi

echo "→ عدد الأمثلة السيئة المستخرجة: ${#BAD_LINES[@]}"

# 3) تحقق أن المثال الصحيح موجود حرفيًا في book.tsx (المصدر الوحيد للحقيقة)
# نقارن أول 4 أسطر جوهرية من كتلة الاستيراد الصحيحة.
GOOD_KEY='from "@/lib/insert-errors"'
if ! grep -F "$GOOD_KEY" "$BACKUP" >/dev/null; then
  echo "✗ المثال الصحيح في $DOC لا يطابق ما في $FILE (لم يُعثر على استيراد @/lib/insert-errors)."
  exit 1
fi
echo "✓ المثال الصحيح مطابق لما في $FILE"

# 4) لكل مثال سيئ: احقنه في أعلى book.tsx وشغّل lint:book
FAILED=0
for i in "${!BAD_LINES[@]}"; do
  SNIPPET="${BAD_LINES[$i]}"
  echo
  echo "── [حالة $((i+1))/${#BAD_LINES[@]}] ─────────────────────────────"
  echo "  المقتطف: $SNIPPET"

  { echo "$SNIPPET"; cat "$BACKUP"; } > "$FILE"

  OUTPUT="$(bun run lint:book 2>&1)"
  STATUS=$?

  if [ $STATUS -eq 0 ]; then
    echo "  ✗ توقعت فشل lint:book لكنه نجح."
    FAILED=$((FAILED+1))
    cp "$BACKUP" "$FILE"
    continue
  fi

  # لا بد أن يُذكر أحد اسمَي القاعدتين مع insert-errors في الإخراج
  if echo "$OUTPUT" | grep -Eq "no-restricted-(imports|syntax)" \
     && echo "$OUTPUT" | grep -q "insert-errors"; then
    echo "  ✓ فشل lint:book بالقاعدة المتوقعة."
  else
    echo "  ✗ فشل lint:book لكن ليس بسبب قواعد friendlyInsertError."
    echo "$OUTPUT" | tail -20
    FAILED=$((FAILED+1))
  fi

  cp "$BACKUP" "$FILE"
done

echo
if [ $FAILED -gt 0 ]; then
  echo "✗ فشلت $FAILED حالة/حالات من أمثلة الوثيقة."
  exit 1
fi

echo "✓ كل أمثلة $DOC (${#BAD_LINES[@]}) متوافقة مع قواعد lint:book."
exit 0
