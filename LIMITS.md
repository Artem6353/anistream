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
