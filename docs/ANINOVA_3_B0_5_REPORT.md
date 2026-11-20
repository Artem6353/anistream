# AniNova 3.0 — B0.5: Foundation Stabilization Report

**Дата:** 2026-11-20 (UTC)  
**Этап:** B0.5 (review + foundation stabilization; B1 не начинался)  
**Baseline:** `main` @ `6ed9d1c` — не изменялся  
**Production:** `https://aninova-catalog.vercel.app/` — не деплоился  
**Связанные документы:** `docs/ANINOVA_3_AUDIT.md`, `docs/ANINOVA_3_ARCHITECTURE.md`, `docs/ANINOVA_3_RISK_REGISTER.md`, `docs/ANINOVA_3_BACKUP_RESTORE.md`

**Итоговый статус B0.5:** `PARTIAL`.

Причина: PR-flow и least-privilege fixes подготовлены и проверены локально, но не запушены/не открыты PR (нет GitHub auth); CodeQL/Dependabot/branch protection/Supabase Advisors/Vercel logs недоступны без токенов; полный DB backup и restore drill не выполнены. B1 не начат.

---

## 0. Краткий итог по задачам

| Задача | Статус | Что сделано | Что осталось |
|---|---|---|---|
| A. GitHub PR-flow | `PARTIAL` | Найдена причина падения `sync-catalog`; helper публикует в bot-ветку + rolling PR; 10 Python-тестов; exec-bit; artifact на падении; least-privilege workflows | Push веток, открыть PR, прогнать Linux CI, `workflow_dispatch` dry-run |
| B. Security | `PARTIAL` / `BLOCKED` | Actions runs/annotations получены; `npm audit --omit=dev` = 0; findings F-03/F-06/F-16/F-17/F-18 с file:line; workflows permissions исправлены в ветке | CodeQL alerts, Dependabot alerts, branch protection, Advisors, Vercel logs — нужен токен |
| C. Auth F-03/F-04 | `PARTIAL` (план) | План миграции legacy localStorage → cookie-SSR/native secure storage, полный lifecycle, guest merge, rollback | Реализация и security-тесты — B4; старый контур не удалён |
| D. F-06 RLS | `PARTIAL` (план) | Аудит всех зависимостей; staging-тест; migration SQL; rollback | Применение миграции после staging; не закрывать до проверки |
| E. F-02 DB fallback | `PARTIAL` (диагноз) | Воспроизведено локально; production остаётся `file`; найдена причина (кэш `0` + 8 с + freeze); план | Диагностика prime, retry, projection, замер на Vercel, тесты |
| F. Backup/restore | `PARTIAL` / `BLOCKED` | Локальные file/WIP-бэкапы проверены; исправлена ложная команда проверки; полный backup задокументирован | `pg_dump`/PITR, restore drill, Storage objects — нет доступа |

---

## 1. Исходное состояние и сохранение

| Объект | Состояние |
|---|---|
| `main` / `origin/main` | `6ed9d1c` — не изменялись |
| `docs/aninova-3-b0-audit` | `2bef267` + правки B0.5 (этот отчёт) |
| `fix/catalog-sync-pr-flow` | `5abe9fd` |
| `fix/workflow-least-privilege` | `3701590` |
| `refs/backup/b0-wip-full-20261119` | `cb2bd7b` |
| `refs/backup/b0-wip-20261119` | `b539528` |
| WIP `app/layout.tsx` + `app/theme-2026.css` | сохранены, не закоммичены в `main`; SHA256 совпадают |
| Production | не деплоился; Vercel env не менялись |
| Supabase data | read-only проверки; записей/удалений/DDL не было |
| Redis/provider cache | не очищался |
| Guest bookmarks/history | не затрагивались |

**Проверка WIP:** `26026d48…` для `layout.tsx`, `3fa79462…` для `theme-2026.css` — совпадает с `SHA256SUMS`. `titles.json` backup читается как массив из 8033 элементов (исправлена ошибочная команда с `require()` на `.bak`).

