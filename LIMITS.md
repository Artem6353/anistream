# LIMITS.md — лимиты бесплатных тарифов и пороги (A8.2)

| Сервис | Лимит free | Порог миграции (80%) | Что мигрировать |
|---|---|---|---|
| Vercel Hobby | 100 ГБ трафика/мес, serverless-invocations ~100k/мес, функция ≤10 с (Hobby) | 80 ГБ / 80k | статика → Cloudflare Pages/R2; тяжёлые задачи → VPS cron |
| Supabase Free | 500 МБ БД, 5 ГБ egress, 50k MAU auth, 500k edge-вызовов | 400 МБ / 4 ГБ | R2 для изображений; Neon/Turso для таблиц |
| Neon Free | 0.5 ГБ хранилища, 191 ч compute/мес | 0.4 ГБ | Supabase/PlanetScale |
| Upstash Redis Free | 10k команд/день (!), 256 МБ | 8k/день | Cloudflare KV (free 100k reads/день) или FS-кэш на VPS |
| Oracle Always Free VPS | 4 ARM CPU / 24 ГБ RAM / 200 ГБ диск, 10 ТБ egress | — | сам хостит всё |
| Kodik API | ~1 req/s на токен (практика); с датацентр-IP — 401 (проверено 23.09.2026) | — | пул токенов в bridge; хостинг bridge — residential/VPS, см. DEPLOY.md §A0.1 |
| Shikimori API | rate-limit по IP, ~1 rps | — | воркеры ≤3 + паузы |
| AniList GraphQL | 90 запросов/мин по IP (complexity-based), 429 + Retry-After | — | батчи по 50 id + паузы (как в fetch-episode-dates/enrich) |
| Google Fonts/CDN картинок | — | — | свой image-proxy /img (уже есть) |

## Git-хранилище каталога (аудит 30.09)

`lib/data/titles.json` — 28 МБ, и sync-catalog/push-daily коммитят его каждые 6 ч:
каждая версия добавляет ~2–3 МБ в pack-файл НАВСЕГДА (сейчас ~15 МБ pack, темп
роста ~250–350 МБ/год). Оценка вариантов:

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

## Ключевые риски
1. **Upstash 10k команд/день** — статус после итерации 3.0: KV-адаптер подключён
   (`lib/providers/cache-kv.ts`) и включается **только** при заданных `UPSTASH_REDIS_REST_URL/TOKEN`;
   без ключей кэш источников — файловый (`PROVIDER_CACHE_WRITE_DEBOUNCE_MS` коалесцирует записи),
   т.е. лимит Upstash не расходуется вовсе. На serverless с KV: ~1 GET на резолв + debounced SET —
   10k команд/день ≈ ~5–8k резолвов/день. Порог: при >5k GET/день — `PROVIDER_CACHE_KV=cf`
   (Cloudflare KV) или переезд на VPS с FS-кэшем (вариант C в DEPLOY.md).

2. **ISR storm (A8.3)**: revalidate выставлены (тайтл 1 ч, каталог 30 мин, ongoing 10 мин) — Vercel регенерирует страницу максимум раз в интервал, краулер не создаёт лавину.
3. **Egress Supabase 5 ГБ**: постеры идут через /img с FS-кэшем и годовым Cache-Control — egress минимальный.
4. **Bandwidth Vercel**: видео не проксируется (iframe/HLS идут напрямую к источникам) — основной трафик это картинки, которые кэшируются.

## Backup (A8.4)
- `node scripts/backup-titles.mjs` → backups/ (git-ignored), далее `rclone copy backups/ remote:anistream-backups/`.
- GH Actions `backup-weekly.yml` коммитит снапшот titles.json в ветку `backups` (изолированно от main).
- Restore drill: `git checkout backups -- lib/data/titles.json && npm run build` — проверено.
