#!/usr/bin/env bash
# مقارنة مخرجات تشغيل الاختبارات محليًا (داخل الحاوية أو bun) بمخرجات CI،
# مع إخراج نتيجة منظّمة بصيغة JSON تحتوي على:
#   - meta        : الأمر، الوقت، الطريقة، مصدر سجل CI
#   - local_run   : exit_code, line_count, output_file
#   - ci_run      : line_count, source, output_file
#   - errors      : الأسطر التي تحتوي error/failed/❌/::error/::warning
#   - differences : اختلافات سطرًا-بسطر بعد التطبيع
#
# الاستخدام:
#   bash scripts/compare-ci.sh --ci-log ci.log
#   bash scripts/compare-ci.sh --ci-log ci.log --method=docker
#   bash scripts/compare-ci.sh --gh-run <run-id>        # يتطلّب `gh` CLI مصادَقًا
#   bash scripts/compare-ci.sh --ci-log ci.log --out report.json
#   bash scripts/compare-ci.sh --ci-log ci.log --no-run --local-log prev.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CI_LOG=""
GH_RUN=""
METHOD="auto"
OUT="ci-compare.json"
RUN_LOCAL=1
LOCAL_LOG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --ci-log=*)    CI_LOG="${1#*=}"; shift ;;
    --ci-log)      CI_LOG="$2"; shift 2 ;;
    --gh-run=*)    GH_RUN="${1#*=}"; shift ;;
    --gh-run)      GH_RUN="$2"; shift 2 ;;
    --method=*)    METHOD="${1#*=}"; shift ;;
    --method)      METHOD="$2"; shift 2 ;;
    --out=*)       OUT="${1#*=}"; shift ;;
    --out)         OUT="$2"; shift 2 ;;
    --no-run)      RUN_LOCAL=0; shift ;;
    --local-log=*) LOCAL_LOG="${1#*=}"; shift ;;
    --local-log)   LOCAL_LOG="$2"; shift 2 ;;
    -h|--help)     sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "❌ وسيطة غير معروفة: $1" >&2; exit 2 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "❌ jq مطلوب (brew install jq / apt install jq)"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------- 1) جلب سجل CI ----------
CI_RAW="$TMP/ci.raw"
CI_SOURCE=""
if [ -n "$GH_RUN" ]; then
  command -v gh >/dev/null 2>&1 || { echo "❌ gh CLI غير مثبّت"; exit 1; }
  echo "▶ تنزيل سجل CI عبر gh run view $GH_RUN"
  gh run view "$GH_RUN" --log > "$CI_RAW"
  CI_SOURCE="gh:$GH_RUN"
elif [ -n "$CI_LOG" ]; then
  [ -f "$CI_LOG" ] || { echo "❌ ملف CI غير موجود: $CI_LOG"; exit 1; }
  cp "$CI_LOG" "$CI_RAW"
  CI_SOURCE="file:$CI_LOG"
else
  echo "❌ حدّد --ci-log <path> أو --gh-run <id>"; exit 2
fi

# ---------- 2) تشغيل/قراءة السجل المحلي ----------
LOCAL_RAW="$TMP/local.raw"
LOCAL_EXIT=0
if [ "$RUN_LOCAL" -eq 1 ]; then
  echo "▶ تشغيل مجموعة الاختبارات محليًا (method=$METHOD)"
  set +e
  bash scripts/run-tests.sh --method="$METHOD" > "$LOCAL_RAW" 2>&1
  LOCAL_EXIT=$?
  set -e
elif [ -n "$LOCAL_LOG" ] && [ -f "$LOCAL_LOG" ]; then
  cp "$LOCAL_LOG" "$LOCAL_RAW"
else
  echo "❌ استخدم --no-run مع --local-log <path>"; exit 2
fi

# ---------- 3) تطبيع الأسطر (إزالة ألوان/طوابع/بادئات GitHub) ----------
normalize() {
  # يحذف: ANSI, طوابع GitHub Actions (2024-01-01T..Z), بادئة "job/step  ",
  #        رموز "::group::" و "::endgroup::", ومسافات نهاية السطر.
  sed -E \
    -e 's/\x1B\[[0-9;]*[A-Za-z]//g' \
    -e 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z[[:space:]]*//' \
    -e 's/^[^|]+\|[[:space:]]*//' \
    -e '/^::(group|endgroup|debug)::/d' \
    -e 's/[[:space:]]+$//' \
  | grep -vE '^[[:space:]]*$' || true
}

