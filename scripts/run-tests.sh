#!/usr/bin/env bash
# سكربت CLI لتشغيل مجموعة الاختبارات كاملة محليًا.
# يختار تلقائيًا الطريقة المناسبة بالترتيب التالي:
#   1. داخل Devcontainer/Docker بالفعل  → تشغيل مباشر بـ bun
#   2. docker compose متاح             → docker-compose.test.yml
#   3. docker (بدون compose) متاح      → Dockerfile.test
#   4. bun محلي متاح                    → تشغيل مباشر
# استخدام:
#   bash scripts/run-tests.sh                 # كل الاختبارات
#   bash scripts/run-tests.sh --method=bun    # فرض طريقة معيّنة
#   bash scripts/run-tests.sh --no-rls        # تخطّي اختبارات RLS
#   bash scripts/run-tests.sh -- bun test x   # مرّر أمرًا مخصّصًا للحاوية
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

METHOD="auto"
RUN_RLS=1
WATCH=0
WATCH_PATHS=(src tests scripts package.json Dockerfile.test docker-compose.test.yml)
CUSTOM_CMD=()

# ---------- تحليل الوسائط ----------
while [ $# -gt 0 ]; do
  case "$1" in
    --method=*) METHOD="${1#*=}"; shift ;;
    --method)   METHOD="$2"; shift 2 ;;
    --no-rls)   RUN_RLS=0; shift ;;
    --watch|-w) WATCH=1; shift ;;
    --watch-path=*) WATCH_PATHS+=("${1#*=}"); shift ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0 ;;
    --) shift; CUSTOM_CMD=("$@"); break ;;
    *)  echo "❌ وسيطة غير معروفة: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
err() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

# ---------- الأوامر الافتراضية ----------
# ---------- الأوامر الافتراضية (مطابقة لخطوات CI بالترتيب) ----------
# مصدر الحقيقة: .github/workflows/ci.yml (jobs: lint-and-typecheck, rls-tests-*)
if [ ${#CUSTOM_CMD[@]} -eq 0 ]; then
  BASE_CMD='set -e && \
bun install --frozen-lockfile && \
bun run format:check && \
bun run lint:inserts && \
bash tests/lint/book-docs-examples.sh && \
bun tests/unit/book-docs-keys.test.ts && \
for f in tests/unit/*.test.ts; do echo "── $f ──"; bun "$f"; done && \
bun run typecheck'
  if [ "$RUN_RLS" -eq 1 ]; then
    FULL_CMD="$BASE_CMD && bun run check:rls"
  else
    FULL_CMD="$BASE_CMD"
  fi
else
  FULL_CMD="${CUSTOM_CMD[*]}"
fi

# ---------- كشف البيئة الحالية ----------
in_container() {
  [ -f /.dockerenv ] || grep -qE '(docker|containerd|kubepods)' /proc/1/cgroup 2>/dev/null \
    || [ -n "${REMOTE_CONTAINERS:-}${CODESPACES:-}${DEVCONTAINER:-}" ]
}

has() { command -v "$1" >/dev/null 2>&1; }

# ---------- اختيار الطريقة ----------
if [ "$METHOD" = "auto" ]; then
  if in_container; then
    METHOD="bun"
  elif has docker && docker compose version >/dev/null 2>&1; then
    METHOD="compose"
  elif has docker; then
    METHOD="docker"
  elif has bun; then
    METHOD="bun"
  else
    err "لم أجد docker ولا bun. ثبّت أحدهما ثم أعد المحاولة."
    exit 1
  fi
fi

log "الطريقة المختارة: $METHOD"

# ---------- تحقّق من .env.local عند الحاجة ----------
need_env_file() {
  if [ "$RUN_RLS" -eq 1 ] && [ "$METHOD" != "bun" ] && [ ! -f .env.local ]; then
    err ".env.local غير موجود. انسخ .env.example وعبّئ القيم:"
    echo "    cp .env.example .env.local && \$EDITOR .env.local" >&2
    exit 1
  fi
}

# ---------- منفّذ الجولة الواحدة ----------
run_once() {
  case "$METHOD" in
    bun)
      has bun || { err "bun غير مثبّت في المسار."; return 1; }
      if [ "$RUN_RLS" -eq 1 ] && [ -f .env.local ] && [ -z "${SUPABASE_URL:-}" ]; then
        log "تحميل .env.local"; set -a; . ./.env.local; set +a
      fi
      log "تنفيذ: $FULL_CMD"
      bash -lc "$FULL_CMD"
      ;;
    compose)
      need_env_file
      [ -f docker-compose.test.yml ] || { err "docker-compose.test.yml غير موجود."; return 1; }
      log "بناء الصورة (إن لزم)"
      docker compose -f docker-compose.test.yml build
      log "تنفيذ داخل Compose: $FULL_CMD"
      docker compose -f docker-compose.test.yml run --rm tests bash -lc "$FULL_CMD"
      ;;
    docker)
      need_env_file
      [ -f Dockerfile.test ] || { err "Dockerfile.test غير موجود."; return 1; }
      log "بناء الصورة app-tests"
      docker build -f Dockerfile.test -t app-tests .
      ENV_ARG=()
      [ -f .env.local ] && ENV_ARG=(--env-file .env.local)
      log "تنفيذ داخل Docker: $FULL_CMD"
      docker run --rm "${ENV_ARG[@]}" -v "$PWD":/app -w /app app-tests bash -lc "$FULL_CMD"
      ;;
    *)
      err "طريقة غير معروفة: $METHOD (المسموح: auto|bun|compose|docker)"; return 2 ;;
  esac
}

# ---------- مراقب الملفات ----------
watch_loop() {
  local existing=()
  for p in "${WATCH_PATHS[@]}"; do [ -e "$p" ] && existing+=("$p"); done
  [ ${#existing[@]} -gt 0 ] || { err "لا مسارات صالحة للمراقبة."; exit 1; }
  log "مراقبة: ${existing[*]}"
  run_once || true

  if has entr; then
    log "watcher: entr"
    while true; do
      find "${existing[@]}" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' -o -name '*.sh' -o -name '*.yml' -o -name 'Dockerfile*' \) \
        | entr -d -p bash -c 'exit 0' >/dev/null 2>&1 || true
      log "تغيير مُكتشف — إعادة التشغيل"
      run_once || true
    done
  elif has inotifywait; then
    log "watcher: inotifywait"
    while true; do
      inotifywait -qq -r -e modify,create,delete,move "${existing[@]}" || true
      log "تغيير مُكتشف — إعادة التشغيل"
      sleep 0.3
      run_once || true
    done
  elif has fswatch; then
    log "watcher: fswatch"
    fswatch -o -l 0.5 "${existing[@]}" | while read -r _; do
      log "تغيير مُكتشف — إعادة التشغيل"
      run_once || true
    done
  else
    log "watcher: polling (ثبّت entr/inotify-tools/fswatch لأداء أفضل)"
    touch /tmp/.run-tests-tick
    while sleep 2; do
      if find "${existing[@]}" -type f -newer /tmp/.run-tests-tick 2>/dev/null | grep -q .; then
        touch /tmp/.run-tests-tick
        log "تغيير مُكتشف — إعادة التشغيل"
        run_once || true
      fi
    done
  fi
}

# ---------- التنفيذ ----------
if [ "$WATCH" -eq 1 ]; then
  trap 'echo; ok "توقّف المراقب."; exit 0' INT TERM
  watch_loop
else
  run_once
  ok "انتهت مجموعة الاختبارات بنجاح."
fi
