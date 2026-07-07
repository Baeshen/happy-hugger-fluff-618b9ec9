#!/usr/bin/env bash
# يحوّل تقرير ci-compare.json إلى صفحة HTML مستقلّة سهلة القراءة.
# الاستخدام:
#   bash scripts/compare-ci-html.sh                       # يقرأ ci-compare.json ويكتب ci-compare.html
#   bash scripts/compare-ci-html.sh --in report.json --out report.html
set -euo pipefail

IN="ci-compare.json"
OUT="ci-compare.html"

while [ $# -gt 0 ]; do
  case "$1" in
    --in=*)  IN="${1#*=}"; shift ;;
    --in)    IN="$2"; shift 2 ;;
    --out=*) OUT="${1#*=}"; shift ;;
    --out)   OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "❌ وسيطة غير معروفة: $1" >&2; exit 2 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "❌ jq مطلوب"; exit 1; }
[ -f "$IN" ] || { echo "❌ لا يوجد $IN — شغّل bun run test:compare-ci أولًا."; exit 1; }

# نمرّر مسار JSON إلى Node/Bun لإنشاء HTML بأمان (هروب صحيح للأحرف الخاصة).
if command -v bun >/dev/null 2>&1;  then RUNNER=bun
elif command -v node >/dev/null 2>&1; then RUNNER=node
else echo "❌ bun أو node مطلوب"; exit 1; fi

INPUT_ABS="$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")"
OUTPUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

"$RUNNER" scripts/compare-ci-html.mjs "$INPUT_ABS" "$OUTPUT_ABS"
echo "✅ التقرير: $OUT"
