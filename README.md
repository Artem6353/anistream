# AniStream 2.0

Каталог и плеер аниме на **Next.js 16.3.8 (App Router, RSC/ISR) + TypeScript (strict)**:
**8017 тайтлов** (AniList + Shikimori-обогащение), реестр источников видео в Supabase,
плеер v3 с озвучками и графиком серий, социалка, админка модерации. Пересборка проекта
`сайт_для_аниме` (AniStream) с упором на надёжность, скорость и дизайн.

Прод: **https://aninova-catalog.vercel.app** (единственный живой домен; `anistream.vercel.app`
отошёл третьему лицу, `anistream-catalog.vercel.app` отдаёт 404).

> Числа в этом файле сверены с `lib/data/titles.json` на 12.10.2026 аудитом.
> Чтобы они не протухали, `npm run check:readme` сравнивает заявленное количество
> тайтлов с фактическим (шаг `readme numbers` в CI). Фактический состав:
> 7509 завершённых · 226 онгоингов · 282 анонса; 7724 с Shikimori-id, 7180 с русским
> описанием, 7469 с точными датами серий, 18 жанров, 238 тайтлов с `episodes: null`
> (итог не объявлен — это корректное значение, а не пропуск).

> Нейминг: репозиторий/package — `anistream` (историческое имя), пользовательский
> бренд сайта — **AniNova** (OG/Метрика/футер). Ключи localStorage/cookie — `anistream:*`. Анализ исходного
проекта — в [`docs/ANALYSIS.md`](docs/ANALYSIS.md), статус handoff-ТЗ — в [`docs/REPORT.md`](docs/REPORT.md).

## Быстрый старт

```bash
npm install        # 1) зависимости — без них Windows скажет «"next" не является внутренней или внешней командой»
npm run dev        # 2) терминал №1: http://localhost:3000, дождаться «✓ Ready»
```

Дальше — во **втором** терминале (скрипты ходят в работающий сервер):

```bash
npm run warm       # 3) обзор доступности по кэшу
npm run hydrate -- --dry-run # 4) сначала составить план недостающих серий
npm run hydrate    # 5) заполнить пропуски прямыми результатами провайдеров
npm run smoke      # HTTP-проверка маршрутов (SMOKE_URL=…, если порт другой)
npm run build && npm run start   # прод-сборка и прод-сервер
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (next/core-web-vitals + typescript)
```

> Если `npm run warm`/`hydrate` сообщают «Сервер не отвечает» — поднимите `npm run dev`
> в первом терминале. Предохранители `predev/prestart/prewarm/prehydrate` напомнят про `npm install`.
> Bridge поднимаются отдельными процессами:
> ```bash
> pip install https://github.com/YaNesyTortiK/AnimeParsers/archive/refs/heads/main.zip
> python bridges/kodik_bridge.py          # 8765: Kodik, авто-пул токенов, episode-specific /seria/…
> python bridges/multi_player_bridge.py   # 8766: CVH + AniBoom через AnimegoParser.get_voices
> ```
> С библиотекой bridge дают **живые** источники всех трёх провайдеров (проверено: merge
> Kodik 10 + CVH 5 + AniBoom 4 озвучек на серию); без неё — вежливо отключаются,
> сайт работает на кэше/синтезе/demo.

Необязательные токены плеер-провайдеров (`.env.local`):

```
KODIK_TOKEN=...     # включает провайдер Kodik (kodikwrapper)
ANIBOOM_TOKEN=...   # слот под будущий парсер Aniboom
```

Без токенов сайт полностью работоспособен: каталог, поиск, расписание и демо-плеер
(публичные тестовые потоки) работают из коробки.

### Архитектура плеер-слоя (проверенная схема)

