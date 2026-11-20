# AniNova 3.0 — B0 Risk Register

**Дата:** 2026-11-20  
**Связанные документы:** `docs/ANINOVA_3_AUDIT.md`, `docs/ANINOVA_3_ARCHITECTURE.md`, `docs/ANINOVA_3_BACKUP_RESTORE.md`  
**Правило:** risk register обновляется при каждом этапе; закрытие риска требует evidence, а не «сделано».

## 1. Шкала

| Уровень | Значение |
|---|---|
| P0 | Блокирует работу/релиз или создаёт прямую потерю данных/прав |
| P1 | Высокий: ломает ключевой сценарий, безопасность или требование ТЗ |
| P2 | Средний: деградация, долг, риск будущего этапа |
| P3 | Низкий: гигиена/удобство |

## 2. Реестр

| ID | Ур. | Область | Риск | Evidence | Влияние | Mitigation | Владелец | Этап | Статус |
|---|---|---|---|---|---|---|---|---|---|
| R-01 | P0 | CI/CD | Автоматизация каталога делает direct push в защищённый `main` | `scripts/push-catalog-commit.sh`: `git push origin HEAD:main`; run `44603963760` упал на `sync-catalog.yml:66-67` после трёх rebase-попыток; вызовы в `sync-catalog`, `repair-catalog-descriptions`, `hydrate` | Cron-синк не доставляет изменения; branch protection нельзя отключать | PR-flow: `fix/catalog-sync-pr-flow` (`5abe9fd`), bot-ветка + rolling PR, artifact на падении, 10 Python-тестов; без push в main | владелец + агент | B0 | `PARTIAL` — ветка готова, PR не открыт |
| R-02 | P1 | Каталог/runtime | DB-прайм не активируется, production читает `titles.json` | `/api/health`: `source=file`, `configured=db`, 8033; локально тот же процесс перешёл на `db` через ~6 с; production не перешёл за 40 с; бюджет 8 с; `priming` кэширует `0` навсегда | Холодный парсинг 28 МБ; DB-путь не проверяется; возможное расхождение file/DB | Health-причина прайма, retry/circuit breaker, projection 4 МБ, замер на Vercel; тест `source=db` после прогрева | агент | B3/B7 | `OPEN` |
| R-03 | P1 | Auth | Legacy-контур пишет access/refresh токены в `localStorage` | `lib/sync.ts` → `saveTokens()`; `AuthModal`; при этом `session-bridge.ts` утверждает обратное | Кража refresh token при XSS; рассинхрон двух контуров | Один cookie-SSR контур; legacy modal на SDK; удалить запись токенов; тест «нет JWT в localStorage» | агент | B4 | `OPEN` |
| R-04 | P1 | Auth | Нет recovery/reset/resend/change/delete/export/linking/sessions | В коде отсутствуют соответствующие вызовы Supabase Auth | Пользователь не может восстановить доступ/удалить аккаунт; блокирует mobile review | Полный lifecycle + anti-enumeration + redirect allowlist + security-тесты | агент | B4 | `OPEN` |
| R-05 | P1 | User data | Guest-to-account merge не формализован | `lib/library.ts` — localStorage `anistream:bookmarks`, `:history`, `:settings`, `:lists`; серверные `profile_lists`/`profile_history`; merge только history в памяти | Потеря закладок/истории; утечка между аккаунтами | Карта ключей, идемпотентный merge с подтверждением, timestamp-конфликты, backup/rollback, A/B-тесты | агент | B4 | `OPEN` |
| R-06 | P1 | RLS/права | Anon читает все video embed URLs напрямую из PostgREST | anon `HEAD episode_source_urls` → `206/350074`; `episode_sources` → `206/30406` | Обход API/rate limit, массовая выгрузка, правовые риски | Закрыть anon SELECT; отдавать projection через `/api/providers`; RLS-тест «anon → 0/403» | агент | B3/B7 | `OPEN` |
| R-07 | P1 | Security/CI | Нет свежих CodeQL/Dependabot/Vercel/Advisor данных | Actions API получен (runs/annotations); `code-scanning/alerts`, `dependabot/alerts`, `branches/main/protection` → `401`; нет `gh`/токенов; Management API недоступен | Неизвестно, есть ли critical/high; нельзя закрыть security-часть B0 | Выдать read-only токены/выполнить команды из audit §9; обновить отчёт | владелец | B0 | `BLOCKED` — Actions закрыт, остальное нет |
| R-08 | P1 | Rights/Comics | Не-RU контент может попасть в reader | Правило утверждено окончательно 2026-11-20: публичные works — RU-название + проверенные RU-метаданные; reader только `language='ru'`; fallback запрещён; права отдельно | Нарушение продукта; нелицензированный/непереведённый контент | ADR-012 §13.7: fail-closed в адаптере, БД, API, RLS, quality gate; тест «не-RU не открывается» | агент | B3 | `OPEN` (design fixed, implementation pending) |
| R-09 | P2 | CI security | 6 workflow без явного `permissions` | `ci`, `e2e`, `uptime`, `rls`, `push-daily`, `push-test` | При repo-default write-all — лишние права токена | Ветка `fix/workflow-least-privilege` (`3701590`): `contents: read` + тест `test_workflow_permissions.py` | агент | B0+1 | `PARTIAL` — fix готов, PR не открыт |
| R-10 | P2 | QA/RLS | `check:rls` не находит Supabase creds в текущем бандле | `npm run check:rls` → `supabase creds not found in bundle`; скрипт ищет `app/layout-*.js` | Еженедельный RLS-оракул не проверяет прод | Искать creds в любом chunk или передавать env; smoke-тест оракула | агент | B0+1 | `OPEN` |
| R-11 | P2 | Player | Холодный резолв источников ≈9,5 с | production `/api/providers/sousou-no-frieren/1`: 9,49 с; повтор 0,48–0,56 с | Долгий «Собираем источники…», зависимость от CVH | Skeleton/таймаут/честный статус, прогрев популярных серий, метрики cold/warm, breaker | агент | B2/B7 | `OPEN` |
| R-12 | P2 | Design | WIP-тема конфликтует с Nova Minimal | `theme-2026.css`: неон, `#22d3ee`, `--neon-glow`, `--glass` | Риск смешать два визуальных языка | WIP сохранён; B1 делает отдельный diff и решает, что переносится; не мержить как есть | агент + владелец | B1 | `PARTIAL` — сохранено |
| R-13 | P2 | DB/schema | Реестр миграций отстаёт; применение 20261119 не подтверждено | `DEPLOY.md` до 012; файлы 20261012/20261118/20261119; `db_storage_report()` 200 | Возможен drift RLS/grants/storage limits | Сверить `pg_policies`, `storage.buckets`, триггеры; обновить реестр | владелец + агент | B3 | `OPEN` |
| R-14 | P2 | PWA | PWA/service worker не подтверждён | `/sw.js`, `/manifest.webmanifest` 200; install/offline-тестов нет | Пользователь ждёт offline/install, получает нерабочий сценарий | B2/B7: installability, offline fallback, SW versioning/update | агент | B2/B7 | `OPEN` |
| R-15 | P3 | Repo hygiene | 104 ветки, много squash-merged | `git branch -a` = 104 | Шум, риск случайной работы с устаревшей веткой | Удалить смерженные remote-ветки после B0 (владелец) | владелец | после B0 | `OPEN` |
| R-16 | P2 | Data quality | 504 описания обрезаны посреди слова (6,27 %) | `npm run report:catalog` | Хуже SEO/UX; приближается к порогу 10 % | Сетевой ремонт `repair-catalog-descriptions.yml`, контроль доли | агент | B2/B7 | `OPEN` |
| R-17 | P2 | Auth/legal | Google OAuth end-to-end не проверен; Sign in with Apple не решён | Код OAuth есть, реальных кредов/тестов нет; App Review 4.8 не проверен | Релиз iOS может быть заблокирован | Staged Google test account; проверить App Review; добавить Apple при необходимости | владелец + агент | B4/B5 | `OPEN` |
| R-18 | P2 | Automation | `sync-catalog` коммитит 28 МБ JSON каждые 6 часов | Workflow + `titles.json` 28 411 253 байта | Рост git pack, шум, расхождение с БД | B3: DB writer + generated snapshot; уменьшить частоту/размер | агент | B3 | `OPEN` |
| R-19 | P3 | Observability | Health `ok:true` при fallback-каталоге | `catalogHealthy=true,warnings=[]` при `source=file` | Мониторы не видят деградацию источника | Readiness-поле с причиной/режимом; алерт на fallback | агент | B3/B7 | `OPEN` |
| R-20 | P3 | Docs | Документация расходится с кодом (auth «только память», schema.sql, миграции) | `session-bridge.ts` vs `sync.ts`; `DEPLOY.md`; README | Агент/владелец принимает неверное состояние за факт | Обновлять docs в том же PR, что и код; ссылаться на audit | агент | постоянно | `OPEN` |
| R-21 | P2 | CI security | Actions `checkout@v4`/`setup-node@v4` работают под Node 24 с deprecation-warning | Annotation run `44603963760`; 53 вхождения `actions/*@v4` | При ужесточении GitHub Actions возможны поломки CI | Отдельный PR обновить actions, прогнать CI/E2E | агент | B0+1 | `OPEN` |
| R-22 | P2 | Supply chain | dev-only high advisory `zod@4.6.5` (GHSA-mrhx-c7xc-m3w5) | `npm audit`; `npm audit --omit=dev` = 0 | Не production runtime, но ломает полный audit/будущий гейт | Обновить `eslint-config-next`/`eslint-plugin-react-hooks` или overrides `zod@^4.6.6`; проверить lint/test | агент | B0+1 | `OPEN` |
| R-23 | P3 | Supply chain | Нет `dependabot.yml` и `SECURITY.md`; CodeQL workflow в репо отсутствует | `.github/dependabot.yml`/`SECURITY.md` не найдены; CodeQL файлов нет | Нет авто-PR зависимостей и публичного канала уязвимостей; CodeQL-статус неизвестен | Добавить Dependabot (npm/actions), SECURITY.md; подтвердить default CodeQL или добавить workflow | агент | B0+1 | `OPEN` |

