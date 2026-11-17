# Автоматизация AniStream: аудит и план (2026-11-17)

Роль: DevOps. Документ фиксирует, что уже автоматизировано, что сломано **по факту**
(с доказательствами из логов и API), и что я делаю дальше — по приоритетам, с критериями
приёмки. Обновлять при закрытии пунктов.

---

## 1. Что уже автоматизировано

**18 воркфлоу, 8 расписаний, 6 ручных кнопок.** Статусы — последний прогон на 2026-11-17 16:40 UTC.

| Воркфлоу | Триггер | Что делает | Последний прогон |
|---|---|---|---|
| CI | push `main`/`dev`, PR | py_compile → unittest → npm ci → validate-catalog → check-readme → quality gate → repo size → lint → typecheck → test → build → smoke | ✅ |
| E2E (Playwright) | push, PR, manual | build → chromium → playwright → lighthouse gate | ✅ (был флейк) |
| Sync airing | `*/30 * * * *` | AniList → Supabase, окно −2…+8 дней | ✅ 14:08 |
| Sync episodes | `15 */6` + `40 3 * * *` | номера/даты/названия серий → Supabase, resumable | ✅ 12:23 |
| Sync catalog | `0 */6` | авто-добавление тайтлов + enrich Shikimori | ❌ 15:33 |
| Sync sources | `25 4` + `30 5 * * 0` | Kodik → `episode_sources`/`episode_source_urls` | ❌ 13:36 |
| Daily episode push | `0 15 * * *` | web-push о вышедших сериях | ✅ 16.11 |
| Uptime monitor | `*/30` | `/api/health`, алерт в Telegram | ✅ (но алертов нет, см. 2.6) |
| Production health probe | `0 */6` + push | разбор JSON health-эндпоинта | ✅ |
| RLS contracts | `0 4 * * 1` | проверка RLS на живом Supabase | ✅ 16.11 |
| Backup catalog | `0 3 * * 0` | бэкап каталога артефактом | ✅ 15.11 |
| Episode coverage report | PR/push | отчёт покрытия по локальному кэшу | ⚠️ после #47 отчёт не строится |
| Hydrate missing episodes | `0 */6` (новый, PR #48) | bridge'и + приложение + `npm run hydrate` | не запускался |
| Provider cache migration dry-run / apply | PR / manual | оценка и перенос кэша в Upstash | ✅ / manual |
| Refresh Kodik episode cache | push (свой файл) | `import-kodik-bulk.py` → Supabase | ❌ (фикс в PR #49) |
| Push test | manual | проверка доставки пуша | ✅ 26.09 |
| Repair catalog descriptions | manual | ремонт описаний | не запускался |

Вывод: **данные обновляются**, а вот **надзор за этой автоматизацией не автоматизирован** —
никто не узнаёт, что расписание упало.

---

## 2. Что сломано или не покрыто (факты, не догадки)

### 2.1 Нет ни одного уведомления о падении CI/расписаний
Секретов `TG_BOT_TOKEN` / `TG_CHAT_ID` в репозитории **нет** (проверено через API:
`BACKFILL_TOKEN, NEXT_PUBLIC_SUPABASE_URL, PUSH_CONTACT, SHIKIMORI_USER_AGENT,
SUPABASE_SERVICE_KEY, SUPABASE_URL, VAPID_PRIVATE, VAPID_PUBLIC`). Значит `uptime.yml`
и новый `hydrate.yml` тихо пропускают отправку.

Следствие: три расписания красные уже сейчас, и об этом никто не знает (см. 2.2–2.4).

### 2.2 `Sync sources` красный каждый день
```
KODIK_TOKEN не задан — провайдер остаётся пустым
##[error]Process completed with exit code 2
```
Скрипт осознанно выходит с кодом 2 («не сконфигурировано»), а воркфлоу должен был
превратить это в `::warning::` — но не превращал, потому что GitHub запускает шаг как
`bash -e` и `node …; code=$?` не выполняется. Исправлено в PR #48 (вместе с той же
проблемой в `hydrate.yml`). Нужен либо `KODIK_TOKEN`, либо осознанное «Kodik не собираем».

### 2.3 `Refresh Kodik episode cache` красный
После удаления `.cache/providers-resolve-cache.json` из git (PR #47) импортёр требовал
файл, которого больше нет: `Provider cache not found … Run from a synchronized repository first`.
Исправлено в PR #49 (старт с пустого кэша при `--restart --apply`).

### 2.4 `Sync catalog` красный на шаге heal
Падает шаг «heal screenshots+characters (batched, Jikan pictures)» — внешний Jikan
(rate-limit/пустой ответ), из-за него краснеет весь прогон добавления тайтлов.
Нужен `continue-on-error` + ретраи с бэкоффом и отдельный алерт, если heal не прошёл
3 прогона подряд.

### 2.5 `Episode coverage report` больше не строит отчёт
Воркфлоу читает `.cache/providers-resolve-cache.json`, которого нет в git. Шаги теперь
корректно пропускаются, но пользы ноль: отчёт покрытия нужен **из Supabase**
(`episode_source_urls`), как уже умеет `hydrate-embeds.mjs --dry-run`.

### 2.6 Мониторинг без оповещений и с дублем
`uptime.yml` (30 мин) и `production-health.yml` (6 ч) делают почти одно и то же, оба молчат
без TG-секретов. `PRODUCTION_URL` по умолчанию — домен с опечаткой
(`aninova-cataloge.netlify.app`), переменная `vars.PRODUCTION_URL` не задана.

### 2.7 Безопасность цепочки поставки полностью выключена
| Проверка | Статус |
|---|---|
| Dependabot alerts | disabled |
| Dependabot security updates | disabled |
| Secret scanning + push protection | disabled |
| Branch protection на `main` | нет (404 «Branch not protected») |
| `npm audit` в CI | нет |
| Уязвимости в прод-зависимостях | **1 critical + 2 high** (14 всего) |

### 2.8 Ветки и мусор
54 ветки, из них большинство — отработанные `agent-*`, `checkpoint/*`, `chore/*`, `feat/*`
после мерджа. Это стоит времени при каждом аудите и раздувает список в интерфейсе.

### 2.9 Нет контроля объёма БД
Supabase Free — 500 МБ. Таблица `episode_source_urls` растёт от каждой гидрации
(≈90–150 байт на серию, до 1200 серий на озвучку). Ни один воркфлоу не смотрит на размер
и не предупредит за месяц до отказа записи.

### 2.10 Нет проверки, что миграции применены
`supabase/migrations/*.sql` существуют, `rls.yml` тестирует политики, но никто не сверяет,
что файл из репозитория действительно применён к базе. Классический тихий дрейф.

### 2.11 Кэш на edge не сбрасывается после обновления данных
Найдено при аудите P2: `/api/providers/one-piece/1?live=1` отдавался из edge-кэша с
`ttl≈3529`. После каждой гидрации старые ответы могут жить до TTL.

### 2.12 SEO-обновления не оповещают поисковики
Ни `IndexNow` (Bing/Yandex), ни sitemap-ping после `sync-catalog`. Новые тайтлы ждут
следующего обхода.

---

### 2.14 Прод-хостинг: Vercel жив, Netlify мёртв (2026-11-17)

Проект Vercel удалили и пересоздали; ключи восстановлены не полностью. Факты с живых
доменов (17.11, 19:15 UTC):

| Домен | Статус |
|---|---|
| `aninova-catalog.vercel.app` | **200**, `/api/health` → `ok:true`, 8033 тайтла, фиксы аудита на месте (`?live=1` аноним → 403, `/genre/comedy/pop-999` → 404) |
| `aninova-catalog.netlify.app` | **502** на всех путях, включая `/robots.txt` и `/sitemap.xml` — сломан не код, а сам сайт/деплой |
| `aninova-cataloge.netlify.app` (опечатка) | **502** |

Что не настроено в новом проекте Vercel: `NEXT_PUBLIC_SUPABASE_ANON_KEY` —
`health.supabase=false`, при этом `health.supabaseProbe` = 200/200, то есть **серверный**
доступ к Supabase (service key) работает, а браузерные отзывы/списки/авторизация нет.
`NEXT_PUBLIC_*` инлайнятся на этапе сборки, поэтому после добавления переменной нужен
**redeploy**, простого рестарта недостаточно.

Автоматика: дефолт `PRODUCTION_URL` в `uptime.yml`, `production-health.yml`,
`rls.yml`, `provider-cache-migration-apply.yml` переведён на живой Vercel-домен,
а `production-health.yml` теперь пишет `::warning::` при `supabase:false`.

## 3. План автоматизации

Оценки — моё чистое время, без ожидания CI. Порядок = порядок выполнения.

### P0 — «чтобы я узнавал о поломках» (эта неделя)

| # | Что | Как | Файл | Оценка | Приёмка |
|---|---|---|---|---|---|
| P0-1 | Уведомления о падениях | `workflow_run` на `completed` + `conclusion=failure` → Telegram (тот же формат, что в `uptime.yml`). Один воркфлоу на все 18 | `.github/workflows/notify-failure.yml` (новый) | 45 мин | Искусственно уронить CI в ветке → приходит сообщение со ссылкой на run |
| P0-2 | Завести `TG_BOT_TOKEN`, `TG_CHAT_ID` | Settings → Secrets (руками, 2 мин), затем проверить `workflow_dispatch` у `uptime.yml` | — | 10 мин | Тестовое сообщение в чат |
| P0-3 | Включить защиту цепочки поставки | Dependabot alerts + security updates, secret scanning + push protection, branch protection на `main` (require: CI, E2E) | настройки репо (API/UI) | 20 мин | `GET /branches/main/protection` → 200; Dependabot alerts → 200 |
| P0-4 | `npm audit` gate в CI | `npm audit --omit=dev --audit-level=high` (прод-дерево), отдельным шагом; разобрать critical/high | `ci.yml` | 1 ч + время на апгрейды | 0 critical/high в прод-дереве, шаг зелёный |
| P0-5 | Добить красные расписания | PR #48 (`bash -e`), PR #49 (пустой кэш), `sync-catalog` heal → `continue-on-error` + алерт после 3 неудач | `sync-catalog.yml` | 1 ч | Три прогона подряд зелёные (или warning) |
| P0-6 | Ротация `BACKFILL_TOKEN` | Токен светился в чате; сгенерировать новый, обновить в GitHub + Netlify/env воркера, старый удалить | — | 15 мин | Старый токен → 403, новый → 200 на `?live=1` |

### P1 — «чтобы данные и деньги не кончились внезапно» (2–3 недели)

| # | Что | Как | Оценка | Приёмка |
|---|---|---|---|---|
| P1-1 | Отчёт покрытия из БД | `scripts/audit-episode-coverage.mjs` → режим `--source=db` (пагинация `episode_source_urls`), воркфлоу раз в неделю + артефакт + строка в TG | 3 ч | Отчёт строится без файлового кэша |
| P1-2 | Контроль объёма БД | SQL-функция `pg_database_size` + размеры таблиц через REST (`/rest/v1/rpc/…`), воркфлоу раз в день, алерт на 80% квоты | 2 ч | Отчёт с числами, алерт на тестовом пороге |
| P1-3 | Дрейф миграций | Хеши `supabase/migrations/*.sql` в таблицу `schema_migrations_fingerprint`, сверка в CI (fail при расхождении) | 2 ч | Добавление миграции без применения → красный CI |
| P1-4 | Сброс edge-кэша после данных | Webhook Netlify purge (build hook / API) в конце `sync-episodes`/`hydrate` | 1 ч | `?live=1` не отдаёт старый ответ после прогона |
| P1-5 | IndexNow + sitemap ping | `scripts/ping-indexnow.mjs` (ключ в env), вызов после `sync-catalog` | 1.5 ч | Ключ-файл отдаётся, пинг 200/202 |
| P1-6 | Восстановление бэкапа | Раз в месяц: скачать артефакт `backup-weekly`, `validate-catalog`, сравнить количество тайтлов | 1 ч | Отчёт «restore drill OK» с числами |
| P1-7 | Контентные гейты по расписанию | `check:posters`, `check:catalog --gate`, `validate:catalog` — weekly + TG при регрессе | 1 ч | Намеренная порча данных → красный отчёт |
| P1-8 | Обновления зависимостей | Dependabot (npm + pip + actions) с группами; автомерж patch после зелёного CI | 1 ч | Первый PR от Dependabot смержен автоматически |
| P1-9 | Ошибки рантайма | `@sentry/browser` в зависимостях, но не инициализирован: подключить Next SDK + source maps + алерт в TG | 3 ч | Тестовая ошибка в проде → событие в Sentry |
| P1-10 | Монитор «свежести» | Weekly: онгоинги без источника, серии без источника, отставание обновлений | 2 ч | Таблица в артефакте + предупреждение в TG |
| P1-11 | Единый монитор | Слить `uptime.yml` и `production-health.yml` в один (30 мин, deep-разбор раз в 6 ч), `vars.PRODUCTION_URL` задать явно | 1 ч | Один зелёный воркфлоу с историей |

### P2 — «чтобы росло само» (месяц+)

| # | Что | Оценка |
|---|---|---|
| P2-1 | Search Console API: weekly отчёт (индексация, запросы, ошибки) в TG | 3 ч |
| P2-2 | Lighthouse/Web Vitals бюджеты по расписанию (не только в PR) | 2 ч |
| P2-3 | Smoke на Netlify preview после каждого PR-деплоя (уже есть preview-URL) | 2 ч |
| P2-4 | Чистка веток: авто-удаление merged-веток старше 30 дней | 1 ч |
| P2-5 | Staging-данные: nightly restore в отдельную схему для проверки миграций | 4 ч |
| P2-6 | Авто-отчёт «рост каталога/качества» (сколько добавлено, покрытие, дубли) | 3 ч |
| P2-7 | Renovate вместо Dependabot, если групп станет много | 2 ч |

---

## 4. Что я намеренно НЕ автоматизирую

- **Ротация ключей Supabase/VAPID целиком** — полуавтомат: напоминание раз в 90 дней, но
  нажатие и обновление env на Netlify остаётся за человеком (иначе можно выкатить прод
  без рабочего ключа и не заметить, потому что сборка не проверяет реальный логин).
- **Модерация отзывов/чатов** — правила субъективны; Turnstile + капча-фейл-клоуз это
  фильтр спама, а не модерация смысла.
- **Авто-мерж изменений каталога (`titles.json`)** — источник данных внешний и «грязный»;
  сейчас каждый батч проходит `validate-catalog` и `check-catalog-quality --gate`, но
  финальное решение о спорных тайтлах оставляю человеку.
- **Авто-переключение хостинга Vercel↔Netlify** — это инцидентный ручной шаг, автоматика
  только детектирует.

---

## 5. Порядок и проверка эффекта

1. **Сейчас (P0):** уведомления → защита репо → `npm audit` gate → красные расписания → ротация токена.
2. **Через неделю (P1-1…P1-5):** отчёт покрытия из БД, контроль квоты, дрейф миграций, purge, IndexNow.
3. **Через месяц (P1-6…P1-11, P2):** restore drill, Sentry, freshness-монитор, отчёты.

Метрика «стало лучше»: **MTTD** (время от падения расписания до сообщения) — сейчас
бесконечность, цель < 15 минут; **0 красных расписаний подряд 7 дней**; **0 critical/high
в прод-дереве**; **свободное место в Supabase > 40%**.