```
AniList-каталог (id/malId/shikimoriId/slug/year/format/episodes)
        │  + episode / totalEpisodes
        ▼
Next.js /app/anime/[slug]/[episode]
        ▼
GET /api/providers/[slug]/[episode]          ← единая точка входа
        ▼
Provider Registry (cache-first, PROVIDER_MODE=merge|first)
   ├─ локальный embed-кэш (.cache/providers-resolve-cache.json, self-growing)
   ├─ kodik bridge   127.0.0.1:8765 → anime-parsers → episode-specific /seria/… embed
   ├─ multi bridge   127.0.0.1:8766 → anime-dl-core → CVH (animego cdn-iframe) / AniBoom embed
   ├─ kodik-direct   (kodikwrapper, если bridge выключен, а токен жив)
   └─ demo           (офлайн-база, MP4)
        ▼
EpisodeSources: [{ id, label, providerId, providerName, kind: embed|file, embedUrl|files }]
        ▼
Плеер не знает провайдеров: ряд озвучек → embed-iframe или video (+hls.js лениво)
```

- Bridge: `bridges/kodik_bridge.py`, `bridges/multi_player_bridge.py` + контракт в `bridges/README.md`
  (`GET /health`, `POST /resolve` → `sources[]`); нормализатор Next понимает исторические формы ответов.
- Cache-first + self-growing: miss → bridge → запись; hit → мгновенно (флаг «из кэша» в плеере).
- Warmer/hydrator: `npm run warm` (есть ли провайдер у тайтла) и `npm run hydrate`
  (episode-specific embed в кэш, `EPISODES=all` для всех серий), статистика как в оригинале.
- Ошибки bridge не роняют страницу: попадают в `EpisodeSources.errors` и видны флагом в плеере.
- **Кэш источников**: `.cache/providers-resolve-cache.json` содержит **3420 episode-specific записей**
  (Kodik `/seria/…`, CVH `animego.me/cdn-iframe/…`, AniBoom `aniboom.one/embed/…`), импортированных
  из дампа прошлого проекта (`multi-provider-embeds-v154.json` + `kodik-bridge-cache.json`) и дополненных
  runtime-резолвами; TTL legacy-записей — год, живые резолвы bridge перезаписывают их сами.
  На serverless кэш опционально живёт в Upstash Redis (`UPSTASH_REDIS_REST_*`, `lib/providers/cache-kv.ts`).
  Повторный импорт: `npm run import-legacy -- <multi-provider-embeds.json> [kodik-bridge-cache.json]`.

### Совместимость с `.env` исходного проекта

Поддерживаются переменные из вашего `.env.example`/`.env.local` (drop-in):

| Переменная | Назначение |
| --- | --- |
| `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_URL` | бренд, metadataBase, OG, sitemap/robots |
| `DEMO_PROVIDER_ENABLED` / `DEMO_ENABLED` | показ демо-провайдера в списке (резолв остаётся как внутренний фолбэк) |
| `KODIK_ENABLED`, `KODIK_TOKEN` | включение и авторизация Kodik |
| `KODIK_API_BASE_URL` | зеркало API (по умолчанию `https://kodik-api.com`) |
| `KODIK_TIMEOUT_MS`, `KODIK_EPISODE_SEARCH_LIMIT` | таймаут fetcher и limit поиска |
| `KODIK_CACHE_TTL_MS`, `KODIK_CACHE_FILE` | файловый кэш резолвов (TTL и путь) |
| `PROVIDER_CACHE_ENABLED`, `PROVIDER_CACHE_WRITE` | включение кэша и записи |
| `SHIKIMORI_ENABLED`, `SHIKIMORI_USER_AGENT` | второй источник метаданных и UA по правилам Shikimori |
| `ANISKIP_ENABLED` | фолбэк таймингов OP/ED через api.aniskip.com (по MAL-id) |
| `ANIBOOM_ENABLED`, `ANIBOOM_TOKEN` | слот будущего парсера Aniboom |
| `KODIK_BRIDGE_URL/PORT/TIMEOUT_MS` | локальный kodik bridge (8765) |
| `MULTIPLAYER_BRIDGE_URL/PORT/TIMEOUT_MS` | multi-player bridge CVH/AniBoom (8766) |
| `PROVIDER_MODE` | `merge` — озвучки всех провайдеров; `first` — первый ответивший |
| `PROVIDER_TIMEOUT_MS` | таймаут каждого провайдера в merge-режиме |

