# Переезд AniNova на Netlify без простоя (план и чек-лист)

Цель: зеркало на Netlify проверяется → DNS переключается без даунтайма → Vercel
остаётся горячим резервом на 48 ч. Весь путь обратим на каждом шаге.

## Фаза 0. Подготовка (0 даунтайма, прод не трогаем)

1. В Netlify: Add new site → Import an existing project → GitHub → `anistream`.
   Production branch: **`netlify-mirror`** (не main!), чтобы не мешать проду Vercel.
2. В репо создаём ветку зеркала:
   ```bash
   git checkout -b netlify-mirror origin/main
   # кладём netlify.toml из этого кита в корень, docs/NETLIFY-MIGRATION.md в docs/
   git add netlify.toml docs/NETLIFY-MIGRATION.md
   git commit -m "chore(deploy): netlify mirror config"
   git push origin netlify-mirror
   ```
3. Env-переменные сайта (Site configuration → Environment variables) — переносим
   набор с Vercel, кроме домен-зависимых:
   - `NEXT_PUBLIC_SITE_URL` = `https://<site-slug>.netlify.app` (инлайнится в сборку!);
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET`: в консоли Cloudflare
     добавить hostname зеркала в сайт Turnstile (или временно не задавать переменные —
     код должен деградировать без капчи; проверить);
   - остальные 1:1: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
     `NEXT_PUBLIC_METRIKA_ID`, `VAPID_PRIVATE`, `VAPID_PUBLIC`, `PUSH_CONTACT`,
     `NEXT_PUBLIC_SITE_NAME`, `ADMIN_TOKEN`, `PROVIDER_TIMEOUT_MS`, `STATIC_TITLE_LIMIT`.
4. Ждём сборку. Контроль логов: секция адаптера OpenNext, затем маркеры:
   ```bash
   curl -i https://<site-slug>.netlify.app/api/metrics   # 403 JSON = edge-middleware жив
   curl -s https://<site-slug>.netlify.app/api/health     # 200 JSON
   curl -s https://<site-slug>.netlify.app/anime/one-piece          # 200 (ISR-онгоинг)
   curl -s https://<site-slug>.netlify.app/api/providers/hunter-hunter-2011/1  # 200 JSON
   ```
   Заголовки кэша: `netlify-cdn-cache`, `age` (вместо `x-vercel-cache`).
5. Прогнать `SMOKE_URL=https://<site-slug>.netlify.app npm run smoke` локально —
   скрипт проверяет только статусы, к хедерам не привязан.

## Фаза 1. Решение «зеркало или переезд»

- Зеркало/резерв: останавливаемся здесь. Vercel-воркеры (smoke/warm в GitHub
  Actions) продолжают бить в прод Vercel; при красном проде Vercel вручную/скриптом
   переключаем клиентов на netlify-URL (или сразу Фаза 2).
- Переезд: идём дальше.

## Фаза 2. DNS-переключение без простоя

1. За 24–48 ч ДО: снизить TTL записи домена (aninova-catalog или свой домен) до 300 с.
2. Netlify: Domain settings → Add custom domain → ввести домен → Netlify выдаст
   цели: для apex — `ALIAS/ANAME` (или A `75.2.60.5`), для www — CNAME `<site>.netlify.app`.
3. У текущего регистратора/DNS-провайдера поменять записи на цели Netlify.
   Старые записи Vercel (`cname.vercel-dns.com` / `76.76.21.x`) НЕ удаляем сразу —
   они станут автоматическим откатом: пока TTL живой, часть трафика ещё на Vercel,
   оба конца отвечают одинаково (данные общие: Supabase/Upstash).
4. Дождаться HTTPS: Netlify выпускает Let's Encrypt сам (статус в Domain settings).
5. После стабилизации (24–48 ч):
   - `NEXT_PUBLIC_SITE_URL` на Netlify-сайте = боевой домен → пересборка (каноникалы/OG);
   - Vercel: убрать production-домен из доменов проекта (чтобы не дурил каноникалами),
     но деплой не удалять — горячий резерв;
   - GitHub Actions: URL в smoke/warm-воркерах сменить на боевой домен (теперь он Netlify);
   - Google Search Console: добавить свойство нового домена + отправить sitemap;
     в GSC старого домена оставить историю; Metrika/аналитика: добавить зеркало сайта;
   - VAPID-push: push-подписки привязаны к origin старого домена — подписчики со
     старого домена получат пушы только пока он жив; новый домен собирает новые
     подписки. Мигрирует постепенно, принудительно не переносится (ограничение Web Push).
6. Откат: вернуть DNS-записи на Vercel (TTL 300 с → восстановление за минуты),
   на Vercel вернуть production-домен и `NEXT_PUBLIC_SITE_URL`, пересобрать.

## Фаза 3. Пост-проверка

- GSC: индексация нового домена пошла (Coverage), старые URL — 301/каноникалы.
- Наблюдение за CPU/трафиком Netlify (free: 100 ГБ CDN, 125k функций) — первые сутки.
- Uptime-монитор на /api/health обоих концов ещё 72 ч.

## Чего на Netlify НЕ делать

- Не включать `[[plugins]] @netlify/plugin-nextjs` (legacy-рантайм).
- Не убирать `included_files` из netlify.toml (ENOENT по titles.json).
- Не добавлять edge-runtime страницы (`export const runtime = 'edge'`): адаптер
  выполнит их в Node-функции региона (ограничение платформы) — у нас их и нет.
- Помнить про порядок: middleware выполняется ДО обработки headers/redirects
  (отличие от standalone Next) — наши заголовки CSP из next.config применяются
  платформой после middleware; на поведение сайта это не влияло и не влияет.