---

## 2. Задача A — GitHub PR-flow

### 2.1. Свежие данные Actions (read-only)

- Репозиторий публичный, Actions API доступен без токена: получено 1967 runs, просмотрены последние 100.
- Последний `sync-catalog` run: **`44603963760`** (2026-11-19T19:59:21Z, `main` @ `6ed9d1c`) — **failure**.
- Падение на шаге 10 **«enrich with Shikimori (batched)»**.
- Annotations:
  - `Catalog push rejected; fetching main and rebasing (attempt 1/3)` … `(attempt 3/3)`;
  - `Catalog push failed after three attempts`;
  - `Process completed with exit code 1` — `.github/workflows/sync-catalog.yml:66-67`.
- Это подтверждает F-01: причина не сеть/данные, а запрет direct push в защищённый `main`.
- Дополнительно GitHub предупреждает: `actions/checkout@v4` и `actions/setup-node@v4` работают под Node 24 (F-16).

### 2.2. Что исправлено в `fix/catalog-sync-pr-flow`

`5abe9fd` (поверх `1f6cd26`):

- `scripts/publish-catalog-changes.sh`:
  - публикует HEAD в bot-ветку `automation/catalog-sync`;
  - создаёт **один rolling PR** или переиспользует существующий открытый;
  - никогда не пушит в `main`;
  - `--force-with-lease` только для bot-ветки;
  - fail-closed при грязном дереве, ошибке push, ошибке GitHub GET/POST, PR 422.
- `.github/workflows/{sync-catalog,repair-catalog-descriptions,hydrate}.yml`:
  - `permissions` добавлен `pull-requests: write`;
  - `GITHUB_TOKEN` передаётся только на шаге публикации;
  - батчи коммитятся локально и публикуются одним PR в конце.
- `tests/test_catalog_publish_pr.py`: 11 тестов, покрывают создание PR, reuse, force-with-lease, nothing-to-publish, dirty tree, push failure, GitHub read error, PR 422, отсутствие direct push, exec-bit (Linux-only).
- Executable bit helper'а: git-index `100755` (на Windows проверка skip, на Linux CI выполняется).
- `sync-catalog.yml`: при падении после мутаций `titles.json` сохраняется artifact'ом `catalog-batch-<run_id>` (retention 14 дней).

### 2.3. Локальные проверки

