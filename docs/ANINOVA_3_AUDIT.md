# AniNova 3.0 — B0: аудит, сохранение состояния, architecture freeze

**Дата:** 2026-11-20 (UTC)  
**Этап:** B0 (только аудит и фиксация; B1+ не начинались)  
**Baseline:** `main` @ `6ed9d1c` (`docs(env): точечный hydrate и приоритет новых серий (#72)`)  
**Production:** `https://aninova-catalog.vercel.app/`  
**Репозиторий:** `Artem6353/anistream`  
**Продуктовое ограничение (подтверждено владельцем 2026-11-20):** все комиксы, манга, манхва, маньхуа, вебтуны и оригинальные графические произведения — **только на русском языке**.  
**Статус B0:** `PARTIAL` — аудит, карта системы, backup и ADR готовы; живые GitHub/CodeQL/Vercel/Advisor-данные и часть DB-проверок недоступны без токенов; блокирующий fix подготовлен веткой, PR не открыт.  
**Статус B0.5:** `PARTIAL` — Actions/PR-flow проверены, найдена и уточнена причина F-02, подготовлены планы F-03/F-04/F-06; CodeQL/Dependabot/Advisors и полный backup остаются `BLOCKED`. Полный отчёт — `docs/ANINOVA_3_B0_5_REPORT.md`.

---

## 1. Что проверено и чем

| Источник | Как проверено | Результат |
|---|---|---|
| Локальный git | `git status`, `git branch -a -vv`, `git log`, `git worktree list` | `main` совпадает с `origin/main`; 2 незакоммиченных WIP-файла; 104 ветки (27 локальных, 77 remote) |
| Код | чтение `app/`, `components/`, `lib/`, `scripts/`, `supabase/`, `.github/workflows/` | карта ниже |
| Production runtime | `GET /api/health?probe=1`, `/api/providers/...`, `/api/search`, `/api/titles`, `/api/availability` | health 200, каталог 8033, источник `file`, Supabase probe 200 |
| Production DB (read-only REST) | service-ключ из локального `.env.local`, `HEAD` + `Prefer: count=exact` | 26 таблиц, счётчики ниже; запись не выполнялась |
| RLS (read-only) | anon-ключ из клиентского бандла, `HEAD`/`select limit 1` | приватные таблицы не отдают строки; публичные отдают |
| Объём БД | `npm run check:db-size` | 145,8 МБ из 500 МБ (29,2 %) |
| Каталог | `npm run report:catalog` | 8033 тайтла, метрики качества ниже |
| Сборка | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run smoke` | все зелёные, кроме 2 lint-warnings |
| WIP | `git stash create` + git-объекты + копии в `.cache/` | сохранено, см. §3 |
| GitHub API | unauthenticated `api.github.com` | `403 rate limit` — живые alerts/actions недоступны |
| Supabase Advisors | Management API token отсутствует | `BLOCKED` |
| Vercel runtime logs | Vercel token отсутствует | `BLOCKED` |
| Redis/Upstash | production `/api/health` | `providerCache.backend=upstash`, `reachable=true` |

> Секреты не печатались и не сохранялись в отчётах. Значения ключей в документ не попадают.

---

## 2. Краткий итог (executive summary)

1. **Сайт и каталог живы:** 8033 тайтла, production health 200, основной smoke-набор маршрутов зелёный.
2. **Каталог фактически читается из `lib/data/titles.json`, а не из БД**, хотя `CATALOG_SOURCE` настроен как `db` и в `public.titles` лежат 8033 строки. Количество совпадает (8033/8033), построчная сверка не выполнялась; заявленный DB-путь не активен, причина — бюджет и fire-and-forget прайма (см. F-02).
3. **Подтверждён блокирующий инфраструктурный дефект:** автоматизация каталога делает `git push origin HEAD:main`, что несовместимо с защитой `main` «Changes must be made through a pull request». Подготовлена ветка с PR-flow (F-01).
4. **Anime-домен зрелый, Comics-домена нет:** в БД 26 таблиц только вокруг anime/profile/social; ни одной `comic_*` таблицы. Это ожидаемо для B0, но B3 начинается с нуля.
5. **Auth разделён на два контура:** cookie-SSR (`/auth`, `@supabase/ssr`, proxy) и legacy REST-модалка (`lib/sync.ts`), которая до сих пор пишет access/refresh токены в `localStorage`. Это противоречит заявлению «токены только в памяти» и является P1-риском (F-03).
6. **Отсутствуют обязательные для AniNova 3.0 auth-flow:** recovery/reset, resend confirmation, change email/password, export/delete account, linking/unlinking identities, управление сессиями (F-04).
7. **Guest-to-account merge отсутствует как контракт:** `lib/library.ts` хранит bookmarks/history/settings/lists в `localStorage` под `anistream:*`, серверные `profile_lists`/`profile_history` синхронизируются отдельно; карты ключей, backup и conflict rules нет (F-05).
8. **Публичный anon-доступ к `episode_source_urls`/`episode_sources`** отдаёт 350 074 + 30 406 строк с embed-URL напрямую через PostgREST, минуя API и rate limit. Для видео-источников это надо осознанно закрыть или ограничить projection (F-06).
9. **Не получены свежие CodeQL/Dependabot/Actions/Vercel/Advisor-данные** — состояние безопасности вне репозитория неизвестно; это `BLOCKED`, а не «всё чисто» (F-07).
10. **WIP-тема `theme-2026.css` сохранена, но не является baseline Nova Minimal:** в ней киберпанк-неон, циан/фиолет и glassmorphism; B1 должен решить, что из неё берётся, а что заменяется (F-11).
11. **Комиксы — только на русском (новое обязательное требование владельца):** это не просто UI-локаль, а условие допуска контента к читалке. Русскоязычность должна проверяться адаптером, БД (`language='ru'`), quality gate и правами; не-RU главы не публикуются и не открываются в reader (F-15).

---

## 3. Состояние репозитория и сохранение WIP

### 3.1. Git-состояние на старте B0

```text
## main...origin/main
 M app/layout.tsx
