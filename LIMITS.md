# LIMITS.md — лимиты бесплатных тарифов и пороги (A8.2)

| Сервис | Лимит free | Порог миграции (80%) | Что мигрировать |
|---|---|---|---|
| Vercel Hobby | 100 ГБ трафика/мес, serverless-invocations ~100k/мес, функция ≤10 с (Hobby) | 80 ГБ / 80k | статика → Cloudflare Pages/R2; тяжёлые задачи → VPS cron |
| Supabase Free | 500 МБ БД, 5 ГБ egress, 50k MAU auth, 500k edge-вызовов | 400 МБ / 4 ГБ | R2 для изображений; Neon/Turso для таблиц |
| Neon Free | 0.5 ГБ хранилища, 191 ч compute/мес | 0.4 ГБ | Supabase/PlanetScale |
| Upstash Redis Free | 500k команд/мес., 256 МБ данных, 10 ГБ bandwidth/мес. (проверено 11.10.2026) | 400k команд/мес. / 8 ГБ bandwidth/мес.; для текущей базы отдельный guard по фактическому лимиту памяти | Cloudflare KV или FS-кэш на VPS при устойчивом приближении к месячным порогам |
| Oracle Always Free VPS | 4 ARM CPU / 24 ГБ RAM / 200 ГБ диск, 10 ТБ egress | — | сам хостит всё |
| Kodik API | ~1 req/s на токен (практика); с датацентр-IP — 401 (проверено 23.09.2026) | — | пул токенов в bridge; хостинг bridge — residential/VPS, см. DEPLOY.md §A0.1 |
| Shikimori API | rate-limit по IP, ~1 rps | — | воркеры ≤3 + паузы |
| AniList GraphQL | 90 запросов/мин по IP (complexity-based), 429 + Retry-After | — | батчи по 50 id + паузы (как в fetch-episode-dates/enrich) |
| Google Fonts/CDN картинок | — | — | свой image-proxy /img (уже есть) |

## Git-хранилище каталога (аудит 30.09)

`lib/data/titles.json` — 28 МБ, `.cache/providers-resolve-cache.json` — 98 МБ (трекается
намеренно как seed-кэш), и sync-catalog/push-daily коммитят их каждые 6 ч:
каждая версия добавляет ~2–3 МБ в pack-файл НАВСЕГДА (темп роста ~250–350 МБ/год).

**Статус на 12.10.2026 (аудит):** подготовлен перенос каталога в Supabase —
миграция `20261012_titles.sql`, импорт `scripts/import-titles-to-db.mjs`, чтение
через `CATALOG_SOURCE=db` с праймом в `instrumentation.ts`, файл остался fallback'ом.
Шаг 4 (убрать коммиты titles.json из workflows и `git rm -r --cached .cache`)
намеренно НЕ выполнен: его можно делать только после того, как импорт отработал
на проде и `npm run smoke` прошёл против БД (иначе прод останется без каталога).
Порядок включения — в docs/REPORT.md, раздел «Ручные действия владельца».

Оценка вариантов:

| Вариант | Вердикт |
|---|---|
| Git LFS | **Отклонён**: LFS free — 1 ГБ storage И 1 ГБ bandwidth/мес; одна версия файла 28 МБ → ~36 версий/мес исчерпают квоту за месяц, clone без квоты ломается. |
| Отдельный data-репозиторий | Рабочий вариант: каталог живёт в своём репо, web-репо тянет его на build (checkout/s3-артефакт). Требует правки sync-catalog + деплоя. |
| Внешняя БД (Supabase-таблица titles) | Самый чистый долгосрок: скрипты sync пишут в БД, приложение читает с кэшем. Большой рефакторинг (~30 файлов читают titles.json). |
| Статус-кво + мониторинг | Принято временно: CI печатает размер pack-файла (шаг repo-size в ci.yml), порог миграции — 300 МБ. |

Сопутствующее: `--max-old-space-size=700` в `npm run build` — сознательный лимит
под 1 ГБ VPS; при росте каталога за ~15k тайтлов сборке может не хватить — порог
миграции: OOM сборки → поднять до 1024+ или перенести сборку в CI/Vercel.

## Покрытие rate-limit (аудит 30.09, P1-3 — решение)