## 3. Правила работы с рисками

1. **P0** — останавливает этап; PR не мержится, пока риск не закрыт или владелец явно не принял остаточный риск.
2. **P1** — требует mitigation в текущем/следующем этапе; нельзя «потерять» при планировании.
3. **P2/P3** — фиксируются в PR/этапе; могут быть перенесены с обоснованием.
4. Риск закрывается только ссылкой на тест/лог/PR/скриншот. Формулировка «проверено» без evidence не принимается.
5. Секреты, токены и приватные данные не попадают в risk register.
6. Новый risk ID не переиспользуется; закрытый риск остаётся в таблице со статусом `CLOSED` и ссылкой.

## 4. Что нужно от владельца для снятия блокировок

- GitHub token (read-only достаточно для alerts/actions; write — для PR) или выполнение команд из `docs/ANINOVA_3_AUDIT.md` §9.
- Vercel read-only token/доступ к Logs.
- Supabase Management API token или SQL-доступ для `pg_policies`/`storage.buckets`/triggers.
- Подтверждение прочтения требования «комиксы только на русском»: **закрыто 2026-11-20**; финальное правило — ADR-012 §13.7 (RU-название + RU-метаданные, reader только `ru`, fallback запрещён, права отдельно).
- Решение по источнику истины каталога на переходный период (R-02/R-18).
