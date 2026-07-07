#!/usr/bin/env bash
# تشغيل GitHub Actions workflow محليًا عبر `act` بنفس أوامر CI حرفيًا.
# الاستخدام:
#   bash scripts/run-act.sh                        # كل الوظائف على حدث push
#   bash scripts/run-act.sh --job lint-and-typecheck
#   bash scripts/run-act.sh --job rls-tests-main --event push
#   bash scripts/run-act.sh --event pull_request
#   bash scripts/run-act.sh --list                 # اعرض الوظائف المتاحة
#   bash scripts/run-act.sh --dry-run              # اطبع الخطوات دون تنفيذ
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

JOB=""
EVENT="push"
DRY=0
LIST=0
EXTRA=()

while [ $# -gt 0 ]; do
  case "$1" in
    --job=*)   JOB="${1#*=}"; shift ;;
    --job|-j)  JOB="$2"; shift 2 ;;
    --event=*) EVENT="${1#*=}"; shift ;;
    --event)   EVENT="$2"; shift 2 ;;
    --list|-l) LIST=1; shift ;;
    --dry-run|-n) DRY=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    --) shift; EXTRA=("$@"); break ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

log() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
err() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

command -v act >/dev/null 2>&1 || {
  err "act غير مثبّت."
  cat >&2 <<'EOF'
ثبّته عبر أحد الطرق التالية:
  brew install act                                        # macOS
  curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
  # أو: gh extension install https://github.com/nektos/gh-act
مطلوب أيضًا Docker يعمل في الخلفية.
EOF
  exit 1
}
command -v docker >/dev/null 2>&1 || { err "docker مطلوب لتشغيل act"; exit 1; }

# ---------- تجهيز ملف الأسرار لـ act ----------
# act يقرأ الأسرار من ملف بصيغة KEY=VALUE. نُعيد استخدام .env.local إذا وُجد.
SECRETS_ARG=()
if [ -f .env.local ]; then
  log "استخدام .env.local كملف أسرار لـ act"
  SECRETS_ARG=(--secret-file .env.local)
elif [ -f .secrets ]; then
  SECRETS_ARG=(--secret-file .secrets)
else
  err "لا يوجد .env.local ولا .secrets — قد تفشل وظائف RLS. أنشئ .env.local من .env.example."
fi

# ---------- عرض الوظائف ----------
if [ "$LIST" -eq 1 ]; then
  log "الوظائف المتاحة في .github/workflows/"
  act --list
  exit 0
fi

# ---------- بناء الأمر ----------
CMD=(act "$EVENT")
[ -n "$JOB" ] && CMD+=(--job "$JOB")
[ "$DRY" -eq 1 ] && CMD+=(--dryrun)
CMD+=("${SECRETS_ARG[@]}")
[ ${#EXTRA[@]} -gt 0 ] && CMD+=("${EXTRA[@]}")

log "تشغيل: ${CMD[*]}"
"${CMD[@]}"