CI_NORM="$TMP/ci.norm"
LOCAL_NORM="$TMP/local.norm"
normalize < "$CI_RAW"    > "$CI_NORM"
normalize < "$LOCAL_RAW" > "$LOCAL_NORM"

# ---------- 4) الأخطاء ----------
extract_errors() {
  grep -nE '❌|✗|::error|::warning|FAIL|failed|Error:|permission denied|Unauthorized' "$1" \
    | jq -R -s -c 'split("\n") | map(select(length>0) | capture("^(?<line>[0-9]+):(?<text>.*)$") | {line: (.line|tonumber), text: .text})'
}
LOCAL_ERRS=$(extract_errors "$LOCAL_NORM")
CI_ERRS=$(extract_errors "$CI_NORM")

# ---------- 5) الاختلافات سطرًا-بسطر عبر diff الموحّد ----------
DIFF_JSON="$TMP/diff.json"
diff -u --label ci --label local "$CI_NORM" "$LOCAL_NORM" > "$TMP/diff.raw" || true

# حوّل diff الموحّد إلى JSON منظّم:
#   { hunk_header, ci_only[], local_only[] } لكل hunk
awk '
  BEGIN { printf "[" ; first=1 }
  /^@@/ {
    if (!first) printf "]},"
    printf "{\"hunk\":\"%s\",\"ci_only\":[", $0
    first=0; state="hunk"; local_started=0; ci_first=1; local_first=1
    next
  }
  state=="hunk" && /^-[^-]/ {
    line=substr($0,2); gsub(/"/,"\\\"",line); gsub(/\\/,"\\\\",line)
    if (!ci_first) printf ","
    printf "\"%s\"", line; ci_first=0
    next
  }
  state=="hunk" && /^\+[^+]/ {
    if (!local_started) { printf "],\"local_only\":["; local_started=1 }
    line=substr($0,2); gsub(/"/,"\\\"",line); gsub(/\\/,"\\\\",line)
    if (!local_first) printf ","
    printf "\"%s\"", line; local_first=0
    next
  }
  END {
    if (!first) {
      if (!local_started) printf "],\"local_only\":["
      printf "]}"
    }
    printf "]"
  }
' "$TMP/diff.raw" > "$DIFF_JSON" || echo "[]" > "$DIFF_JSON"

# تحقّق أن الناتج JSON صالح؛ وإلا استبدله بمصفوفة فارغة
jq empty "$DIFF_JSON" 2>/dev/null || echo "[]" > "$DIFF_JSON"

# ---------- 6) تجميع التقرير النهائي ----------
CI_LINES=$(wc -l < "$CI_NORM" | tr -d ' ')
LOCAL_LINES=$(wc -l < "$LOCAL_NORM" | tr -d ' ')

jq -n \
  --arg generated_at "$(date -u +%FT%TZ)" \
  --arg method "$METHOD" \
  --arg ci_source "$CI_SOURCE" \
  --arg ci_file "$CI_NORM" \
  --arg local_file "$LOCAL_NORM" \
  --argjson local_exit "$LOCAL_EXIT" \
  --argjson ci_lines "$CI_LINES" \
  --argjson local_lines "$LOCAL_LINES" \
  --argjson local_errors "$LOCAL_ERRS" \
  --argjson ci_errors "$CI_ERRS" \
  --slurpfile diffs "$DIFF_JSON" \
  '{
    meta: {
      generated_at: $generated_at,
      method: $method,
      ci_source: $ci_source,
      normalization: "strip ANSI, GH timestamps, job/step prefixes, ::group::/::endgroup::, trailing ws, blank lines"
    },
    local_run: { exit_code: $local_exit, line_count: $local_lines, normalized_log: $local_file },
    ci_run:    { line_count: $ci_lines,   source: $ci_source,      normalized_log: $ci_file },
    summary: {
      local_error_count: ($local_errors|length),
      ci_error_count:    ($ci_errors|length),
      diff_hunks:        ($diffs[0]|length),
      match:             (($diffs[0]|length) == 0 and $local_exit == 0)
    },
    errors:      { local: $local_errors, ci: $ci_errors },
    differences: $diffs[0]
  }' > "$OUT"

echo ""
echo "✅ التقرير: $OUT"
jq '.summary' "$OUT"