Диагностика провайдера с вашей машины: `npm run check:kodik` — проходит цепочку
токен → search (shikimori_id) → VideoLinks → качества/тайминги и печатает вердикт.

> Цепочка токенов: ваш `KODIK_TOKEN` → публичный токен плеера Kodik (`getPublicToken`,
> механизм как в AnimeParsers/kdk_tokns). Учтите: Kodik ротатирует публичные токены и может
> блокировать дата-центр IP — если апстрим отклонил токен, провайдер вежливо отдаёт 502,
> плеер показывает ошибку и предлагает демо-поток; смоук-тест допускает 200|409|502 для этого маршрута.

## Переменные окружения (полный список)

Полная схема **с комментариями по каждому блоку** — в [`.env.example`](.env.example);
самопроверка с подсказками по группам сервисов — `npm run check:env`.

| Переменная | Назначение |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME` | домен/имя для metadataBase, OG, sitemap, robots |
| `KODIK_TOKEN` | токен Kodik (иначе авто-пул токенов библиотеки) |
| `KODIK_API_BASE_URL`, `KODIK_TIMEOUT_MS`, `KODIK_EPISODE_SEARCH_LIMIT` | зеркало API, таймаут, limit поиска |
| `DEMO_PROVIDER_ENABLED`, `KODIK_ENABLED`, `ANIBOOM_ENABLED`, `ANIBOOM_TOKEN` | включение провайдеров (ANIBOOM — слот под будущий парсер) |
| `ANISKIP_ENABLED` | фолбэк таймингов OP/ED через api.aniskip.com (по MAL-id) |
| `KODIK_BRIDGE_URL/TIMEOUT_MS`, `MULTIPLAYER_BRIDGE_URL/TIMEOUT_MS` | адреса Python-bridge (пустые = live-слой выключен) |
| `BRIDGE_TOKEN` | bearer-токен bridge за Caddy (deploy/Caddyfile; для локальных bridge не нужен) |
| `BRIDGE_CACHE_TTL` | TTL внутреннего кэша bridge (сек, по умолч. 6 ч) |
| `PROVIDER_MODE`, `PROVIDER_TIMEOUT_MS` | merge/first и таймаут гонки провайдеров |
| `PROVIDER_CACHE_ENABLED/WRITE`, `PROVIDER_CACHE_WRITE_DEBOUNCE_MS`, `KODIK_CACHE_TTL_MS`, `KODIK_CACHE_FILE` | файловый кэш источников |
| `UPSTASH_REDIS_REST_URL/TOKEN` | KV-режим кэша источников (serverless), иначе файл |
| `ADMIN_TOKEN` | вход в админку (/admin/login, httpOnly-cookie) |
| `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_KEY` | общие отзывы/комментарии + аккаунты и синхронизация (schema: supabase/schema.sql; service_key — только для edge-функции) |
| `TURNSTILE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | капча Cloudflare Turnstile в форме отзывов (задавать парой!) |
| `NEXT_PUBLIC_IMG_PROXY` | `0` отключает image-proxy /img?url= |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry: ошибки фронтенда (ленивая инициализация) |
| `TG_BOT_TOKEN`, `TG_CHAT_ID` | алерт при 20+ ошибках парсеров за час |
| `NEXT_PUBLIC_ANALYTICS_SRC/DOMAIN` | Plausible/Umami (src скрипта + домен) |
| `VAPID_PUBLIC/PRIVATE`, `PUSH_CONTACT` | web-push рассылка о сериях (иначе ключи в data/vapid.json) |
| `SHIKIMORI_USER_AGENT` | UA для запросов к Shikimori (требование API) |
| `SMOKE_URL`, `LOADTEST_URL`, `CONC`, `E2E_BASE` | цели для smoke/loadtest/playwright |
| `CONCURRENCY`, `BASE`, `HYDRATE_MODE`, `EPISODES` | параметры скриптов warm/hydrate/enrich |

