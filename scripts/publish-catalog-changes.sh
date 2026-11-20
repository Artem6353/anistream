#!/usr/bin/env bash
set -euo pipefail

# Публикация изменений каталога через pull request.
#
# Причина (аудит B0, 2026-11-19): main защищён правилом
# «Changes must be made through a pull request». Прежний helper
# `push-catalog-commit.sh` делал `git push origin HEAD:main`, поэтому
# sync-catalog/hydrate/repair не могли доставить даже уже собранный батч.
#
# Этот helper НИКОГДА не пушит в main:
#   1) выкладывает текущий HEAD в отдельную bot-ветку;
#   2) находит открытый PR этой ветки или создаёт новый;
#   3) переиспользует один rolling PR, чтобы не плодить PR каждые 6 часов.
#
# Обязательные env:
#   GITHUB_TOKEN       — токен workflow (contents: write, pull-requests: write)
#   GITHUB_REPOSITORY  — owner/repo
# Необязательные env:
#   CATALOG_PR_BASE    — целевая ветка (по умолчанию main)
#   CATALOG_PR_BRANCH  — bot-ветка (по умолчанию automation/catalog-sync)
#   CATALOG_PR_TITLE   — заголовок PR
#   GITHUB_RUN_ID, GITHUB_SERVER_URL — ссылка на run в теле PR
#
# Коды выхода: 0 — опубликовано/нечего публиковать; 1 — ошибка (fail closed).

BASE="${CATALOG_PR_BASE:-main}"
HEAD_BRANCH="${CATALOG_PR_BRANCH:-automation/catalog-sync}"
TITLE="${CATALOG_PR_TITLE:-chore(catalog): автоматическое обновление каталога}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
REPO="${GITHUB_REPOSITORY:-}"

fail() {
  echo "::error::$*" >&2
  exit 1
}

[ -n "$TOKEN" ] || fail "GITHUB_TOKEN не задан — PR-публикация невозможна"
[ -n "$REPO" ] || fail "GITHUB_REPOSITORY не задан (ожидается owner/repo)"

OWNER="${REPO%%/*}"
API="https://api.github.com/repos/$REPO"

# Незакоммиченные изменения нельзя терять молча: workflow обязан закоммитить батч.
if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "в рабочем дереве есть незакоммиченные изменения — сначала commit, затем публикация"
fi

git rev-parse --verify --quiet "refs/remotes/origin/$BASE" >/dev/null || git fetch origin "$BASE"
BASE_SHA="$(git rev-parse "refs/remotes/origin/$BASE")"
HEAD_SHA="$(git rev-parse HEAD)"

if [ "$HEAD_SHA" = "$BASE_SHA" ]; then
  echo "каталог не изменился относительно origin/$BASE — PR не нужен"
  exit 0
fi

AHEAD="$(git rev-list --count "refs/remotes/origin/$BASE..HEAD")"
if [ "$AHEAD" -eq 0 ]; then
  echo "HEAD не содержит коммитов сверх origin/$BASE — PR не нужен"
  exit 0
fi

# Выкладываем bot-ветку. Force-with-lease разрешён только для неё: main не трогаем.
git fetch --quiet origin "+refs/heads/$HEAD_BRANCH:refs/remotes/origin/$HEAD_BRANCH" 2>/dev/null || true
if git show-ref --verify --quiet "refs/remotes/origin/$HEAD_BRANCH"; then
  REMOTE_SHA="$(git rev-parse "refs/remotes/origin/$HEAD_BRANCH")"
  git push --force-with-lease="refs/heads/$HEAD_BRANCH:$REMOTE_SHA" origin "HEAD:refs/heads/$HEAD_BRANCH"
else
  git push origin "HEAD:refs/heads/$HEAD_BRANCH"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

api_curl() {
  curl -sS \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$@"
}

encoded_head="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$OWNER:$HEAD_BRANCH")"
prs_file="$work/pulls.json"
prs_code="$(api_curl -o "$prs_file" -w '%{http_code}' \
  "$API/pulls?state=open&head=$encoded_head&per_page=1" || true)"

if [ "$prs_code" != "200" ]; then
  fail "GitHub API: не удалось получить список PR (HTTP $prs_code): $(head -c 300 "$prs_file" 2>/dev/null || true)"
fi

existing_url="$(node -e '
const fs = require("fs");
try {
  const list = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (Array.isArray(list) && list[0] && list[0].html_url) process.stdout.write(list[0].html_url);
} catch {}
' "$prs_file")"

if [ -n "$existing_url" ]; then
  echo "PR уже открыт и обновлён: $existing_url"
  exit 0
fi

RUN_URL=""
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
  RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
fi

STAT_LINE="$(git diff --stat "refs/remotes/origin/$BASE..HEAD" | tail -n 1 || true)"
FILES="$(git diff --name-only "refs/remotes/origin/$BASE..HEAD" | head -n 12 || true)"

BODY="Автоматический снимок каталога, собранный workflow.

- Коммитов: $AHEAD
- Изменения: $STAT_LINE
- Run: ${RUN_URL:-не указан}

Файлы:
\`\`\`
${FILES:-нет}
\`\`\`

Проверки (validate-catalog, quality gate) уже выполнены в workflow до публикации.
Ветка бота переиспользуется: новый прогон обновит этот же PR.
Не мержить без просмотра diff: каталог меняется автоматически."

payload="$work/payload.json"
node -e '
const fs = require("fs");
const [file, head, base, title, body] = process.argv.slice(1);
fs.writeFileSync(file, JSON.stringify({ head, base, title, body }));
' "$payload" "$HEAD_BRANCH" "$BASE" "$TITLE" "$BODY"

response="$work/pull.json"
create_code="$(api_curl -o "$response" -w '%{http_code}' \
  -X POST "$API/pulls" \
  -H 'Content-Type: application/json' \
  --data-binary "@$payload" || true)"

case "$create_code" in
  201)
    created_url="$(node -e '
const fs = require("fs");
const pr = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(pr.html_url || "");
' "$response")"
    [ -n "$created_url" ] || fail "PR создан, но GitHub не вернул html_url"
    echo "PR создан: $created_url"
    ;;
  422)
    # Гонка: PR мог быть создан параллельным прогоном. Перечитываем и не падаем,
    # если PR существует; иначе 422 означает реальную ошибку валидации.
    api_curl -o "$prs_file" -w '' "$API/pulls?state=open&head=$encoded_head&per_page=1" || true
    race_url="$(node -e '
const fs = require("fs");
try {
  const list = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (Array.isArray(list) && list[0] && list[0].html_url) process.stdout.write(list[0].html_url);
} catch {}
' "$prs_file")"
    if [ -n "$race_url" ]; then
      echo "PR уже существует (гонка прогонов): $race_url"
      exit 0
    fi
    fail "GitHub отклонил создание PR (HTTP 422): $(head -c 500 "$response" 2>/dev/null || true)"
    ;;
  *)
    fail "GitHub API: создание PR не удалось (HTTP $create_code): $(head -c 500 "$response" 2>/dev/null || true)"
    ;;
esac