| Проверка | Результат |
|---|---|
| `python -m unittest tests.test_catalog_publish_pr -v` | **10 passed, 1 skipped** (skip — exec-bit на Windows/NTFS) |
| `python -m unittest tests.test_workflow_permissions -v` | **2 passed, 1 skipped** (PR-flow контракт проверяется после merge helper'а) |
| YAML parse всех workflow | OK |
| `git ls-files -s scripts/publish-catalog-changes.sh` | `100755` |
| Поиск `HEAD:main` / direct push | в исполняемых строках helper/workflows не найден (исторический комментарий исключён тестом) |

### 2.4. PR-flow: что не выполнено

- Ветки **не запушены**, PR **не открыт**: нет `gh` CLI и GitHub token.
- Linux CI (Python 3.13, exec-bit, реальный `git`/`curl`) не прогнан — только локальные fake-бинари.
- `workflow_dispatch` dry-run не выполнен.
- Branch protection **не отключалась** и не менялась.

**Owner action:**

```bash
git push -u origin fix/catalog-sync-pr-flow
git push -u origin fix/workflow-least-privilege
git push -u origin docs/aninova-3-b0-audit
# открыть PR fix/catalog-sync-pr-flow -> main
# после merge — workflow_dispatch sync-catalog (dry-run, если есть input)
```

---

## 3. Задача B — Security

### 3.1. Доступные данные

| Источник | Статус | Evidence |
|---|---|---|
| GitHub Actions runs/annotations | `DONE` | API 200; run `44603963760` |
| `npm audit --omit=dev` | `DONE` | **0 vulnerabilities** |
| Полный `npm audit` | `DONE` | 1 high: `zod <4.6.6` (dev-only) |
| Поиск секретов в tracked-файлах | `DONE` | JWT/private key/service key patterns — не найдены; tracked только `.env.example` |
| GitHub CodeQL alerts | `BLOCKED` | `401 Requires authentication` |
| GitHub Dependabot alerts | `BLOCKED` | `401` + intermittent SSL |
| Branch protection | `BLOCKED` | `401`; факт защиты подтверждён падением push, но policy не прочитана |
| Workflow logs | `BLOCKED` | `403 Must have admin rights`; annotations доступны |
| Supabase Advisors | `BLOCKED` | нет Management API token |
| Vercel runtime logs | `BLOCKED` | нет Vercel token |

### 3.2. Findings с точными file:line

| ID | Ур. | Файл:строка | Суть | Эксплуатируемость / impact | Fix | Тест |
|---|---|---|---|---|---|---|
| F-03 | P1 | `lib/sync.ts:24-27`, `:114-122`; `components/auth/AuthModal.tsx:51-55` | Legacy-auth пишет access/refresh/expires в `localStorage` (`anistream:supa_*`) | Любой XSS читает refresh token → долгая компрометация аккаунта; рассинхрон с cookie-SSR | Единый cookie-контур; legacy-ключи только читать на миграции; удалить запись | «нет JWT в localStorage»; XSS-симуляция; logout cleanup |
| F-04 | P1 | `components/auth/AuthModal.tsx` (только signIn/signUp/Google); в коде нет recovery/reset/resend/change/delete/export/linking/sessions | Неполный auth lifecycle | Пользователь не может восстановить доступ/удалить аккаунт; mobile review риск | Полный набор flows + anti-enumeration + redirect allowlist + PKCE/state | Security/e2e на каждый flow |
| F-06 | P1 | `supabase/migrations/20261012_episode_sources.sql:56,61`; `lib/episode-sources.ts:20`; `lib/providers/cache-db.ts:23` | Anon SELECT на `episode_source_urls` (350 074) и `episode_sources` (30 406); fallback на anon-ключ | Массовая выгрузка embed URL, обход API/rate limit, правовые риски | Убрать anon-fallback; staging-тест; затем `drop policy` + `revoke select`; service-role только сервер | anon → 401/0; service-role читает; player API контракт |
| F-16 | P2 | `.github/workflows/*` — 53 вхождения `actions/*@v4`/`setup-python@v5` | Node 20 actions под Node 24 | Предупреждение; будущая поломка CI | Обновить actions отдельным PR | CI/E2E |
| F-17 | P2 | `package-lock.json` → `eslint-config-next@16.3.5 → eslint-plugin-react-hooks@7.1.1 → zod@4.6.5` | GHSA-mrhx-c7xc-m3w5, high, CWE-770 | Dev-only, не production runtime; ломает полный audit | Обновить цепочку или `overrides: zod@^4.6.6` | `npm audit`, lint, test |
| F-18 | P3 | `.github/dependabot.yml`, `SECURITY.md`, CodeQL workflow отсутствуют | Нет авто-PR зависимостей/публичного канала; CodeQL-статус неизвестен | Долг supply chain | Добавить Dependabot + SECURITY.md; подтвердить default CodeQL | PR/check |

### 3.3. Что исправлено

- `fix/workflow-least-privilege` (`3701590`): `contents: read` добавлен в `ci.yml`, `e2e.yml`, `uptime.yml`, `rls.yml`, `push-daily.yml`, `push-test.yml`.
- Новый `tests/test_workflow_permissions.py`: падает, если у workflow нет top-level `permissions.contents` или стоит `write-all`; отдельно проверяет `pull-requests: write` у PR-publishers (после merge helper'а) и отсутствие `HEAD:main`.
- Ничего не «закрыто» без исправления: F-17 не подавлен, F-16 не замаскирован, RLS-политики не менялись.

### 3.4. Security: вывод

- Production runtime dependencies: **0 known vulnerabilities** по `npm audit --omit=dev`.
- Главные подтверждённые риски — F-03 (токены в localStorage) и F-06 (anon-доступ к video URLs); оба требуют кодовых/DB-изменений в B4/B3.
- Полная security-картина **не закрыта**: CodeQL/Dependabot/Advisors/branch protection недоступны.

---

## 4. Задача C — Auth F-03/F-04

**Статус:** `PARTIAL` — план готов, код не менялся (по границам B0/B4). Старый контур не удалён.

### 4.1. Целевой контур

- Web: Supabase Auth + `@supabase/ssr` cookie-сессия; server `getUser()`; proxy обновляет cookies.
- Mobile: Supabase Auth + PKCE + deep/universal links; refresh/session только `expo-secure-store`/Keychain/Keystore.
- Один аккаунт = `auth.users.id`; профиль `public.profiles` с RLS.
- `service_role` — только server/worker; никогда в `NEXT_PUBLIC_*`, mobile bundle, логи.

### 4.2. План миграции (B4)

| Фаза | Действие | Критерий выхода |
|---|---|---|
| 0 | Инвентаризация всех `anistream:supa_*`, `getToken`, `saveToken`, `applyAuthTokens`, `adoptLegacySessionIntoCookieStore` | Список потребителей с file:line |
| 1 | `getToken()` читает cookie-сессию SDK; legacy-ключи только читаются; новые токены не пишутся | Старые сессии работают; localStorage не пополняется |
| 2 | Единый `AuthProvider`/`AuthModal` на SDK; SSR `getUser()` | Вход/выход/refresh в web+SSR; нет JWT в localStorage |
| 3 | confirmation/resend, reset, change email/password, Google link/unlink, sessions/revoke, export, delete | Security-тесты: redirect allowlist, PKCE/state, anti-enumeration, ownership, no token in logs |
| 4 | Guest merge: `owner_key`, preview, идемпотентный merge, конфликты с сохранением обеих версий | Нет потери гостевых данных; rollback |
| 5 | Удаление legacy-ключей/функций | 30 дней без роста ошибок; тесты зелёные |

### 4.3. Guest merge (F-05)

Ключи: `anistream:bookmarks`, `anistream:history`, `anistream:settings`, `anistream:lists`; серверные `profile_lists`/`profile_history`.

Правила:
- при входе — preview «что будет объединено», без auto-merge по email;
- детерминированные ключи (title id + episode/chapter + timestamp);
- конфликт progress → сохранить максимальный прогресс + обе записи в history, не молча перезаписывать;
- merge идемпотентен, повторный вход не дублирует;
- backup перед merge и rollback-скрипт.

### 4.4. Rollback

- Feature flag `AUTH_CONTOUR=legacy|cookie`.
- На время B4 оба контура читают один `auth.users.id`.
- Откат: вернуть чтение legacy-ключей, не удаляя cookie-сессию.
- Удаление legacy — только после 30-дневного окна, backup и подтверждения владельца.

### 4.5. Что не проверено

- Реальный Google OAuth end-to-end (нет тестовых кредов/аккаунта).
- Sign in with Apple / App Review 4.8.
- Supabase email templates/redirect allowlist в Dashboard.
- Session revoke/delete/export на реальном проекте.

---

## 5. Задача D — F-06: anon-доступ к provider-таблицам

**Статус:** `PARTIAL` — зависимости проверены, план и SQL готовы; миграция **не применялась**.

### 5.1. Зависимости

| Потребитель | Как читает | Риск при закрытии |
|---|---|---|
| `lib/episode-sources.ts:20` | `SUPABASE_SERVICE_KEY \|\| NEXT_PUBLIC_SUPABASE_ANON_KEY` | Если service key отсутствует — упадёт; это правильно (fail-closed) |
| `lib/providers/cache-db.ts:23` | то же | То же |
| `app/api/providers/[slug]/[episode]/route.ts` | серверный слой | Контракт не меняется |
| `app/api/availability/[slug]/route.ts` | серверный слой | Контракт не меняется |
| `hydrate.yml`, `db-size.yml`, `episode-coverage-weekly.yml`, `refresh-kodik-episode-cache.yml`, `sync-titles-db.yml` | service key/скрипты | Проверить наличие secret |
| Клиентские компоненты | прямых чтений не найдено | — |

### 5.2. План

1. Убрать anon-fallback в `lib/episode-sources.ts` и `lib/providers/cache-db.ts`: без service key — ошибка/пусто + лог, не тихое чтение anon.
2. Staging-тест: anon `GET /rest/v1/episode_source_urls?select=*&limit=1` → `401/403` или 0; service-role — читает; player API отдаёт тот же контракт.
3. Миграция (отдельный PR):
   ```sql
   drop policy if exists episode_sources_read on public.episode_sources;
   drop policy if exists episode_source_urls_read on public.episode_source_urls;
   revoke select on public.episode_sources, public.episode_source_urls from anon, authenticated;
   ```
   Write-политики `service_role` оставить; RLS не отключать.
4. Проверить workflows/scripts на service key; anon не использовать.
5. Rollback: вернуть read-политику и grant одной миграцией.

**Не делать:** не удалять таблицы/строки, не отключать RLS, не выдавать service key в браузер, не закрывать доступ до staging-проверки.

---

## 6. Задача E — F-02: почему production на `file`

### 6.1. Измерения

| Среда | Условия | Результат |
|---|---|---|
| Production | `/api/health` 4 запроса за 40 с, один процесс (`uptime` 1555→1590) | всегда `source=file`, `count=8033`, `configured=db` |
| Local (`next start`) | `CATALOG_SOURCE=db`, budget 60 с | calls 1–3 `file`; calls 4–5 **`db`** после ~6 с |
| Supabase REST | `titles?select=*`, 10 страниц | ≈3,3 с, **19,4 МБ** |
| Supabase REST | card-projection | ≈2,1 с, **4,0 МБ** |
| Production budget | `lib/catalog.ts:139` | 8 с |

### 6.2. Причина

- `primeCatalogFromDb()` кэширует промис навсегда (`lib/catalog.ts:130-131`).
- При timeout/HTTP error/пустой странице возвращает `0` (`:150-162`, `:190-191`); повторных попыток в процессе нет.
- Health читает каталог до завершения прайма; на serverless фоновая работа может быть заморожена после ответа.
- 8 с недостаточно для холодного прайма; после первого обрыва `source=file` остаётся до конца жизни инстанса.
- Точная ветка (`timeout` vs HTTP error) не видна: `catch {}` молчит.

### 6.3. План (не применять до staging)

1. `catalog.prime = {status, reason, elapsedMs, rows, pages, startedAt, finishedAt}` в health (без секретов).
2. Не кэшировать `0` навсегда: сброс `priming` на transient-ошибке, retry/backoff, circuit breaker.
3. Per-page retry; активное время вместо wall-clock, чтобы freeze не съедал бюджет.
4. Card-projection 4 МБ вместо 19 МБ; описания — лениво.
5. Прогрев: ограниченный awaited prime в `instrumentation.register()` или snapshot в Storage/CDN — выбрать после замера cold start на Vercel.
6. Тесты: медленная БД, падение страницы, timeout, freeze, `source=db` после успеха, `source=file` при неполной таблице.

**Production не переключался на DB; env не менялись.**

---

## 7. Задача F — Backup/restore

### 7.1. Проверено

| Проверка | Результат |
|---|---|
| `titles.json` backup | OK, 8033 элемента |
| WIP SHA256 | OK, оба файла |
| Метаданные БД | OK, 26 таблиц |
| Полный `pg_dump`/PITR | `BLOCKED` — нет connection string/DB password/Management API token |
| Restore drill | `NOT DONE` — нельзя создать тестовую БД/восстановить дамп |
| Storage objects / `auth.users` | `NOT EXPORTED` |
| Weekly `backup-weekly.yml` | `PARTIAL` — только tracked-файлы, не БД/Storage |

### 7.2. Что важно

- Partial table snapshot (26 таблиц, counts) **не является** полным backup.
- Восстановление только `titles.json` не восстанавливает пользователей, историю, отзывы, Storage.
- Owner должен выполнить `pg_dump`/Dashboard backup и restore drill по `docs/ANINOVA_3_BACKUP_RESTORE.md` §3–§4.
- До этого B0 backup-часть — `PARTIAL`, не `DONE`.

---

## 8. Что осталось и кто нужен

### 8.1. Блокеры

| Блокер | Что нужно | Кто |
|---|---|---|
| Ветки/PR не запушены | GitHub auth/`gh`; push 3 веток, открыть PR | владелец |
| CodeQL/Dependabot/branch protection | GitHub token с `security_events: read`/admin read | владелец |
| Supabase Advisors/`pg_policies`/Storage | Management API token или SQL-доступ | владелец |
| Vercel logs/cold start | Vercel read token/доступ к Logs | владелец |
| Полный backup/restore | DB password/connection string, `pg_dump`, тестовая БД | владелец |
| F-02 staging | Vercel preview + DB latency, право на env preview | владелец + агент |

### 8.2. Остаточные риски production

- F-01: `sync-catalog` продолжит падать до merge PR-flow; каталог не обновляется автоматически.
- F-02: production читает file; при расхождении с БД возможны несоответствия; DB-путь не проверен.
- F-03: refresh token в localStorage → XSS-риск.
- F-06: anon может выгрузить 350 074 URL.
- F-07: неизвестны CodeQL/Dependabot alerts и drift branch protection/Advisors.
- Backup: полного DB backup нет; restore не проверен.

---

## 9. Готовность к B1

**B1 не начат. Статус: `NOT READY` до закрытия P0/P1 блокеров.**

Условия перехода:

1. PR `fix/catalog-sync-pr-flow` (+ `fix/workflow-least-privilege`) смержен, Linux CI зелёный, `sync-catalog` dry-run создаёт/переиспользует ровно один PR.
2. Получены CodeQL/Dependabot/branch protection/Advisors данные; critical/high разобраны или явно приняты владельцем.
3. F-02: есть диагностика prime и решение по прогреву; production не принудительно переключён.
4. F-06: staging-тест подтверждает, что закрытие anon не ломает player; миграция готова.
5. Backup: полный DB backup + restore drill выполнены или владелец явно принял остаточный риск.
6. F-03/F-04/F-05: план B4 подтверждён; старый auth-контур не удалён до миграции.

---

## 10. Артефакты и коммиты

| Ветка/ref | SHA | Содержимое |
|---|---|---|
| `main` | `6ed9d1c` | baseline, не изменялся |
| `docs/aninova-3-b0-audit` | `2bef267` + B0.5 docs | audit/architecture/risk/backup/report |
| `fix/catalog-sync-pr-flow` | `5abe9fd` | PR publisher, workflows, tests, artifact |
| `fix/workflow-least-privilege` | `3701590` | 6 workflows + permissions test |
| `refs/backup/b0-wip-full-20261119` | `cb2bd7b` | WIP layout + theme |
| `refs/backup/b0-wip-20261119` | `b539528` | WIP tracked diff |

**Секреты:** в документах/коммитах не печатались; `.env.local` не коммитился; service key не попадал в отчёт.