## Команды

```bash
npm run dev | build | start     # разработка / прод (build: NODE_OPTIONS=700МБ, webpack)
npm run preflight               # check:env + typecheck + unit + build + smoke одним прогоном
npm run check:env               # аудит .env.local по группам сервисов (подсказки, что включить)
npm run test                    # vitest unit — 16 тестов ядра (registry/synthesize/catalog/captcha/fixtures)
npm run smoke                   # 30 HTTP-проверок маршрутов (SMOKE_URL=… при другом порту)
npx playwright install chromium # один раз: браузер для E2E
npx playwright test             # E2E — 5 сценариев (E2E_BASE=http://localhost:3100 при своём порту)
npm run warm | hydrate | enrich # наполнение кэша источников и RU-данных
npm run check:kodik             # диагностика Kodik-цепочки с вашей машины (токен → search → VideoLinks)
npm run check:posters           # HEAD-проверка всех постеров каталога (.cache/broken-posters.json)
npm run check:readme            # сверка заявленных в README/LIMITS чисел с каталогом
npm run check:catalog           # gate качества данных (пороги — в шапке скрипта)
npm run report:catalog          # тот же отчёт без порогов (всегда exit 0)
npm run repair:offline          # идемпотентный офлайн-ремонт каталога (бэкап в backups/)
npm run clean:titles            # отчёт по артефактам каталога (fix — чистка с бэкапом)
npm run loadtest                # 100 параллельных резолвов: p50/p95/ошибки (LOADTEST_URL/CONC;
                                #   BRIDGE_URL=http://127.0.0.1:8765 — нагрузка прямо на bridge)
npm run measure:vitals          # LCP/CLS/FCP холод/тепло по 4 страницам (Chromium CDP)
npm run backup                  # снапшот titles.json в backups/ (+ GH Actions еженедельно)
npm run repair -- --report      # диагностика качества данных каталога (см. ниже)
npm run import:titles           # одноразовый перенос titles.json → Supabase public.titles
node scripts/sync-airing.mjs    # расписание: AniList → airing_schedule (нужен SUPABASE_SERVICE_KEY)
node scripts/sync-episodes.mjs --mode ongoing   # серии: номера/даты → episodes
node scripts/sync-sources.mjs --mode bulk       # озвучки: Kodik → episode_sources (нужен KODIK_TOKEN)
node scripts/fetch-episode-dates.mjs [--report]   # точные даты серий finished-тайтлов (resumable)
docker compose up --build       # весь стек: web + 2 bridge
```

## Публикация в сеть и база данных