?? app/theme-2026.css
```

- `app/layout.tsx` содержит ровно одну добавленную строку: `import './theme-2026.css';`
- `app/theme-2026.css` — новый файл, 602 строки, 16 953 байта.
- Stash-записей не было.
- Ветки: 27 локальных, 77 remote; большинство — исторические/слитые через squash PR. Отдельно проверены `feat/ui-auth-profile`, `fix/catalog-sync-push-race`, `fix/final-audit`, Dependabot-ветки: их изменения уже вошли в `main` через squash, либо устарели.

### 3.2. Что сделано для сохранения

WIP не коммитился в `main` и не удалялся. Созданы три независимых слоя восстановления:

| Слой | Путь/ref | Содержимое |
|---|---|---|
| Git-ref (полный WIP) | `refs/backup/b0-wip-full-20261119` → `cb2bd7b` | коммит поверх `main` с `layout.tsx` + `theme-2026.css` |
| Git-ref (только tracked diff) | `refs/backup/b0-wip-20261119` → `b539528` | stash-commit с изменением `layout.tsx` |
| Файловые копии | `.cache/b0-wip-20261119/` | `layout.tsx`, `theme-2026.css`, `layout.patch`, `SHA256SUMS` |

Контрольные суммы:

```text
26026d4867ac35badf7e504c86a971c8bfe2ffab22b4a0d1d5db6c7438860a6c *app/layout.tsx
3fa7946221570b2279549900e88c4ebe1e4867951355c0de98d084d1c5883fc7 *app/theme-2026.css
```

Восстановление:

```bash
# Вариант 1: вернуть оба файла из полного WIP-коммита
git checkout refs/backup/b0-wip-full-20261119 -- app/layout.tsx app/theme-2026.css

