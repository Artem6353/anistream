# AniStream 2.0

Каталог и плеер аниме на **Next.js 16.3.5 (App Router, RSC/ISR) + TypeScript (strict)**:
**5002 тайтла** (AniList + Shikimori-обогащение), многослойный реестр источников видео,
плеер v3 с озвучками и графиком серий, социалка, админка модерации. Пересборка проекта
`сайт_для_аниме` (AniStream) с упором на надёжность, скорость и дизайн. Анализ исходного
проекта — в [`docs/ANALYSIS.md`](docs/ANALYSIS.md), статус handoff-ТЗ — в [`docs/REPORT.md`](docs/REPORT.md).

## Быстрый старт

```bash
npm install        # 1) зависимости — без них Windows скажет «"next" не является внутренней или внешней командой»
npm run dev        # 2) терминал №1: http://localhost:3000, дождаться «✓ Ready»
```

Дальше — во **втором** терминале (скрипты ходят в работающий сервер):

```bash
npm run warm       # 3) warmer: у каких тайтлов есть провайдер-источники (.cache/warm-summary.json)
npm run hydrate    # 4) hydrator: episode-specific embed в self-growing кэш
npm run smoke      # HTTP-проверка маршрутов (SMOKE_URL=…, если порт другой)
npm run build && npm run start   # прод-сборка и прод-сервер
npm run typecheck  # tsc --noEmit
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
npm run check:posters           # HEAD-проверка всех 5002 постеров (.cache/broken-posters.json)
npm run clean:titles            # отчёт по артефактам каталога (fix — чистка с бэкапом)
npm run loadtest                # 100 параллельных резолвов: p50/p95/ошибки (LOADTEST_URL/CONC;
                                #   BRIDGE_URL=http://127.0.0.1:8765 — нагрузка прямо на bridge)
npm run measure:vitals          # LCP/CLS/FCP холод/тепло по 4 страницам (Chromium CDP)
npm run backup                  # снапшот titles.json в backups/ (+ GH Actions еженедельно)
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
- **Каталог 5002 тайтла** (`lib/data/titles.json`): метаданные AniList (постеры, баннеры, трейлеры,
  MAL-id, связи франшиз, персонажи) + RU-названия/описания Shikimori (покрытие 4998/5002);
  точные даты выхода серий (`epdates`) — `node scripts/fetch-episode-dates.mjs` (resumable);
  дообогащение: `npm run enrich` (resumable, пишет по мере прогресса).
- **Все серии работают без bridge**: синтез episode-URL из кэш-шаблонов (номер серии — часть URL
  у CVH/AniBoom), gap-fill пулом глобальных озвучек CVH по shikimoriId, индикация доступности
  серий на странице тайтла (`/api/availability/[slug]`: зелёная точка — кэш/синтез, жёлтая — подбор,
  серая — тест-поток) и честное уведомление в плеере, когда источников нет.
- **Shikimori (.io)** — второй источник метаданных: `scripts/refresh-shikimori.mjs` обогащает
  `lib/data/titles.json` (id, русское имя, RU-описание); на детальной странице описание дублируется
  блоком «Описание по данным Shikimori» со ссылкой на первоисточник.
- **ТВ-режим**: пространственная D-pad навигация стрелками (настройка в профиле).

## Что внутри

| Раздел | Маршрут | Особенности |
| --- | --- | --- |
| Главная | `/` | Герой-карусель, лента «Продолжить просмотр», подборки, блок «Сегодня выходит», жанры |
| Каталог | `/catalog` | Серверные фильтры (жанр/тип/статус/год/сортировка/пагинация) через URL-параметры |
| Жанры | `/genres`, `/genre/[slug]` | Серверные подборки с сортировками |
| Тайтл | `/anime/[slug]` | Бэкдроп, метаданные, описание, серии с прогрессом, трейлер, похожие тайтлы, OG-карточка |
| Плеер | `/anime/[slug]/[episode]` | Кастомный UI: прогресс, скорость, PiP, полноэкранный, пропуск опенинга, автопереход, горячие клавиши |
| Расписание | `/schedule` | Живая неделя AniList (`/api/schedule`, кэш 10 мин) + офлайн-фолбэк |
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
lib/data/     titles.json — снапшот каталога: 5002 тайтла (AniList + Shikimori), manual-sources.json
```

Принципы:

- **Сервер-first**: каталог, фильтры и жанры рендерятся RSC без клиентского JS; главная и расписание — ISR (`revalidate = 3600`).
- **Офлайн-надёжность**: у каждого постера детерминированный генеративный SVG-фолбэк (`lib/art.ts`);
  расписание при недоступности AniList показывает демо-неделю и сама апгрейдится в браузере через `/api/schedule`.
- **Локальный профиль**: закладки/история/настройки в localStorage через `useSyncExternalStore` — без регистрации и БД.
- **Реестр провайдеров**: `lib/providers/registry.ts` — порядок manual → cache → live-bridge
  (Kodik/CVH/AniBoom) → synthesize → guess-пул озвучек → demo; health-gate bridge 1.5 с,
  circuit-breaker (5 ошибок → изоляция 5 мин), метрики hit/miss/latency в `/api/metrics`.

## Источники данных

- Метаданные, постеры, баннеры и расписание — [AniList GraphQL](https://docs.anilist.co/).
- Русские названия и описания — редакция каталога (снапшот `lib/data/titles.json`).
- Видео демо-плеера — публичные тестовые ролики Google (gtv-videos-bucket). Права на тайтлы принадлежат правообладателям.