Подробный гайд по бесплатным вариантам (Vercel Hobby, Cloudflare Tunnel с домашнего ПК,
Oracle Always Free VPS, Cloudflare Pages) и рекомендациям по БД (сейчас БД не нужна;
при аккаунтах — Supabase/Neon; кэш на serverless — Upstash/KV) — в [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Чек-лист публикации в сеть

1. `npm install && npm run check:env` — скрипт покажет, какие группы переменных не заполнены.
2. `.env.local`: свой `ADMIN_TOKEN` (`openssl rand -hex 24`), `NEXT_PUBLIC_SITE_URL=https://ваш-домен`
   (уйдёт в metadataBase/OG/sitemap/robots), при наличии — `KODIK_TOKEN`; замените `example.com`
   в `public/.well-known/security.txt` на ваш домен.
3. `npm run build && npm run start` (или PM2/Docker за `next start`).
4. `npm run enrich` — догоняет RU-названия/описания Shikimori (resumable, можно фоном).
5. `npm run warm && npm run hydrate` — наполняет кэш источников; дальше он растёт сам (cache-first).
6. Опционально bridge: `python bridges/kodik_bridge.py`, `python bridges/multi_player_bridge.py`.
7. Проверка: `npm run smoke` (SMOKE_URL=https://ваш-домен), `npm run typecheck`.
8. Юридически: каталог хранит только метаданные и указатели; в футере — дисклеймер и блок
   «Правообладателям». Файлы видео на сервере отсутствуют.

## Плеер-провайдеры и внешние источники

- **Серверный прокси** `GET /api/providers/[slug]/[episode]?provider=…`: клиент не видит токенов.
  Ответ — `ResolveResult`: прямые файлы (HLS/MP4) с качествами и таймингами OP/ED либо embed-iframe.
- **Kodik** — [`kodikwrapper`](https://www.npmjs.com/package/kodikwrapper) (npm): поиск по `shikimori_id`
  из обогащённого датасета, `VideoLinks.getLinks` для прямых m3u8, `parseSkipButtons` для кнопки
  «Пропустить опенинг» с реальными таймингами. Если прямые ссылки недоступны — фолбэк в embed-плеер Kodik.
- **HLS** воспроизводится лениво подгружаемым `hls.js` (MP4 — нативно), качество переключается в меню плеера.
- **Каталог 8017 тайтлов**: основной источник — таблица Supabase `public.titles`
  (`CATALOG_SOURCE=db`, прайм один раз на процесс из `instrumentation.ts`),
  `lib/data/titles.json` — fallback и вход для одноразового импорта
  (`node scripts/import-titles-to-db.mjs`). Метаданные AniList (постеры, баннеры, трейлеры,
  MAL-id, связи франшиз, персонажи) + RU-названия/описания Shikimori (7180 из 8017);
  точные даты выхода серий (`epdates`) — `node scripts/fetch-episode-dates.mjs` (resumable);
  дообогащение: `npm run enrich` (resumable, пишет по мере прогресса).
- **Число серий** считает одна функция `lib/episodes.ts` (ТЗ-правило: фильм → 1,
  онгоинг → сколько вышло + «1134+ серий» без объявленного итога, анонс → числа нет).
  Заглушки импортера (24 для онгоингов, 12 для остальных) удалены из `scripts/expand-catalog.mjs`
  и вычищены из данных `scripts/repair-catalog.mjs`.
- **Источники видео — из БД, а не из bridge**: таблицы `episode_sources` (озвучка тайтла)
  и `episode_source_urls` (ссылка конкретной серии; у Kodik hash уникален для серии).
  Наполняет воркер `scripts/sync-sources.mjs` ВНЕ Vercel (GitHub Actions/VPS): на Vercel нет
  локальных bridge, а Kodik с дата-центр IP отвечает 401.
  Синтез URL по шаблону и «подбор пулом озвучек» на проде выключены
  (`PROVIDER_UNVERIFIED_FALLBACK`), демо-поток тоже (`DEMO_PROVIDER_ENABLED`) —
  вместо них плеер честно показывает «Источников пока нет».
  Индикация доступности (`/api/availability/[slug]`): зелёная точка — только реальный ответ
  провайдера, жёлтая — непроверенный синтез/подбор, серая — источников нет.
- **Shikimori (.io)** — второй источник метаданных: `scripts/refresh-shikimori.mjs` обогащает
  `lib/data/titles.json` (id, русское имя, RU-описание); на детальной странице описание дублируется
  блоком «Описание по данным Shikimori» со ссылкой на первоисточник.
- **ТВ-режим**: пространственная D-pad навигация стрелками (настройка в профиле).

## Что внутри

| Раздел | Маршрут | Особенности |
| --- | --- | --- |
| Главная | `/` | Герой-карусель, лента «Продолжить просмотр», подборки, блок «Сегодня выходит», жанры |
| Каталог | `/catalog` | Серверные фильтры (жанр/тип/статус/год/сортировка/пагинация) через URL-параметры |
| Жанры | `/genres`, `/genre/[slug]`, `/genre/[slug]/[page]` | 60 тайтлов на страницу, сортировка и пагинация в пути (не в query) — иначе маршрут становится динамическим и Vercel отдаёт его без кэша |
| Тайтл | `/anime/[slug]` | Бэкдроп, метаданные, описание, серии с прогрессом, трейлер, похожие тайтлы, OG-карточка |
| Плеер | `/anime/[slug]/[episode]` | Кастомный UI: прогресс, скорость, PiP, полноэкранный, пропуск опенинга, автопереход, горячие клавиши |
| Расписание | `/schedule` | Сетка из таблицы `airing_schedule` (воркер каждые 30 мин), ISR 600 с; пусто → нормальное пустое состояние |
| Поиск | `/search`, `/api/search` | Ранжированный поиск по RU/ромадзи/EN/жанрам |
| Профиль | `/profile/*` | Закладки, история с прогрессом, настройки (акцент, автопереход) — localStorage |
| Служебное | `/sitemap.xml`, `/robots.txt`, `404`, `error` | SEO и граничные состояния |

PWA: манифест + service worker (`public/sw.js`) — офлайн-оболочка, кэш постеров AniList и расписания.
Горячие клавиши: `Ctrl/Cmd+K` или `/` — командная палитра; в плеере —
 `Space/K` пауза, `←/→` ±10 c, `↑/↓` громкость, `M` звук, `F` полный экран, `N` следующая серия.

## Архитектура

```
app/          маршруты App Router (RSC по умолчанию), API-роуты, robots/sitemap/icon
components/   anime · layout · player · profile · schedule · system · ui
lib/          types · catalog (датасет и запросы) · schedule (live+fallback) ·
              library (локальный профиль) · providers/ (реестр + kodik-резолвер) ·
              shikimori (второй источник) · tv (D-pad навигация) · art (генеративные постеры)
lib/data/     titles.json — снапшот каталога (8017 тайтлов; fallback при CATALOG_SOURCE=file),
              manual-sources.json
supabase/     migrations/ — схема (в т.ч. titles, airing_schedule, episodes, episode_sources),
              functions/submit-review
```

Принципы:

- **Сервер-first**: каталог, фильтры и жанры рендерятся RSC без клиентского JS; главная и расписание — ISR (`revalidate = 3600`).
- **Офлайн-надёжность**: у каждого постера детерминированный генеративный SVG-фолбэк (`lib/art.ts`);
  расписание читает таблицу `airing_schedule`, а при её недоступности — реальный график из каталога
  (демо-неделя из хеша слага удалена: на проде она показывала «One Piece серия 5» с пометкой «демо»).
- **Локальный профиль**: закладки/история/настройки в localStorage через `useSyncExternalStore` — без регистрации и БД.
- **Реестр провайдеров**: `lib/providers/registry.ts` — порядок manual → cache → live-bridge
  (Kodik/CVH/AniBoom) → synthesize → guess-пул озвучек → demo; health-gate bridge 1.5 с,
  circuit-breaker (5 ошибок → изоляция 5 мин), метрики hit/miss/latency в `/api/metrics`.

## Источники данных

- Метаданные, постеры, баннеры и расписание — [AniList GraphQL](https://docs.anilist.co/).
- Русские названия и описания — редакция каталога (снапшот `lib/data/titles.json`).
- Видео демо-плеера — публичные тестовые ролики Google (gtv-videos-bucket). **На проде демо-поток
  выключен** (`DEMO_PROVIDER_ENABLED` по умолчанию действует только в dev): показывать Big Buck Bunny
  вместо аниме хуже, чем честно написать «Источников пока нет». Права на тайтлы принадлежат правообладателям.

## Схема данных Supabase и воркеры (аудит 2026-10)

Раньше весь каталог, расписание и источники видео жили в git-файлах
(`lib/data/titles.json` 28 МБ и `.cache/providers-resolve-cache.json` 98 МБ), которые
коммитились кронами каждые 6 часов. Теперь производные данные — в Supabase, а git-файлы
остались fallback'ом и входом для одноразового импорта.

| Таблица | Назначение | Кто пишет | Кто читает |
| --- | --- | --- | --- |
| `titles` | каталог: названия, год, формат, статус, `episodes_total`, `episodes_released`, жанры, постеры, описания | `scripts/import-titles-to-db.mjs` | `lib/catalog.ts` (прайм на старте процесса, `CATALOG_SOURCE=db`) |
| `title_relations`, `title_characters` | связи франшизы и персонажи | тот же импорт | страница тайтла |
| `airing_schedule` | сетка выхода серий (окно −2…+8 дней) | `scripts/sync-airing.mjs` | `lib/schedule.ts` → `/schedule`, `/api/schedule`, блок «Новые эпизоды» на главной |
| `episodes` | номера, даты и названия серий | `scripts/sync-episodes.mjs` | `lib/episode-data.ts` → «График выхода серий» и «Выход серий» на странице тайтла |
| `episode_sources` | озвучка тайтла (провайдер, translation, embed, статус ok/dead) | `scripts/sync-sources.mjs` | `lib/episode-sources.ts` → `/api/providers`, robots/index страниц серий, зелёная точка |
| `episode_source_urls` | ссылка конкретной серии (нужно для Kodik: hash уникален для серии) | тот же воркер | там же |

RLS у всех таблиц одинаковый: публичное чтение, запись только `service_role`.
Миграции идемпотентные (`create table if not exists`, `drop policy if exists`):
`supabase/migrations/20261012_{titles,airing_schedule,episodes,episode_sources}.sql`.

### Воркеры и cron

| Workflow | Расписание | Что делает | Секреты |
| --- | --- | --- | --- |
| `sync-airing.yml` | каждые 30 минут | AniList `airingSchedules` → `airing_schedule` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| `sync-episodes.yml` | 6 часов (онгоинги) + сутки (полный проход) | номера/даты серий, `episodes_aired` Shikimori, опционально названия через Jikan | те же |
| `sync-sources.yml` | сутки (онгоинги) + неделя (bulk) | Kodik `/list` или `/search` → `episode_sources` + `episode_source_urls` | те же + `KODIK_TOKEN` |
| `sync-catalog.yml` | 6 часов | как прежде: новые тайтлы из AniList/Jikan в `titles.json` | — |

### Защита правок данных от кронов

`sync-catalog.yml` каждые 6 часов добавляет новые тайтлы и коммитит `titles.json`.
Новые записи приходят из AniList/Jikan сырыми, поэтому между генерацией и коммитом
в пайплайн встроены два обязательных шага:

1. `node scripts/repair-catalog.mjs --fix-episodes --fix-desc --fix-dupes --fix-studios --apply`
   — офлайн-ремонт (идемпотентность проверена двойным прогоном: второй даёт 0 изменений);
2. `node scripts/check-catalog-quality.mjs --gate` — предохранитель: коммит отменяется,
   если число тайтлов упало больше чем на 2 % или доля дефектов выше порога
   (обрывы описаний 10 %, опровергнутые заглушки серий 1 %, заглушки у анонсов 1 %,
   лицензиары в студиях 0,5 %, одинаковые названия у разных лет 1 %).

Тот же gate работает в `ci.yml`. Сетевой ремонт (`--fix-desc-net`, `--fix-shiki-eps`,
`--fix-characters`) в cron НЕ входит — он в отдельном `repair-catalog-descriptions.yml`
по `workflow_dispatch` с `--limit`/`--cursor` для прогона порциями.

Важно про заглушки: в каталоге остаётся 114 онгоингов с `episodes` 12/24, но это не
дефект — у них нет ни `airing`, ни `epdates`, то есть опровергнуть число нечем, и
`lib/episodes.ts` показывает их как «вышло N, итог неизвестен». Gate ловит только
заглушку, противоречащую графику эфира (`aired > stated`).

Все воркеры: resumable-чекпоинт в `.cache/`, экспоненциальная задержка, уважение
`Retry-After` при 429, лимиты из LIMITS.md (AniList 90 запросов/мин, Shikimori ~1/с
и не более 3 воркеров, Kodik ~1/с). Без секретов воркер выходит с кодом 2 и ничего не ломает.

### Почему воркеры не на Vercel

Функция Vercel Hobby живёт ≤10 с и не имеет постоянных процессов, а Kodik с IP
дата-центров отвечает 401 (LIMITS.md, проверено 23.09.2026). Поэтому обход внешних API
вынесен в GitHub Actions, а рантайм читает только БД. Локальные Python-bridge
(`bridges/*.py`, порты 8765/8766) остались для разработки и self-hosted-варианта:
`lib/config/providers.config.ts` обнуляет loopback-адреса при `env.VERCEL`.


## Исправление срока хранения старого кэша источников

По умолчанию TTL прямых источников — 24 часа, как в `.env.example`. Если файл кэша был создан версией, где значение по умолчанию составляло 10 минут, запустите миграцию из корня проекта:

```powershell
npm run cache:migrate-ttl
npm run cache:migrate-ttl -- --apply
```

Первая команда только показывает план; вторая создаёт резервную копию и повышает TTL записей с прямыми источниками до настроенного срока. Ссылки не меняются. Записи demo/guess/synth не продлеваются. Если срок задан переменной `KODIK_CACHE_TTL_MS`, миграция использует именно его.

## Массовое заполнение недостающих серий

Гидратор проверяет полный `lib/data/titles.json`, а не только sitemap. В режиме `gaps` он запрашивает каждую серию, для которой нет прямого результата провайдера в кэше. Метки `guess`/`synth` не считаются заполнением. В режиме `live` он обновляет все эпизоды, обходя кэш и синтез URL.

1. Поднимите Next.js (`npm run dev`) и нужные bridge (`bridges/kodik_bridge.py`, `bridges/multi_player_bridge.py`) с доступными провайдерами.
2. Сначала безопасно оцените объём через `npm run hydrate -- --dry-run`. План будет в `.cache/hydrate-plan.json`.
3. Для тестового прогона в PowerShell: `$env:LIMIT='25'; $env:MAX_EPISODES='200'; $env:HYDRATE_CONCURRENCY='4'; npm run hydrate`.
4. Для полного заполнения пропусков: `Remove-Item Env:LIMIT, Env:MAX_EPISODES -ErrorAction SilentlyContinue; $env:HYDRATE_MODE='gaps'; $env:HYDRATE_CONCURRENCY='4'; npm run hydrate`.

Инвентаризация по умолчанию (`HYDRATE_INVENTORY_SOURCE=auto`) читает локальный `.cache/providers-resolve-cache.json`, если включён файловый кэш и Upstash KV не настроен. Это быстро и не создаёт тысячи HTTP-запросов к собственному API. При активном Upstash используется API. Можно указать `HYDRATE_INVENTORY_SOURCE=api` для проверки через endpoint или `file` для принудительного чтения локального кэша (не работает с Upstash).

При API-инвентаризации скрипт показывает прогресс и в последовательном режиме прекращает проверку, когда у достаточного количества разных тайтлов обнаружен хотя бы один пропуск. При заданном `MAX_EPISODES` задачи выбираются по кругу: сначала по одной недостающей серии у разных тайтлов, затем следующие пропуски этих тайтлов. Это не даёт длинным сериалам занять весь пакет. По умолчанию один запрос одновременно с паузой между тайтлами; при HTTP 429 уважается `Retry-After` и применяется экспоненциальная задержка. Если реальный запуск встретил ошибки инвентаризации, он останавливается до запросов к провайдерам, чтобы неизвестные серии не стали ложными пропусками.

5. Результаты сохраняются в `.cache/hydrate-report.json`; успешные прямые источники — в `.cache/providers-resolve-cache.json` или Upstash, если он настроен. Повторный запуск безопасен: уже заполненные серии пропускаются, неудачные не исключаются навсегда.

Запускайте массовый процесс на компьютере/VPS, где есть постоянное файловое хранилище и работающие bridge. Не используйте Vercel без настроенного Upstash для массового заполнения: файловый кэш serverless-функции не является постоянным хранилищем.