Покрыто (`lib/rateLimit.ts` LIMITS): /api/search, /api/providers, /api/social/*,
/api/reco, /api/availability, /api/push, /api/report, /api/dmca, /api/quiz,
/api/admin/login (5/мин), /api/admin (60/мин).
Осознанно НЕ покрыто: /api/titles и /api/schedule (ISR `revalidate=600` — бурст
сервит край, до сервера доходит ≤1 RPS; плюс Allow в robots только для Googlebot),
/api/health (лёгкий self-monitor; злоупотребление бессмысленно), /api/random
(307-редирект), /api/metrics (закрыт admin-cookie до любых лимитов).
Решение пересматривать при появлении write-поверхности или тяжёлых вычислений в этих роутах.

## Аудит 2026-10: добавленные пороги и замеры

| Что | Замер | Порог / действие |
|---|---|---|
| Страница жанра без пагинации | `/genre/comedy` — **19 677 КБ HTML, 3,5–4,2 с, `cache-control: private, no-store`, `x-vercel-cache: MISS`** (3495 карточек) | Разбито на 60 карточек + сегменты пути `/genre/[slug]/pop-2`; стало **384 КБ** и `s-maxage=1800`. Порог: >1 МБ HTML на страницу или >1 с TTFB — уменьшать `GENRE_PER_PAGE` |
| ISR на тайтлах/сериях | `revalidate = 3600` НЕ действовал: маршрут был динамическим (нет `generateStaticParams`), каждый просмотр = вызов функции + парсинг 28 МБ JSON | Добавлены `generateStaticParams` + `dynamicParams`; on-demand страница после первого запроса отдаётся за ~16 мс из кэша |
| Предрендер на сборке | 120 страниц тайтлов собираются в 1 ГБ RAM/heap 700 МБ (801 страница, 2,2 мин). **10 страниц серий уже роняют сборку** в «Reached heap limit» (страница тянет PlayerShell + hls.js) | `STATIC_TITLE_LIMIT=120`, `STATIC_EPISODE_TITLE_LIMIT=0`. На билд-машине Vercel памяти больше — можно поднимать через env |
| Статический sitemap | 4 файла по ~4000 URL роняли сборку по памяти; `generateSitemaps()` + `force-dynamic` в Next 16.3.8 не создаёт индекс `/sitemap.xml` вовсе и отдаёт пустые urlset | Sitemap — явные route-хендлеры (`lib/sitemap.ts`, `app/sitemap.xml/route.ts`, `app/sitemap/[id]/route.ts`), `dynamic` + `s-maxage=3600` |
| `.cache/providers-resolve-cache.json` (98 МБ) | Чтение файла на каждый тайтл роняло процесс в «FATAL ERROR: Reached heap limit» (обход 500 тайтлов в sitemap) | Ветка sitemap с сериями работает только при настроенной БД. **Риск прода**: функция Vercel = 1024 МБ, один резолв поднимает ~100 МБ JSON в память. Действие: перевести кэш на Upstash (`scripts/migrate-provider-cache-to-upstash.mjs`) или убрать файл из рантайма после наполнения `episode_sources` |
| Память сборки | `--max-old-space-size=700` в `scripts/build.mjs` | При OOM на Vercel поднять до 1024+; порог — 8017 тайтлов уже впритык на 1 ГБ машине |

## Ключевые риски
1. **Upstash quota — обновлено 11.10.2026**: актуальный Free plan указывает 500k команд/мес.,
   10 ГБ bandwidth/мес. и 256 МБ data size; источник: [официальный прайсинг](https://upstash.com/pricing/redis).
   Подключённая база `aninova` по API сообщает `db_request_limit=500000`, но её отдельный
   `db_memory_threshold=64 MiB` ниже общего публичного лимита — поэтому миграционный guard остаётся
   консервативным (45,000,000 байт), пока поведение storage не будет проверено на реальном заполнении.
   Снимок usage на 11.10.2026: 3,995 запросов за месяц, 997 за текущий день, 4.6 КБ текущего storage.
   KV-адаптер (`lib/providers/cache-kv.ts`) включается **только** при заданных
   `UPSTASH_REDIS_REST_URL/TOKEN`; без них кэш источников файловый (`PROVIDER_CACHE_WRITE_DEBOUNCE_MS`
   коалесцирует записи). Порог для мониторинга — 400k команд/мес. и 8 ГБ bandwidth/мес.;
   при устойчивом приближении к 80% переводить provider cache на Cloudflare KV или FS-кэш на VPS
   (вариант C в DEPLOY.md).

2. **ISR storm (A8.3)**: revalidate выставлены (тайтл 1 ч, каталог 30 мин, ongoing 10 мин) — Vercel регенерирует страницу максимум раз в интервал, краулер не создаёт лавину.
3. **Egress Supabase 5 ГБ**: постеры идут через /img с FS-кэшем и годовым Cache-Control — egress минимальный.
4. **Bandwidth Vercel**: видео не проксируется (iframe/HLS идут напрямую к источникам) — основной трафик это картинки, которые кэшируются.

## Backup (A8.4)
- `node scripts/backup-titles.mjs` → backups/ (git-ignored), далее `rclone copy backups/ remote:anistream-backups/`.
- GH Actions `backup-weekly.yml` коммитит снапшот titles.json в ветку `backups` (изолированно от main).
- Restore drill: `git checkout backups -- lib/data/titles.json && npm run build` — проверено.