# Вариант 2: из копий
cp .cache/b0-wip-20261119/layout.tsx app/layout.tsx
cp .cache/b0-wip-20261119/theme-2026.css app/theme-2026.css
sha256sum -c .cache/b0-wip-20261119/SHA256SUMS
```

> `refs/backup/*` — локальные refs, они не уходят в `origin` автоматически. Для долгосрочного хранения их нужно запушить отдельной веткой (`refs/heads/backup/b0-wip-20261119`) после разрешения владельца.

### 3.3. Ветки, подготовленные в B0

| Ветка | HEAD | Назначение | Статус |
|---|---|---|---|
| `fix/catalog-sync-pr-flow` | `1f6cd26` | PR-публикация каталога вместо direct push в `main` | локальный коммит, не запушен, PR не открыт |
| `docs/aninova-3-b0-audit` | этот документ | B0-документация | локальный коммит, не запушен |

`main` не изменялся. Production не деплоился. DB-запись не выполнялась.

---

## 4. Карта системы

### 4.1. Стек

| Компонент | Версия/факт |
|---|---|
| Next.js | `^16.4.6` (App Router, RSC, proxy вместо middleware) |
| React | `19.1.0` |
| TypeScript | `^5.7.0` |
| Supabase | `@supabase/ssr ^0.12.7`, `@supabase/supabase-js ^2.119.0` |
| Player | `hls.js ^1.7.3` + iframe/embed-провайдеры |
| Images | `sharp ^0.35.5`, собственный `/img` и `/img/v2` |
| Push | `web-push ^3.6.7` |
| Tests | Vitest 4, Playwright 1.63, Python unittest для bridge/importers |
| CI | GitHub Actions, Node 20, Python 3.13 |
| Deploy | Vercel (production), Netlify-конфиг сохранён как historical fallback |

### 4.2. Страницы (41 `page.tsx`)

| Группа | Маршруты |
|---|---|
| Главная/каталог | `/`, `/catalog`, `/top`, `/random`, `/search`, `/season`, `/season/[slug]`, `/genre/[slug]`, `/genre/[slug]/[page]`, `/genres` |
| Аниме | `/anime/[slug]`, `/anime/[slug]/[episode]`, `/schedule` |
| Профиль | `/profile`, `/profile/[username]`, `/profile/list`, `/profile/history`, `/profile/bookmarks`, `/profile/settings`, `/profile/achievements` |
| Auth | `/auth`, `/auth/callback`, `/admin/login`, `/admin` |
| Сообщество | `/feed`, `/feed/recommended`, `/clubs`, `/clubs/[slug]`, `/forum`, `/forum/[category]`, `/forum/[category]/[thread]`, `/messages`, `/messages/[id]`, `/party/[id]`, `/reviewer/[uid]`, `/quiz`, `/collections`, `/collections/[slug]` |
| Служебные | `/privacy`, `/terms`, `/dmca`, `/disclaimer` |

### 4.3. API Route Handlers (24 `app/api/**/route.ts`)

| Домен | Маршруты |
|---|---|
| Каталог/поиск | `/api/titles`, `/api/search`, `/api/schedule`, `/api/availability/[slug]` |
| Плеер | `/api/providers/[slug]/[episode]` |
| Auth | `/api/auth/signout` |
| Социал | `/api/social/feed`, `/api/social/reviews`, `/api/social/reviews/[id]/react`, `/api/social/taste`, `/api/social/captcha` |
| Профиль/уведомления | `/api/push/subscribe`, `/api/push/vapid` |
| Модерация | `/api/report`, `/api/dmca`, `/api/admin/hide`, `/api/admin/login`, `/api/admin/manual`, `/api/admin/tickets` |
| Служебные | `/api/health`, `/api/ping`, `/api/metrics`, `/api/quiz`, `/api/reco` |
| Картинки/sitemap | `/img`, `/img/v2`, `/sitemap.xml`, `/sitemap/[id]` |

Вне `app/api`: `app/random/route.ts`.

### 4.4. Компоненты (106 файлов)

| Группа | Ключевые компоненты |
|---|---|
| Layout | `SiteHeader`, `MobileNav`, `Footer`, `CommandPalette`, `SearchForm`, `Logo`, `StreakBadge`, `DmIcon` |
| Anime | `Hero`, `PosterCard/Grid/Row`, `FilterPanel`, `GenreChips/View`, `Pagination`, `EpisodeGuide*`, `WatchButton`, `BookmarkButton`, `ListStatusButton`, `ContinueWatchingRail`, `BecauseRail`, `ForYouRail`, `LegalWatchBlock` |
| Player | `PlayerShell` (49 КБ), `EpisodesPanel`, `SourcesPanel`, `ReportForm`, `usePlayerGestures` |
| Auth | `AuthPageClient`, `AuthModal`, `AuthGate`, `SessionBridge` |
| Profile | `ProfileDashboard`, `AccountSettings`, `AniDnaCard`, `ProfileHeader/Tabs`, `MyList`, `HistoryList`, `BookmarksList`, `SettingsPanel`, `SyncSection`, `AchievementToast` |
| Social | `ReviewsSection`, `FollowButton`, `WriteDmButton`, `ReviewAuthor` |
| System | `ThemeInit`, `SwRegister`, `TvMode`, `CookieConsent`, `ClientMonitoring`, `Metrika`, `ErrorBoundary`, `Toaster`, `ScopeSync`, `AutoSync` |

### 4.5. Ключевые `lib/`

| Слой | Файлы |
|---|---|
| Каталог | `catalog.ts`, `types.ts`, `episodes.ts`, `episode-data.ts`, `episode-route.ts`, `franchise.ts`, `section-index.ts`, `sitemap.ts` |
| Провайдеры/плеер | `providers/*` (registry, cache, bridge, cvh-direct, kodik-direct, synthesize), `player-source-fallback.ts`, `aniskip.ts` |
| Auth/профиль | `supabase/{server,browser,middleware,env}.ts`, `auth/*`, `sync.ts`, `profile/*`, `userId.ts`, `session-reset.ts` |
| Пользователь | `library.ts`, `achievements.ts`, `streak.ts`, `reco.ts` |
| Инфраструктура | `rateLimit.ts`, `ip.ts`, `logger.ts`, `metrics.ts`, `monitor.ts`, `img*.ts`, `env-diagnostics.ts`, `config/providers.config.ts` |

### 4.6. Данные production (read-only, 2026-11-20)

| Таблица | Строк | Домен | Anon-доступ |
|---|---:|---|---|
| `titles` | 8 033 | anime | публичный |
| `title_relations` | 9 782 | anime | публичный |
| `title_characters` | 42 231 | anime | публичный |
| `episodes` | 5 674 | anime | публичный |
| `airing_schedule` | 202 | anime | публичный |
| `airing_progress` | 43 | anime | публичный (служебная) |
| `episode_progress` | 172 | anime | публичный (служебная) |
| `episode_sources` | 30 406 | video | **публичный** |
| `episode_source_urls` | 350 074 | video | **публичный** |
| `profiles` | 2 | identity | публичный (задумано) |
| `profile_lists` | 3 | library | только владелец (anon 0) |
| `profile_history` | 113 | library | только владелец (anon 0) |
| `reviews` | 4 | social | публичный |
| `review_reactions` | 0 | social | публичный read |
| `follows` | 1 | social | публичный |
| `clubs` / `club_members` / `club_posts` | 1 / 1 / 1 | social | публичный |
| `forum_categories` / `forum_threads` / `forum_posts` | 5 / 1 / 1 | social | публичный |
| `dm_threads` / `dm_messages` | 1 / 4 | social | только участники (anon 0) |
| `push_subs` | 0 | notifications | закрыто (anon 0) |
| `dmca_requests` / `source_reports` | 0 / 0 | moderation | закрыто (anon 0) |

Объём БД: **145,8 МБ / 500 МБ (29,2 %)**. Крупнейшие: `episode_source_urls` 88,9 МБ, `titles` 26,4 МБ, `episode_sources` 8,3 МБ. Последняя запись источника — 0 дней назад.

Схема БД (26 таблиц) не содержит ни одной таблицы Comics. Storage-бакеты `avatars`, `banners` описаны миграцией 004 (публичное чтение, запись в папку `<uid>/`); миграция 20261119 добавляет лимит 2 МБ и MIME `png/jpeg/webp`, но её применение на проде не подтверждено (нет доступа к `pg_policies`/`storage.buckets`).

### 4.7. Auth-контур (фактическое состояние)

| Поток | Реализация | Состояние |
|---|---|---|
| Email/password (web) | `AuthPageClient` → `supabase.auth.signInWithPassword` / `signUp`; cookie-сессия `@supabase/ssr` | работает |
| Email confirmation | `emailRedirectTo=/auth/callback`, `AuthCallbackPageClient` | есть, тестами на реальном письме не проверено |
| Google OAuth | `signInWithOAuth`, callback `/auth/callback` | код есть, реальный Google-контур не проверялся |
| Proxy refresh | `proxy.ts` → `refreshSupabaseSession` для `/auth`, `/profile`, `/profile/*` | есть |
| Legacy modal | `AuthModal` → `lib/sync.ts` REST + `saveTokens()` в `localStorage` | есть; конфликт с cookie-контуром |
| Session mirror | `SessionBridge` переносит cookie-сессию в память legacy-слоя | есть; legacy REST всё равно пишет на диск |
| Public profile | `/profile/[username]` читает `profiles` anon-ключом | есть |
| Private profile | `/profile` server-side `getServerUser` + RLS | есть |
| Recovery/reset, resend, change email/password | — | **отсутствует** |
| Account export/delete | — | **отсутствует** |
| Identity linking/unlinking | — | **отсутствует** |
| Session management (all devices) | — | **отсутствует** |

### 4.8. Каталог и провайдеры (фактическое состояние)

- `lib/catalog.ts`: синхронный file-fallback + асинхронный `primeCatalogFromDb()`; прайм стартует из `instrumentation` и при импорте модуля, но **не блокирует** запрос.
- Production health: `catalog.source=file`, `catalog.configured=db`, `count=8033`, `expectedMin=7900`, `healthy=true`, `catalogMs≈2737`.
- Локальный замер 10 страниц по 1000 строк из `public.titles`: **≈6,0 с** (первая страница 1,5 с). Production-бюджет `CATALOG_DB_PRIME_BUDGET_MS=8000`; на Vercel холодный старт медленнее, поэтому прайм, вероятно, не успевает и остаётся file-fallback.
- `episode_sources`/`episode_source_urls` — источник правды для видео; Upstash — горячий кэш (`backend=upstash`, `reachable=true`).
- В production bridge-провайдеры не настроены (`kodik`, `cvh`, `aniboom` — `configured:false`); CVH ищется direct-веткой. Холодный `/api/providers/sousou-no-frieren/1` — **9,5 с**, повторный — **0,5 с**.
- Demo-провайдер и unverified fallback на проде выключены; это правильно.

### 4.9. GitHub Actions (22 workflow)

| Workflow | Триггер | `permissions` | Назначение / риск |
|---|---|---|---|
| `ci.yml` | push/PR | **нет блока** | typecheck/lint/test/build/validate |
| `e2e.yml` | push/PR | **нет блока** | Playwright + Lighthouse |
| `sync-catalog.yml` | cron 6ч + manual | `contents: write` (+ PR в B0-фиксе) | расширение каталога, коммит `titles.json` |
| `sync-titles-db.yml` | cron weekly | `contents: read` | `titles.json` → `public.titles` |
| `sync-episodes.yml` | cron 6ч/сутки | `contents: read` | эпизоды → БД |
| `sync-sources.yml` | cron 6ч/weekly | `contents: read` | Kodik → БД |
| `sync-airing.yml` | cron 30 мин | `contents: read` | AniList → `airing_schedule` |
| `hydrate.yml` | cron 6ч | `contents: write` (+ PR в B0-фиксе) | добор источников; легаси-коммит кэша |
| `refresh-kodik-episode-cache.yml` | manual/push | `contents: read` | Kodik cache |
| `episode-coverage-report.yml` | PR/push | `contents: read` | отчёт покрытия |
| `episode-coverage-weekly.yml` | cron weekly | `contents: read` | недельный отчёт |
| `db-size.yml` | cron daily | `contents: read` | 80/95 % алерты |
| `production-health.yml` | cron 2ч | `contents: read` | health probe |
| `uptime.yml` | cron 10 мин | **нет блока** | uptime + Telegram |
| `qa-e2e.yml` | cron weekly/manual | `contents: read` | QA прода (read-only по умолчанию) |
| `rls.yml` | cron weekly/manual | **нет блока** | RLS-оракулы |
| `backup-weekly.yml` | cron weekly | `contents: write` | snapshot в ветку `backups` |
| `repair-catalog-descriptions.yml` | manual | `contents: write` (+ PR в B0-фиксе) | сетевой ремонт каталога |
| `provider-cache-migration-dry-run.yml` | PR/push/manual | `contents: read` | dry-run миграции |
| `provider-cache-migration-apply.yml` | manual + confirmation | `contents: read` | запись в Upstash |
| `push-daily.yml` / `push-test.yml` | cron/manual | **нет блока** | web-push |

Найдено 6 workflow без явного `permissions` (`ci`, `e2e`, `uptime`, `rls`, `push-daily`, `push-test`) — при repo-default «write-all» это лишние права. Рекомендация: отдельный hardening PR после B0.

### 4.10. Тесты и quality gates

| Проверка | Результат B0 |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | 0 errors, 2 warnings (`no-img-element` в `app/anime/[slug]/opengraph-image.tsx`) |
| `npm test` | 56 файлов passed, 1 skipped; 361 тест passed, 6 skipped |
| `python -m unittest discover -s tests` | 17 тестов OK, 4 skipped (Windows exec-bit; в CI Linux выполняются) |
| `npm run build` | OK |
| `npm run smoke` | все маршруты OK, включая 404/308-редиректы и meta-теги |
| `npm run report:catalog` | 8033 тайтла; см. §5 |
| `npm run check:db-size` | 145,8 МБ / 500 МБ, exit 0 |
| `npm run check:rls` | **FAIL** — `supabase creds not found in bundle` (скрипт ищет `app/layout-*.js`, а бандл изменился) |

---

## 5. Каталог: качество данных

`npm run report:catalog` (8033 тайтла):

| Метрика | Значение | Порог/комментарий |
|---|---:|---|
| Заглушки 12/24 у онгоингов, опровергнутые графиком | 0 (0,00 %) | порог 1 % — OK |
| Заглушки 12/24 у анонсов | 32 (0,40 %) | порог 1 % — OK |
| Описания, оборванные посреди слова | 504 (6,27 %) | порог 10 % — OK, но заметно |
| Лицензиары/продюсеры в `studios` | 0 | OK |
| Одинаковые названия у тайтлов разных лет | 6 (0,07 %) | порог 1 % — OK |
| Помечено к перечитыванию описания (`needsDescriptionRefresh`) | 506 | справочно |
| Одинаковые названия у тайтлов одного года (серия/OVA) | 446 | справочно |

Вывод: каталог проходит текущий gate; 504 обрезанных описания — известный долг, лечится `repair-catalog-descriptions.yml` (сетевой проход), не входит в B0.

### 5.1. Обязательное продуктовое ограничение: русский язык комиксов

Владелец подтвердил 2026-11-20: **все комиксы, манга, манхва, маньхуа, вебтуны и оригинальные графические произведения в AniNova должны быть на русском языке.** Это требование уровня продукта, а не только локали интерфейса.

Что это значит для B3/B5:

- `comic_works.title_ru`, описания, жанры и UI-тексты — на русском; оригинальное название хранится как справочное поле.
- Читалка и hosted/embed-контент допускают только главы с `language='ru'` и подтверждёнными правами.
- Если у произведения нет русскоязычной версии, доступной легально, показывается карточка и ссылка «Где читать официально» (если разрешена), но **не** кнопка чтения.
- Импорт из AniList/MangaDex/Shikimori хранит язык оригинала и языки доступных изданий, но не публикует не-RU главы в reader.
- Машинный перевод нельзя выдавать за официальный/лицензированный; автоперевод без прав и редактуры не допускается.
- Quality gate B3: доля произведений с русским названием/описанием и русскоязычным легальным источником — обязательная метрика; `language` участвует в фильтрах и в правах.

Текущий Comics-домен отсутствует, поэтому миграционного воздействия на production в B0 нет; требование зафиксировано в ADR-002/ADR-005 и risk register (R-15).

---

## 6. Findings и решения

> Полный risk register с владельцами, сроками и mitigation — `docs/ANINOVA_3_RISK_REGISTER.md`. Здесь — краткие формулировки и evidence.

### F-01 — P0, блокирующий: автоматизация каталога пушит в защищённый `main`

**Evidence:** `scripts/push-catalog-commit.sh` содержал `git push origin HEAD:main`; этот helper вызывался из `sync-catalog.yml`, `repair-catalog-descriptions.yml`, `hydrate.yml`. Свежий run `44603963760` (2026-11-19T19:59:21Z, `main` @ `6ed9d1c`) упал на шаге 10 «enrich with Shikimori»; annotations GitHub: `Catalog push rejected; fetching main and rebasing (attempt 1/3..3/3)`, затем `Catalog push failed after three attempts` и `Process completed with exit code 1` на `.github/workflows/sync-catalog.yml:66-67`. Это подтверждает: причина — не сеть и не данные, а запрет direct push в защищённый `main`.

**Impact:** каждый cron-прогон синка каталога завершается ошибкой после выполнения работы; изменения не доходят до `main`, ветка защиты не должна отключаться.

**B0 fix:** ветка `fix/catalog-sync-pr-flow` (`1f6cd26`):
- новый `scripts/publish-catalog-changes.sh` публикует HEAD в bot-ветку `automation/catalog-sync` и создаёт/переиспользует один rolling PR;
- никогда не пушит в `main`, использует `--force-with-lease` только для bot-ветки;
- workflow получают `pull-requests: write` и `GITHUB_TOKEN` только на шаге публикации;
- батчи коммитятся локально, публикуются одним PR в конце;
- Python-тесты переписаны на проверку «нет push в main», «PR создаётся/переиспользуется», «грязное дерево fail-closed».
- Локальная проверка helper'а (B0.5): Python-тесты теперь запускаются и на Windows (fake `git`/`curl` через `GIT_BIN`/`CURL_BIN`), 10 passed / 1 skipped (exec-bit проверяется в Linux CI); покрыты create PR, reuse PR, force-with-lease, nothing-to-publish, dirty tree, push failure, GitHub GET 500, PR POST 422, отсутствие direct push в workflow/helper.
- Executable bit helper'а выставлен в git-index (`100755`); на Linux CI проверяется отдельным тестом.
- При падении прогона после мутаций `titles.json` сохраняется artifact'ом `catalog-batch-<run_id>` (retention 14 дней), чтобы локальные коммиты раннера не терялись.

**Ограничение:** PR не открыт, ветка не запушена — нет `gh`/GitHub token в локальной среде. Команды для владельца:

```bash
git push -u origin fix/catalog-sync-pr-flow
# затем открыть PR в main и выполнить workflow_dispatch sync-catalog с dry-run
```

### F-02 — P1: DB-прайм каталога не активен в production

**Evidence (B0.5, уточнено):** `/api/health` → `catalog.source=file`, `catalog.configured=db`, `count=8033`; `public.titles` = 8033 строки. В production четыре запроса с интервалом 10 с попали в один процесс (`uptime` 1555→1590), но `source` остался `file` даже через 40 с. Локально с `CATALOG_SOURCE=db` и бюджетом 60 с первый запрос отдал `file`, а через ~6 с тот же процесс переключился на `source=db` (8033). Замер 10 страниц `titles`: `select=*` ≈3,3 с / 19,4 МБ; card-projection ≈2,1 с / 4,0 МБ. Production-бюджет — 8 с (`lib/catalog.ts:139`).

**Причина (подтверждена частично):** `primeCatalogFromDb()` кэширует промис навсегда (`lib/catalog.ts:130-131`); при таймауте/любой ошибке страницы возвращает `0` (`:150-162`, `:190-191`), и повторных попыток в этом процессе нет. Health читает каталог до завершения прайма, а на serverless фоновая работа может быть заморожена после ответа. Восьми секунд недостаточно для холодного прайма; после первого обрыва `source=file` остаётся до конца жизни инстанса. Точная ветка (`timeout` vs HTTP error) без диагностики не видна — catch молчит.

**Impact:** каждый холодный процесс парсит 28 МБ JSON; DB-путь не проверяется в бою; при расхождении файла и БД поведение непредсказуемо. Данные совпадают по количеству, поэтому пользовательского дефекта сейчас нет.

**Решение (план, не применять до staging-проверки):**
1. добавить в health `catalog.prime = {status, reason, elapsedMs, rows, pages, startedAt, finishedAt}` без секретов;
2. не кэшировать `0` навсегда: сбрасывать `priming` при transient-ошибке, retry с backoff и circuit breaker;
3. не обрывать весь прайм из-за одной страницы: per-page retry, активное время вместо wall-clock, чтобы заморозка инстанса не съедала бюджет;
4. уменьшить projection для runtime-каталога (card-projection 4 МБ вместо 19 МБ) и/или грузить описания лениво;
5. прогрев: ограниченный awaited prime в `instrumentation.register()` либо отдельный snapshot в Storage/CDN; выбрать после замера cold start на Vercel;
6. тесты: cold start с медленной БД, падение одной страницы, timeout, freeze-симуляция, `source=db` после успешного прайма, `source=file` при неполной таблице.

### F-03 — P1: legacy-auth хранит токены в `localStorage`

**Evidence:** `lib/sync.ts` → `saveTokens()` пишет `anistream:supa_token`, `anistream:supa_refresh`, `anistream:supa_expires`; `AuthModal` использует этот слой. При этом `session-bridge.ts` утверждает, что токены только в памяти.

**Impact:** XSS/расширение браузера может украсть refresh token; два контура дают рассинхрон входа.

**Решение:** B4 — оставить один cookie-SSR контур; legacy-модалку перевести на SDK; удалить запись токенов на диск; мигрировать/очистить старые ключи; тест «после логина в localStorage нет JWT».

### F-04 — P1: неполный auth lifecycle

**Evidence:** в коде нет `resetPasswordForEmail`, `resend`, `updateUser`, account delete/export, identity linking.

**Impact:** пользователь не может восстановить пароль/подтвердить email повторно/удалить аккаунт — это блокирует требования AniNova 3.0 и review мобильного приложения.

**Решение:** B4, отдельными PR: recovery + reset, resend, change email/password, export, delete, linking, sessions. Для каждого — security-тесты и anti-enumeration.

### F-05 — P1: guest-to-account merge не формализован

**Evidence:** `lib/library.ts` — localStorage `anistream:bookmarks|history|settings|lists` (с per-uid suffix), `profile_lists`/`profile_history` — серверные; merge есть только для history в памяти (`mergeHistory`), но нет контракта импорта, backup и rollback.

**Impact:** риск потери закладок/истории при первом входе или смене аккаунта; требование §10.4 ТЗ не выполнено.

**Решение:** B4 — карта всех `anistream:*` ключей, идемпотентный merge с подтверждением, timestamp-конфликты, backup и rollback, тесты user A/B.

### F-06 — P1: anon может читать все video embed URLs напрямую из БД

**Evidence:** anon `HEAD /rest/v1/episode_source_urls` → `206 0-0/350074`; `episode_sources` → `206 0-0/30406`.

**Impact:** обход API/rate limit, массовая выгрузка источников, правовые риски (право на embed/хостинг не равно праву на публичную выдачу БД).

**Решение:** B3/B7 — закрыть `episode_source_urls`/`episode_sources` для `anon`; отдавать плееру только серверный projection через `/api/providers`, с rate limit и правами; добавить RLS-тест «anon SELECT → 0/403».

### F-07 — P1, BLOCKED: нет свежих GitHub/CodeQL/Vercel/Advisor данных

**Evidence (B0.5):** GitHub Actions API доступен без токена: получены 100 последних runs и job/annotations для `44603963760`. `code-scanning/alerts`, `dependabot/alerts` и `branches/main/protection` возвращают `401 Requires authentication`; `gh` не установлен; Vercel/Supabase Management token отсутствует; Supabase Advisors недоступны.

**Impact:** нельзя подтвердить отсутствие critical/high CodeQL/Dependabot alerts и drift политик; Actions-часть закрыта, security-часть — нет.

**Что нужно от владельца:** выполнить команды из §9 или выдать read-only токены (GitHub `security_events: read`, Supabase Management read, Vercel read); после этого обновить этот документ и risk register.

### F-08 — P2: 6 workflow без явного `permissions`

См. §4.9. **B0.5 fix:** ветка `fix/workflow-least-privilege` (`ed8ba3a`) добавляет `contents: read` в `ci`, `e2e`, `uptime`, `rls`, `push-daily`, `push-test`; новый тест `tests/test_workflow_permissions.py` падает, если у workflow нет top-level `permissions.contents` или запрошен `write-all`. PR не открыт (нет GitHub token).

### F-09 — P2: `check:rls` сломан на текущем бандле

**Evidence:** `SMOKE_URL=https://aninova-catalog.vercel.app npm run check:rls` → `supabase creds not found in bundle`. Скрипт ищет `/_next/static/chunks/app/layout-*.js`, которого нет в текущей сборке.

**Impact:** еженедельный RLS-оракул в CI не проверяет прод; ложное ощущение контроля.

**Решение:** искать Supabase URL/anon в любом загруженном chunk (как сделано в этом аудите) или передавать их через env; добавить smoke-тест самого оракула.

### F-10 — P2: холодный резолв источников ≈9,5 с

**Evidence:** первый `/api/providers/sousou-no-frieren/1` — 9,49 с, повторный — 0,48–0,56 с; bridge-провайдеры на проде не настроены, работает CVH direct.

**Impact:** на холодном инстансе плеер может показывать «Собираем источники…» дольше комфортного; зависит от внешнего CVH.

**Решение:** B2/B7 — skeleton/таймаут/честный статус, прогрев популярных серий, метрика cold/warm, circuit breaker; не добавлять блокирующие запросы в SSR.

### F-11 — P2: WIP-тема конфликтует с Nova Minimal

**Evidence:** `theme-2026.css` задаёт `--accent: #8b5cf6`, `--accent-2: #22d3ee`, `--grad: linear-gradient(120deg,#7c3aed,#22d3ee)`, `--neon-glow`, `--glass`; в комментариях — «киберпанк-подсветка».

**Impact:** если просто смержить WIP, B1 будет проектировать Nova Minimal поверх неона/glassmorphism; визуальная стратегия разъедется.

**Решение:** WIP сохранён; B1 принимает решение: какие токены/поверхности оставить, что заменить; `theme-2026.css` не становится baseline автоматически.

### F-12 — P2: migration registry отстаёт от файлов

**Evidence:** `docs/DEPLOY.md` ведёт реестр до 012; в `supabase/migrations/` есть 20261012…, 20261118, 20261119. RPC `db_storage_report()` отвечает 200 (20261118 применена); применение 20261119 (revoke RPC, storage limits, profile trigger) не подтверждено.

**Решение:** B3 — сверить `pg_policies`, `storage.buckets`, триггеры и grants; обновить реестр; не считать файл применённым.

### F-13 — P2: PWA/service worker не подтверждён

**Evidence:** `SwRegister`, `/sw.js`, `/manifest.webmanifest` отдают 200; полноценных тестов install/offline/update нет.

**Решение:** B2/B7 — проверить installability, offline fallback, версионирование SW, обновления.

### F-14 — P3: исторические ветки засоряют репозиторий

104 ветки, много squash-merged. Рекомендация: после B0 удалить смерженные remote-ветки (владельцем), оставить `main` + активные.

### F-15 — P1 (product constraint, final): комиксы только на русском

**Evidence:** окончательно утверждено владельцем 2026-11-20; в Master Specification язык контента не был зафиксирован как жёсткое условие. Текущего Comics-домена нет, поэтому дефекта в проде нет — есть риск спроектировать импорт/reader без этого ограничения.

**Финальное правило (без повторного согласования):** публичное произведение Comics обязано иметь русское название и проверенные русские метаданные; reader показывает только главы `language='ru'`; fallback на en/ja/ko/zh запрещён; оригинальные названия хранятся только для сопоставления ID и не заменяют русские в публичном UI; публикация fail-closed; наличие RU-локализации не заменяет проверку прав.

**Impact:** если B3 начнёт импортировать главы без фильтра `language='ru'`, AniNova нарушит продуктовое требование и может показать нелицензированный/непереведённый контент. Если language не участвует в правах, fail-closed модель прав не сработает.

**Решение:**
- в `comic_works`/`comic_chapters`/`comic_reading_sources` хранить `language` (BCP-47) и `translation_status`;
- reader допускает только `ru` + `approved` права + разрешённый `access_mode`;
- импортёр маркирует не-RU записи `needs_translation` и не публикует их;
- quality gate и acceptance-тесты B3 проверяют, что не-RU глава не открывается;
- для оригинальных произведений — русский текст обязателен до публикации reader-версии.

### F-16 — P2: GitHub Actions используют Node 20 actions под Node 24

**Evidence (B0.5):** annotation к run `44603963760`: «Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4». В workflow 53 вхождения `actions/*@v4`/`setup-python@v5`.

**Impact:** предупреждение, не отказ; при следующем ужесточении GitHub Actions возможны поломки CI.

**Fix:** отдельный PR обновить actions на актуальные major-версии, прогнать CI/E2E; не менять вместе с PR-flow.

### F-17 — P2: dev-only high advisory в `zod@4.6.5`

**Evidence (B0.5):** `npm audit --omit=dev` → 0 vulnerabilities; полный `npm audit` → `zod <4.6.6`, severity high, GHSA-mrhx-c7xc-m3w5 (memory exhaustion, CWE-770), приходит транзитивно через `eslint-config-next@16.3.5 → eslint-plugin-react-hooks@7.1.1`.

**Impact:** не входит в production runtime (`dev: true` в lock), но отравляет полный audit и будущий CI-гейт.

**Fix:** обновить `eslint-config-next`/`eslint-plugin-react-hooks` или добавить overrides `zod@^4.6.6`; проверить `npm run lint`/`npm test`; не закрывать advisory без обновления.

### F-18 — P3: нет Dependabot config и SECURITY.md

**Evidence (B0.5):** `.github/dependabot.yml` отсутствует; `SECURITY.md` отсутствует; CodeQL workflow в репозитории нет (возможно, default setup в GitHub, но проверить alerts без токена нельзя).

**Impact:** нет автоматических dependency PR и публичного канала уязвимостей; CodeQL-статус неизвестен.

**Fix:** добавить `dependabot.yml` (npm + github-actions, weekly), `SECURITY.md`; подтвердить CodeQL default setup или добавить workflow с least-privilege permissions.

---

## 7. Baseline-команды и воспроизводимость

```bash
# из корня репозитория
git rev-parse HEAD                 # 6ed9d1c...
npm ci
npm run typecheck                  # OK
npm run lint                       # 0 errors / 2 warnings
npm test                           # 361 passed, 6 skipped
npm run build                      # OK
npm run start &                    # :3000
npm run smoke                      # All routes OK
python -m unittest discover -s tests -p 'test_*.py'
npm run report:catalog
NEXT_PUBLIC_SUPABASE_URL=... npm run check:db-size
SMOKE_URL=https://aninova-catalog.vercel.app npm run check:rls   # сейчас FAIL (F-09)
```

Production health snapshot сохранён в `.cache/b0-health-production.json`; метаданные БД — в `.cache/b0-metadata-snapshot.json` (локально, не коммитятся).

---

## 8. Что не проверено (честно)

| Область | Почему | Как закрыть |
|---|---|---|
| GitHub CodeQL alerts | нет токена, API rate-limited | `gh api .../code-scanning/alerts` под владельцем |
| Dependabot alerts | нет токена | GitHub Security → Dependabot |
| Actions run logs/status | нет токена | `gh run list` / Actions UI |
| Vercel runtime/deploy logs | нет токена | Vercel dashboard → Logs |
| Supabase Advisors | нет Management API token | Supabase Dashboard → Advisors |
| `pg_policies`/grants/триггеры | нет SQL-доступа | SQL Editor read-only запросы |
| Storage buckets config | нет SQL/Management API | Dashboard → Storage |
| Google OAuth end-to-end | нет тестовых Google-кредов | staged test account |
| Email confirmation/recovery | flow отсутствует; реальная почта не тестировалась | B4 |
| Мобильное приложение | ещё не создано | B5 |
| Comic-таблицы/RLS | ещё не созданы | B3 |
| Lighthouse/field-метрики | B0 не запускал lab/field заново | B2/B7 |
| RLS write-контуры | аудит read-only, мутаций не было | локальный Supabase + контракт-тесты |

---

## 9. Точные действия владельца для снятия BLOCKED

```bash
# 1) CodeQL / Actions / Dependabot (read-only)
gh auth login
gh api repos/Artem6353/anistream/code-scanning/alerts --paginate
gh api repos/Artem6353/anistream/dependabot/alerts --paginate
gh run list --limit 30
gh run view <run-id> --log

# 2) Ветка защиты main (подтвердить правило)
gh api repos/Artem6353/anistream/branches/main/protection

# 3) Supabase Advisors / schema
#    Dashboard → Advisors; SQL Editor:
#    select * from pg_policies order by tablename, policyname;
#    select * from storage.buckets;
#    select tgname, tgrelid::regclass from pg_trigger where not tgisinternal;

# 4) Vercel logs
#    Dashboard → Project → Logs / Deployments
```

После получения данных обновить §8 и risk register, затем закрыть B0.

---

## 10. Открытые вопросы к владельцу

1. **Источник истины каталога на переходный период:** `titles.json` (текущий де-факто) или `public.titles` (целевой)? От ответа зависит, куда должен писать `sync-catalog` после PR и когда генерировать JSON.
2. **Судьба `theme-2026.css`:** сохранить как основу тёмной темы или заменить Nova Minimal с нуля?
3. **Политика видео-источников:** можно ли публично отдавать `episode_source_urls` через PostgREST, или закрываем anon и оставляем только API?
4. **Приоритет auth-долга:** recovery/reset/delete до B1 или после B1 (дизайн)?
5. **Мобильный репозиторий:** подтверждается ли отдельный `aninova-mobile` (ADR-001) и когда создавать?
6. **Sign in with Apple:** нужен ли сразу для iOS-релиза (зависит от App Review 4.8)?
7. ~~Русский язык комиксов~~ — **решено 2026-11-20:** RU-название и проверенные русские метаданные обязательны для публичных произведений; reader — только RU-главы; fallback на другие языки запрещён; оригинальные названия — только для сопоставления ID. См. ADR-012 §13.7.

---

## 11. Статус B0 по пунктам ТЗ §17

| Пункт B0 | Статус | Комментарий |
|---|---|---|
| 1. Inspect main/ветки/WIP | `DONE` | WIP сохранён, ветки проверены |
| 2. Свежие GitHub/CodeQL/Dependabot/Actions/Vercel/Supabase/Redis | `PARTIAL` | Redis OK; Actions runs/annotations получены в B0.5; CodeQL/Dependabot/Vercel/Advisors `BLOCKED` |
| 3. Карта routes/components/API/DB/auth/storage/workflows | `DONE` | §4 |
| 4. Schema vs code vs prod | `PARTIAL` | таблицы/счётчики сверены; policies/grants — нет; F-06 зависимости проверены |
| 5. Каталог, player, provider cache, user data, auth | `DONE` | §4.8, §5; F-02 причина уточнена |
| 6. Backup metadata + restore instructions | `PARTIAL` | файлы/метаданные проверены; DB dump/restore drill — нет доступа |
| 7. Блокирующие infra fixes отдельными PR | `PARTIAL` | `fix/catalog-sync-pr-flow` + `fix/workflow-least-privilege` готовы; PR не открыты |
| 8. ADR по API/mobile/auth/data/design | `DONE` | `docs/ANINOVA_3_ARCHITECTURE.md` + ADR-012 §13.7 final |

**B0.5 уточнение:** Actions-часть F-07 закрыта; security-часть (CodeQL/Dependabot/branch protection/Advisors) остаётся `BLOCKED`. F-01 причина подтверждена run `44603963760`; F-02 воспроизведена и объяснена; F-03/F-04/F-06 планы добавлены; backup остаётся `PARTIAL` (нет полного DB dump/restore drill).

**Итог:** B0 можно считать завершённым после снятия F-07 (внешние токены) и подтверждения F-01 в PR. До этого — `PARTIAL`, не `DONE`.
