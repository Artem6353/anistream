# AniStream 2.x — Полный аудит и план улучшений

Дата: 23.09.2026 · Объект: репозиторий `anistream` (Next.js 16 App Router, TypeScript strict)
Метод: статический аудит кода и данных, прогон build/typecheck/smoke (30 маршрутов), анализ runtime-метрик.

---

## 1. Паспорт проекта

| Параметр | Значение |
| --- | --- |
| Стек | Next.js 16.3.5 (App Router, RSC, ISR), React 19, TypeScript strict, CSS-дизайн-система (без UI-библиотек) |
| Зависимости runtime | `next`, `react`, `react-dom`, `hls.js` (лениво), `kodikwrapper` |
| Объём кода | ~10 200 строк (app 4 131, components 2 877, lib 2 054, scripts 612, bridges 508), 133 файла |
| Маршруты | 15 страниц + 5 API + 2 OG-генератора + sitemap/robots/manifest |
| Каталог | **5 002 тайтла**: finished 4 843, ongoing 42, upcoming 117; tv 3 097, movie 674, ova 528, ona 402, special 301; годы 1969–2027; 19 жанров |
| Наполненность | shikimori-обогащение 4 998; связи франшиз 5 000; персонажи 5 000; трейлеры 3 262; кадры 3 178; airing-слоты 4 269 |
| Источники видео | registry: manual → cache (3 419 легаси-записей + runtime) → live-bridge (Kodik/CVH/AniBoom) → synth → guess-пул → demo |
| Покрытие озвучками | 4 998/5 002 (99.9%), измерено warm |
| Социалка | отзывы с оценкой, комментарии с ответами/лайками (local / Supabase), списки статусов, история, закладки |
| Автоматизация | GH Actions: sync-catalog каждые 6 ч; ci на PR; enrich/hydrate/warm/curate скрипты |
| Безопасность | private-репо, секреты в env, ADMIN-гейт, React-экранирование, audit 0 vulns (next 16.3.5) |
| Тесты | unit (vitest) 16/16; E2E (Playwright) 5/5; smoke 30/30 HTTP-проверок; typecheck строгий |

## 2. Архитектура (факт)

```
Браузер: плеер v3 (бар серий + табы озвучек), профиль localStorage, PWA sw.js
   │  /api/providers|availability|search|titles|schedule
Next server (RSC/ISR): registry источников (manual→cache→live→synth→guess→demo),
   каталог из lib/data/titles.json (fs-чтение, без бандлинга 15 МБ), OG через next/og
   │  127.0.0.1:8765/8766 (опционально)
Python-bridge v2: KodikParser (авто-пул токенов) / AnimegoParser; кэш 6 ч, тихие обрывы
   │
AniList GraphQL · Shikimori REST · AnimeGo/AniBoom/Kodik (через bridge)
Автопополнение: GH Actions cron 6h → commit titles.json → автодеплой
```

Сильные стороны: единая точка входа плееров; многослойный фолбэк (сайт не падает без сети/bridge);
cache-first + self-growing; офлайн-каталог; честные статусы серий; админ-очередь модерации;
 reproducible-скрипты с resume; документарий (ANALYSIS 17 итераций, DEPLOY, CONTRIBUTING).

## 3. Дефициты и риски (по приоритету)

| # | Проблема | Severity | Комментарий |
| --- | --- | --- | --- |
| W1 | Нет unit/E2E-тестов | High | только smoke-HTTP; парсеры/registry без unit-покрытия (ТЗ просило Jest/Pytest) |
| W2 | Названия серий только у онгоингов; у завершённых — 12 airing-слотов | Medium | AniList отдаёт airingSchedule и для finished — можно дозаполнить даты всех серий |
| W3 | Отзывы: open-insert RLS в Supabase, без rate-limit/капчи | High | спам-риск при включённом общем режиме (ТЗ просило капчу) |
| W4 | ADMIN-токен через query-параметр | Medium | утекает в логи/историю; нужен cookie/header-гейт |
| W5 | manual-sources правится файлом, нет UI | Medium | модерация медленнее, чем могла бы |
| W6 | Нет observability | Medium | только provider-errors.jsonl; нет метрик/алертов/лог-агрегатора |
| W7 | Постеры/кадры с внешних CDN без самохоста/AVIF | Medium | зависимость от s4.anilist.co/shikimori.io; нет image-proxy с кэшем |
| W8 | Нет Docker/compose для VPS-пути | Low | Oracle/домашний деплой ставится вручную |
| W9 | i18n: только RU | Low | рост аудитории ограничен |
| W10 | Длинные списки серий (1000+) без виртуализации | Low | One Piece 148 ок, но DOM тяжелеет на гигантах |
| W11 | Нет structured data (JSON-LD TVSeries) | Low | SEO-потенциал не выбран |
| W12 | Легаси-кэш живёт в файле репозитория | Low | при 100k записей нужен KV/БД |

## 4. План улучшений

### Фаза 0 — предрелизная подготовка (P0, ~1–2 дня)
| № | Задача | Приёмка | Оценка |
| --- | --- | --- | --- |
| 0.1 | Rate-limit + капча отзывов: turnstile (Cloudflare free) на фронте + проверка в API-прокладке Supabase (edge function) | 10 постов/мин с IP блокируются, капча проходится | 4 ч |
| 0.2 | ADMIN-гейт через cookie: `/admin/login` ставит httpOnly-cookie (HMAC от ADMIN_TOKEN), query-токен убирается | токен не светится в URL/логах | 2 ч |
| 0.3 | Unit-тесты критичных модулей (registry-порядок, synthesize-rewrite, cleanText, franchise-BFS) на node:test без доп. зависимостей | coverage ядра ≥70%, ci запускает | 6 ч |
| 0.4 | Dockerfile + compose (web + 2 bridge) для Oracle/VPS | `docker compose up` поднимает весь стек | 3 ч |

### Фаза 1 — первые 2 недели после релиза (P1)
| № | Задача | Приёмка | Оценка |
| --- | --- | --- | --- |
| 1.1 | Дозаполнить даты/названия серий завершённых тайтлов: расширить airingSchedule perPage до episodes (пакетно, кэш в titles.json) | у 80% finished-тайтлов таблица с точными датами | 6 ч |
| 1.2 | Image-proxy `/img?url=` с кэшем (Upstash Blob/Cloudflare KV + AVIF-конверт), постеры и кадры через него | внешние CDN не видны клиенту, LCP < 2 c | 8 ч |
| 1.3 | UI-редактор manual-sources в админке (форма: slug, серия, label, embedUrl; запись в JSON через API-роут с admin-cookie) | модератор чинит тайтл без правки файла | 4 ч |
| 1.4 | Observability: structured-логи (pino), метрики registry (hit/miss/latency) в `/api/metrics` (admin), алерт в TG при >N ошибок парсеров/час | дашборд видим, алерт приходит | 6 ч |
| 1.5 | JSON-LD TVSeries/Movie + breadcrumb на страницах тайтлов и каталога | валидатор GoogleRichResults зелёный | 3 ч |
| 1.6 | Виртуализация списков серий >200 (windowing без библиотек) | DOM < 100 узлов на One Piece | 4 ч |

### Фаза 2 — 1–2 месяца (P2)
| № | Задача | Приёмка | Оценка |
| --- | --- | --- | --- |
| 2.1 | Перенос кэша источников и профилей в Supabase/KV (миграция файла, dual-read) | сайт stateless, деплой на any-serverless | 12 ч |
| 2.2 | Аккаунты: Supabase Auth (magic link), синхронизация списков/истории между устройствами | вход с телефона продолжает прогресс ПК | 16 ч |
| 2.3 | i18n RU/EN (next-intl free), EN-описания из AniList как fallback | переключатель в шапке, SEO-hreflang | 12 ч |
| 2.4 | PWA-улучшения: офлайн-страница избранного, push-уведомления о новых сериях (web-push, Vercel cron) | подписчик получает пуш в день выхода серии | 10 ч |
| 2.5 | E2E Playwright: сценарии «каталог→плеер→прогресс→отзыв» в ci | 5 сценариев зелёные | 8 ч |
| 2.6 | Рекомендации: персональная лента по спискам/жанрам (edge-функция, без ML-инфраструктуры) | блок «Для вас» на главной у залогиненных | 8 ч |

### Анти-риски (постоянно)
- Юридический: дисклеймер + DMCA-флоу (кнопка в футере → тикет в админку → скрытие тайтла) — реализовать в Фазе 1.
- Провайдерный: абстракция registry уже позволяет менять библиотеки парсеров точечно; держать fixture-тесты на контракт bridge.
- Данные: sync-catalog идемпотентен + curate для ручных чисток; бэкап titles.json в GH-истории уже есть.

## 5. KPI

### 5.1 KPI — цель (проверяются после публикации, механизмы заложены)
- Доступность источников ≥ 99% тайтлов (warm еженедельно в ci).
- LCP ≤ 2.0 c (mobile, cache), CLS ≤ 0.1.
- Ошибки парсеров ≤ 2% резолвов (алерт при превышении — включится после подключения TG/Sentry).
- Uptime 99.5% (внешний монитор на /api/health — после регистрации UptimeRobot).
- Cold resolve p95 < 6 с (health-gate 1.5 с + фолбэк в кэш; замер — после деплоя bridge).

### 5.2 KPI — измерено в песочнице (итерация 3.2, prod-сборка)
| Метрика | Значение | Чем измерено |
|---|---|---|
| Покрытие источников (warm) | **4998/5002 = 99.9%** | `scripts/warm-providers.mjs` |
| Точные даты серий у finished | **4829/4843 = 99.7%** | `fetch-episode-dates.mjs --report` |
| Живые постеры | **5002/5002 = 100%** | `check-posters.mjs` (~18 с) |
| Unit-тесты | **16/16** | `npx vitest run` |
| Smoke HTTP | **30/30** | `SMOKE_URL=… npm run smoke` |
| E2E Playwright | **5/5** | chromium headless на prod-сборке (§7, итог 3.2) |
| Rate-limit | 429 на 30-м запросе `/api/search` | живая проверка middleware |
| Резолв под нагрузкой 100 параллельных | p50/p95 — таблица в §7 (итог 3.2), 0 ошибок | `scripts/loadtest.mjs` |
| LCP/CLS локально (Chromium) | LCP 0.4–1.1 с, CLS ≤0.095 — таблица в §7 (итог 3.2) | CDP PerformanceObserver (Lighthouse CLI в песочнице не запустился — см. §8) |

Uptime, CrUX-LCP мобильных пользователей и процент ошибок парсеров — прод-метрики:
до публикации измерить нельзя (см. «Ограничения верификации», §8).

## 5.5. Итоговое состояние после итерации 3.0 (реализовано сверх первоначального плана §4)

Фаза 0: капча+rate-limit отзывов (/api/social/captcha|reviews, stateless-HMAC, 10 постов/мин/IP);
admin-cookie вместо query-токена (/admin/login, httpOnly HMAC 7 дней); unit-тесты vitest 11/11
(synthesize/format/franchise/catalog/captcha) в ci; Dockerfile + Dockerfile.bridge + docker-compose
(web + kodik-bridge + multi-bridge).

Фаза 1: точные даты серий завершённых тайтлов (scripts/fetch-episode-dates.mjs, 1 647 тайтлов с
epdates, таблица графика с датой и временем МСК); image-proxy /img?url= с FS-кэшем и годовым
Cache-Control (постеры/кадры/персонажи через прокси); UI-редактор ручных источников в админке
(/api/admin/manual + ManualEditor); observability (lib/metrics: hit/miss/latency p50/p95, /api/metrics
под admin-cookie, TG-алерт при 20+ ошибках парсеров/час); JSON-LD TVSeries/Movie + BreadcrumbList;
чанки списков серий 60/экран для тайтлов 120+.

Фаза 2: KV-адаптер кэша (Upstash Redis REST, TTL 7 дн, фолбэк файл); аккаунты Supabase Auth REST
(signup/signin, push/pull списков и истории, RLS-политики profile_lists/profile_history в schema.sql);
i18n-lite RU/EN (словари chrome, переключатель в шапке, cookie lang, hreflang в metadata);
web-push уведомления (VAPID, /api/push/vapid|subscribe, кнопка в настройках, scripts/send-push.mjs +
GH cron 18:00 MSK); E2E Playwright (3 сценария: главная/каталог-фильтр/плеер); рекомендации
«Для вас» (/api/reco по жанровой аффинности списков и истории, рельс на главной).

Итоговое состояние после итерации 3.0 (проверяемые числа): unit 11/11 + smoke 30/30;
build 30 страниц; каталог 5 002 тайтла; точные даты серий у 1 647 finished (в итерации 3.2
догнано до 4 829 = 99.7% — B6); E2E 3 сценария в ci (в 3.2 — 5 сценариев, прогнаны).

Добавленные зависимости: runtime — `web-push`, `@sentry/browser`; dev — `vitest`,
`@playwright/test`, `@types/web-push`.

## 6. Вердикт (обновлён в итерации 3.2 — синхронно с §5.5)

Фазы 0–2 из плана §4 **реализованы** (итерация 3.0, состав — §5.5), handoff-ТЗ Части A–E
закрыты итерациями 3.1–3.2 (матрица — §7): каталог 5002, плеер с озвучками и графиком серий
(даты — 99.7% finished), социалка, админка модерации, юридические страницы, SEO, тесты
(unit 16/16, smoke 30/30, E2E 5/5), автоматизация (CI, sync, backup), observability-код.

**Реальная дистанция до «полностью готово» — не код, а действия пользователя**, которые
невозможны из песочницы (подробно — «Ограничения верификации» §8 и чек-лист §9):

1. **A0.1 live-слой** — Kodik отдаёт 401 с датацентр-IP (подтверждено `check:kodik` 23.09.2026).
   Прод-схема (VPS/дом + systemd + Caddy + `BRIDGE_TOKEN`) подготовлена в `deploy/` и DEPLOY.md;
   окончательный вердикт — после `npm run check:kodik` с домашнего/VPS-IP. Если и там 401 —
   переход на вариант (c): кэш-прогрев топ-1000 (`npm run warm`+`hydrate`) и дисклеймер в плеере
   (план зафиксирован в DEPLOY.md §A0.1, сайт полностью работоспособен без live-слоя).
2. **Ключи и аккаунты** — свой ADMIN_TOKEN, домен (заменяет example.com-плейсхолдеры), Supabase
   (RLS+Turnstile включатся только после деплоя схемы и edge-функции), Sentry/TG/аналитика,
   VAPID, Upstash. Статусы таких пунктов в §7 — 🧩 («код готов, мониторинг/защита до
   подключения не работают»).
3. **Финальные проверки** — реальные iPhone/Android, GSC, UptimeRobot, прогон CI в вашем репозитории.

Разработка до публикации больше не требуется: всё, что можно сделать и проверить без внешних
сервисов и устройств, сделано и проверено (итоги итерации 3.2 — в конце §7).

## 7. Матрица покрытия handoff-ТЗ (Части A–E, итерации 3.1–3.2)

Легенда: ✅ — реализовано и проверено в песочнице (prod-сборка, :3100); 🧩 — код готов, для включения
нужны ключи/окружение пользователя; 👤 — требуется действие пользователя (решение, регистрация,
реальное устройство); ⚠️ — закрыто частично, остаток описан честно.

### Часть A — до публикации

| ID | Статус | Где реализовано | Результат приёмки |
|----|--------|-----------------|-------------------|
| A0.1 | ✅👤 | решение (a) VPS: `deploy/*.service`, `deploy/Caddyfile` (bearer-токен; клиент Next шлёт `BRIDGE_TOKEN` — добавлено в 3.2), DEPLOY.md §A0.1 | **live-слой проверен фактически (23.09.2026, датацентр-IP песочницы)**: kodik_bridge → живые episode-specific embed-ы («КОМНАТА ДИДИ», «OnWave», 0.6–0.8 с), multi-bridge (CVH) → «Dream Cast»/«AniLibria» (~3.3 с). Статический `KODIK_TOKEN` — 401 (ротация), авто-пул AnimeParsers — работает. 👤 подтвердить `check:kodik` со своего IP при деплое |
| A0.2 | ✅ | `docs/DEPLOY.md` — два пошаговых маршрута: Vercel и VPS (с нуля до прода) | инструкция полная, решения зафиксированы |
| A0.3 | 🧩👤 | `metadataBase`/canonical из `NEXT_PUBLIC_SITE_URL`; шаблон 301 в `deploy/Caddyfile` | после покупки домена: вписать URL, редирект www настроен в Caddyfile |
| A1.1 | ✅ | `app/dmca/page.tsx`, `app/api/dmca/route.ts`, Supabase `dmca_requests`, админка TicketsPanel + кнопка «скрыть» | проверено: тикет → hide `futabu` → страница 404 → unhide → 200 (1 клик, без деплоя) |
| A1.2 | ✅ | `app/privacy`, `app/terms`, `app/disclaimer` — реальные тексты, ссылки в футере | все страницы 200, дисклеймер «не храним видео, только embed» |
| A1.3 | ✅ | `components/system/CookieConsent.tsx` | баннер один раз, «Принять» — навсегда (localStorage) |
| A1.4 | ✅ | `components/system/AgeGate.tsx` + флаг `isAdult` в данных | 18+ тайтлы — только после подтверждения |
| A1.5 | ✅👤 | `public/.well-known/security.txt` — плейсхолдер `example.com` + TODO-комментарий (в 3.2 убран `anistream.local`); `app/privacy` берёт email из `NEXT_PUBLIC_SITE_URL` | отдаётся 200; 👤 заменить example.com на реальный домен при деплое |
| A2.1 | ✅👤 | `app/sitemap.ts` — все 5002 тайтла + статика | 👤 отправить в GSC после деплоя |
| A2.2 | ✅ | `generateMetadata` в `app/anime/[slug]`, `app/catalog`, `app/genre/[slug]` | уникальные title/description на страницу тайтла |
| A2.3 | ✅ | `app/opengraph-image.tsx` (корень) + `app/anime/[slug]/opengraph-image.tsx`, `app/icon.svg`, `app/manifest.ts` | OG-картинки на всех маршрутах через metadata |
| A2.4 | ✅ | `metadataBase` + `alternates.canonical` в `app/layout.tsx` | canonical на каждой странице, без дублей |
| A2.5 | ✅ | `app/not-found.tsx` (поиск + каталог), `app/error.tsx` | несуществующий slug → 404 с рабочим поиском |
| A2.6 | ✅ | `app/robots.ts` | `/api/`, `/admin/` закрыты, sitemap указан |
| A2.7 | ✅ | JSON-LD `TVSeries`/`Movie` + `BreadcrumbList` в `app/anime/[slug]/page.tsx` | валидная разметка (проверка Rich Results — после деплоя) |
| A2.8 | ✅ | `alternates.languages: { ru, en }` в layout + i18n-lite | hreflang присутствует, структура готова к EN |
| A3.1 | 🧩👤 | `supabase/schema.sql` (RLS: insert отзывов только service_role) + `supabase/functions/submit-review/index.ts` + Turnstile-виджет в форме (добавлен в 3.2; задавать `TURNSTILE_SECRET` **парой** с site key) | **честно: защита включается только после деплоя в Supabase-проект пользователя** — до этого общие отзывы физически выключены (POST → 409 «общий режим выключен»), работают локальные (localStorage, видны только автору). Проверка 403/201 требует реального проекта (👤) |
| A3.2 | ✅ | `lib/rateLimit.ts` + `middleware.ts` (search 30/мин, providers 60/мин, reviews 10/мин) | проверено: 429 на 30-м запросе `/api/search` |
| A3.3 | ✅ | `lib/admin-auth.ts` — HMAC от ADMIN_TOKEN, httpOnly cookie 24 ч; токена нет в URL | проверено: `/admin` без cookie → 307 `/admin/login`; неверный токен → 403; верный → 200 + cookie |
| A3.4 | ✅ | `scripts/check-env.mjs` (`npm run check:env`) | падает с понятным списком отсутствующих переменных |
| A4.1 | ✅ | warm-покрытие **4998/5002**; `scripts/curate-titles.mjs missing/remove`; `lib/data/manual-sources.json` | 4 проблемных тайтла известны и помечены (curate missing) |
| A4.2 | ✅ | **новый** `scripts/check-posters.mjs` (HEAD + GET-фолбэк, concurrency, `.cache/broken-posters.json`) | **прогон 5002/5002: битых 0** (~18 с) |
| A4.3 | ✅ | **новый** `scripts/clean-titles.mjs report/fix` (теги, entity, двойные пробелы, мойибаке; легитимные `XY&Z`, `<DOGEZA>` не трогает) | fix: 18 полей; повторный скан 5002: **0 артефактов** |
| A4.4 | ✅ | `aspect-ratio: 2/3` + object-fit cover (`app/globals.css`) | сетка каталога не рвётся (смоук на мобильных вьюпортах) |
| A5.1 | ✅ | `components/player/PlayerShell.tsx`: hls.js fatal / import-fail → прямой `video.src` | плеер играет без hls.js |
| A5.2 | ✅👤 | `playsInline` + `webkitEnterFullscreen` | 👤 финальная проверка на реальном iPhone |
| A5.3 | ✅ | навигация «← Серия N / К описанию / Серия N+1 →» + автопереход с отсчётом | переход без перезагрузки (router.push) |
| A5.4 | ✅ | `library.saveProgress` → localStorage (универсальный API) | позиция восстанавливается во всех браузерах |
| A5.5 | ✅ | `keepTime` ref → восстановление `currentTime` на `loadedmetadata` | смена озвучки сохраняет timestamp |
| A5.6 | ✅ | `<track kind="subtitles">` + группа «Субтитры» в панели источников | переключение дорожек работает |
| A5.7 | ✅👤 | автоплей без звука не форсируется; mute-кнопка; `playsInline` | 👤 проверка консоли на iOS |
| A5.8 | ✅ | модалка «Пожаловаться» → `/api/report` → Supabase `source_reports` | проверено: жалоба видна в TicketsPanel (reports: 1) |
| A6.1 | ✅ | «Ничего не нашлось» (каталог, CommandPalette), пустые отзывы/озвучки | осмысленный текст + действие |
| A6.2 | ✅ | skeleton-карточки, `app/catalog/loading.tsx` | нет прыжков контента |
| A6.3 | ✅ | `components/system/ErrorBoundary.tsx` + `app/error.tsx` | ошибка компонента не роняет страницу |
| A6.4 | 👤 | вёрстка адаптивная (смоук 30/30) | 👤 прогнать 10 страниц на реальных Android/iOS |
| A6.5 | ✅ | кнопки серий/описания под плеером; браузерный «назад» сохраняет скролл каталога | возврат в каталог в той же позиции |
| A7.1 | 🧩👤 | `lib/monitor.ts` — клиентский Sentry через `NEXT_PUBLIC_SENTRY_DSN` (динамический импорт, без сборки плагинов) | 🧩 **до подключения Sentry сбора ошибок нет**; 👤 создать проект, вписать DSN |
| A7.2 | ✅👤 | `/api/health` (200 проверен) | 👤 зарегистрировать UptimeRobot/BetterStack на `/api/health`, 5 мин |
| A7.3 | 🧩 | TG-алерты в `lib/metrics.ts` (`TG_BOT_TOKEN`, `TG_CHAT_ID`; порог 20+ ошибок парсеров/час) | 🧩 **до подключения токенов алертов нет** (счётчик ошибок копится в `/api/metrics`, но никто не уведомляется) |
| A7.4 | 🧩👤 | `injectAnalyticsScript()` — Plausible/Umami через `NEXT_PUBLIC_ANALYTICS_SRC` | 🧩 **до подключения аналитики нет**; 👤 self-host или cloud + вписать URL |
| A8.1 | ✅ | `scripts/loadtest.mjs` (режимы: Next API и bridge напрямую) | **прогнан в песочнице (3.2)**: bridge warm 100× — p95 192 мс; cold-бурст 100× (single-flight) — p95 1.2 с (Kodik) / 4.7 с (CVH, латентность animego); Next live 55× — p95 3.8 с; 0 ошибок. Оптимизации по итогам: single-flight + backlog 128 + лимит хендлеров в bridge, in-flight dedupe в `/api/providers`. Числа — §7, итог 3.2 |
| A8.2 | ✅ | `LIMITS.md` — лимиты Vercel/Supabase с числами и порогами | документ актуален |
| A8.3 | ✅ | ISR `revalidate=3600` + `revalidatePath` на admin-действиях | краулинг 5000 страниц — статика без шквала регенераций |
| A8.4 | ✅👤 | `scripts/backup-titles.mjs` + `.github/workflows/backup-weekly.yml`; restore-инструкция в DEPLOY.md | 👤 вписать R2/S3-ключи для внешнего хранилища |
| A9.1 | ✅ | см. A3.3 — проверено на prod-сборке | 10/10 сценариев админ-флоу зелёные |
| A9.2 | ✅ | TicketsPanel: отзывы + DMCA + жалобы в одной очереди | проверено: `/api/admin/tickets` → dmca:1, reports:1 |
| A9.3 | ✅ | флаг `hidden` + кнопка в админке + `revalidatePath` | скрытие/возврат за 1 клик (кешируемую 404 чинит ревалидация) |
| A9.4 | ✅ | ManualEditor + `/api/admin/manual` (slug, серия, label, embedUrl → JSON) | модерация без правки файлов и деплоя |

### Часть B — первые 2 недели (P1)

| ID | Статус | Где / результат |
|----|--------|-----------------|
| B1 | ✅ | health-gate 1.5 с в `lib/providers/bridge.ts` — мёртвый bridge → мгновенный fallback |
| B2 | ✅ | `lib/providers/circuitBreaker.ts` + `.cache/circuit.json`: 5 ошибок → исключить на 5 мин → half-open |
| B3 | ✅ | `bridges/kodik_bridge.py`: прогрев пула `kodik()` в `__main__` до начала приёма запросов |
| B4 | ✅ | `tests/fixtures.test.ts` — контракт URL (rewriteCvh/rewriteAniboom, форма legacy-кэша), 5 тестов в CI |
| B5 | ✅ | `tests/core.test.ts` — registry-порядок, synthesize-rewrite, cleanText, franchise-BFS (11 тестов). Отклонение: vitest вместо node:test (тот же приёмочный критерий — `npm test` в CI, 16/16 зелёные) |
| B6 | ✅ | `scripts/fetch-episode-dates.mjs` (переписан в 3.2: исправлен баг пагинации, батчи 50 id, постраничный добор гигантов, startDate для фильмов, resume+отчёт) | **4829/4843 finished = 99.7%** с непустыми `epdates` (цель ≥80%): 2071 полное расписание, 556 одиночные записи расписания, 2202 премьера (фильмы/OVA/старые тайтлы без ТВ-слотов, помечены `epdatesSource:'startDate'`). Без дат 14 (7 гигантов типа Doraemon — у AniList нет расписания). Отчёт: `.cache/episode-dates-report.json`. Прим.: `enrich` даты не трогает (он про RU-метаданные Shikimori) |
| B7 | ✅ | `app/img/route.ts` — image-proxy с кэшем; KV-слой — `lib/providers/cache-kv.ts` (Upstash REST, TTL 7 дн, фолбэк файл) |
| B8 | ✅ | = A9.4: ManualEditor + `/api/admin/manual` под admin-cookie |
| B9 | ✅ | `lib/metrics.ts` (hit/miss/latency/ошибки парсеров) + `/api/metrics` под admin-cookie + MetricsPanel в админке |
| B10 | ✅ | чанки серий 60/экран (`components/anime/EpisodeBar`) — One Piece 1000+ серий: DOM остаётся <100 узлов, без библиотек |
| B11 | ✅ | KV-адаптер (Upstash) + `.github/workflows/push-daily.yml`; без ключей — файловый фолбэк, репо не пухнет |
| B12 | ✅ | футер: DMCA, Privacy, Terms, Disclaimer (см. A1) |

### Часть C — 1–2 месяца (P2)

| ID | Статус | Где / результат |
|----|--------|-----------------|
| C1 | ✅ | dual-read кэш: `cache-kv.ts` (KV → файловый фолбэк) |
| C2 | 🧩 | Supabase Auth REST + синхронизация списков/истории: `lib/sync.ts`, RLS `profile_lists`/`profile_history` в `schema.sql` | 🧩 **без Supabase-проекта и ключей не работает** — профиль остаётся локальным (localStorage); код входа/синхронизации готов и включается ключами |
| C3 | ✅ | i18n-lite RU/EN: `lib/i18n.tsx` (словари chrome, cookie lang, переключатель, hreflang). Отклонение: собственный лёгкий слой вместо next-intl |
| C4 | ⚠️🧩 | PWA: `app/manifest.ts` + `SwRegister` (✅ работают без ключей) + web-push (VAPID, `/api/push/vapid|subscribe`, `scripts/send-push.mjs`, cron 18:00 MSK) | 🧩 **пуш-часть без VAPID-ключей выключена** (кнопка подписки скрыта, cron холостой) — нужны `npx web-push generate-vapid-keys` + env |
| C5 | ✅👤 | `e2e/smoke.spec.ts` — **5 сценариев** (главная/фильтр каталога/плеер/каталог→тайтл→отзыв/профиль→список→сохранение) + `.github/workflows/e2e.yml` (push/PR/dispatch, артефакт трейсов) | **прогнаны в песочнице (3.2): 5/5 зелёные** (chromium headless, prod-сборка :3100, 22 с); сверх того smoke 30/30. 👤 зелёный CI-ран — после пуша в свой GitHub-репозиторий (в песочнице репозитория нет; workflow проверен локальным эквивалентом build→playwright test) |
| C6 | ✅ | `/api/reco` — жанровая аффинность списков/истории, рельс «Для вас» на главной |

### Часть D — постоянно

| ID | Статус | Обеспечение |
|----|--------|-------------|
| D1 | ✅ | DMCA-флоу (A1.1) + очередь тикетов в админке (A9.2); регламент <24 ч — операционный |
| D2 | ✅ | fixture-тесты в CI (`ci.yml`: typecheck → test → build → smoke) + TG-алерт при ошибках парсеров |
| D3 | ✅ | `.github/workflows/sync-catalog.yml` (идемпотентный) + `curate-titles.mjs` + `backup-weekly.yml` |
| D4 | ✅ | `LIMITS.md` + `/api/metrics` (пороги и текущие значения) |

### Часть E — KPI: чем обеспечены

| KPI | Механизм | Текущее значение | Обеспечен? |
|-----|----------|------------------|------------|
| Доступность источников ≥99% | warm + circuit breaker + кэш 3420 + manual-sources | **4998/5002 = 99.9%** warm | ✅ измерено |
| Доля тайтлов с ≥1 озвучкой ≥95% | то же | 99.9% | ✅ измерено |
| LCP ≤2.0 с / CLS ≤0.1 | image-proxy, priority-постеры, skeleton-состояния | локально (desktop, LAN): LCP 0.4–1.1 с, CLS ≤0.095 (§7, итог 3.2); 🧩 полевые CrUX — после публикации | ⚠️ цель не превышена локально; прод-замер 👤 |
| Cold resolve p95 <6 с | health-gate 1.5 с + фолбэк в кэш + in-flight dedupe (3.2) | **3.8 с** при 55 одновременных live-резолвах (§7, итог 3.2) | ✅ измерено в песочнице |
| Ошибки парсеров ≤2% | `/api/metrics` + TG-алерт (порог 20/час) | счётчик работает; 🧩 **алертов нет до подключения TG-токенов** | ⚠️ частично |
| Uptime 99.5% | `/api/health` (отвечает 200) | 🧩 внешнего монитора нет до регистрации UptimeRobot (👤) | ⚠️ код готов |

### Итог верификации итерации 3.1 (prod-сборка, порт 3100)

- Админ-флоу **10/10**: login (неверный → 403, верный → 200 + httpOnly cookie), hide → страница 404,
  hide без cookie → 403, tickets → 200 (dmca:1, reports:1), unhide → 200, `/admin` → 307/200.
- Исправлен баг кэширования: `lib/catalog.ts mtimeNow()` возвращал устаревший mtime → slug-карта не
  инвалидировалась после записи `titles.json`; в `hide/route.ts` добавлены `revalidatePath`
  (страница с `revalidate=3600` кэшировала 404). Подтверждено живьём: после `clean-titles fix`
  API отдал очищенное название **без рестарта сервера**.
- Создан `.env.example` — полная схема всех переменных (admin, Kodik, bridge, Supabase, Turnstile,
  Sentry, TG, VAPID, Upstash, Shikimori).
- Новые скрипты A4: `check-posters.mjs` (5002/5002 OK) и `clean-titles.mjs` (18 полей исправлено, 0 артефактов).
- Тесты: vitest **16/16**, `npm run typecheck` чисто, smoke **30/30**, rate-limit 429 на 30-м запросе.

### Итог верификации итерации 3.2 (добивание, 23.09.2026, prod-сборка :3100)

- **B6**: даты серий догнаны до **4829/4843 finished = 99.7%** (цель 80%) — см. строку B6.
- **A0.1**: live-слой **фактически работает** — оба bridge подняты в песочнице и отдали живые
  источники (Kodik: episode-specific embed-ы нескольких озвучек; CVH: animego cdn-iframe).
  Статический `KODIK_TOKEN` отклоняется (401) даже с публичным токеном — живой путь только
  через авто-пул AnimeParsers в bridge. Детали и таблица проверок — `docs/DEPLOY.md` §A0.1.
- **A8.1 load-test** (100 одновременных, `scripts/loadtest.mjs`):

  | Цель | Режим | p50 | p95 | Ошибки |
  |---|---|---|---|---|
  | kodik bridge `/resolve` | тёплый ключ ×100 | 117 мс | 192 мс | 0 |
  | kodik bridge `/resolve` | cold-бурст ×100 (один ключ) | 1181 мс | 1204 мс | 0 (1 поход в апстрим — single-flight) |
  | multi bridge (CVH) `/resolve` | cold-бурст ×100 | 4698 мс | 4717 мс | 0 (латентность animego ~4.7 с — апстрим, не bridge) |
  | multi bridge (CVH) `/resolve` | тёплый ключ ×100 | 164 мс | 233 мс | 0 |
  | Next `/api/providers` | кэш-hit ×55 | 595 мс | 651 мс | 0 |
  | Next `/api/providers` | live cold ×55 | 3806 мс | 3813 мс | 0 (dedupe: 55 клиентов = 1 резолв) |

  До оптимизаций те же прогоны давали p50 19 с / p95 60 с (bridge) и OOM-kill Next-сервера
  на 1 ГБ при 60+ одновременных. Исправлено: в bridge — single-flight на ключ, listen-backlog
  5→128, лимит активных хендлеров 16, негативный кэш ошибок 30 с; в Next — in-flight dedupe
  в `/api/providers/[slug]/[episode]`. Rate-limit middleware отдельно подтверждён под нагрузкой
  (100 одновременных с одного IP → 40×429, как задумано).
- **Web-метрики (4.3)** — Lighthouse CLI в песочнице не запускается (1 CPU/1 ГБ: tab crash/hang),
  замер сделан через Chromium CDP `PerformanceObserver` (`scripts/measure-web-vitals.mjs`,
  тот же API, из которого CrUX считает полевые LCP/CLS), desktop 1280×800, локальная сеть:

  | Страница | LCP cold | LCP warm | CLS | FCP |
  |---|---|---|---|---|
  | Главная `/` | 596 мс | 596 мс | 0 | 492 мс |
  | Каталог `/catalog` | 1064 мс | 560 мс | 0.095 / 0 | 292 мс |
  | Тайтл `/anime/sousou-no-frieren` | 812 мс | 532 мс | 0.0013 | 524 мс |
  | Плеер `/anime/sousou-no-frieren/1` | 404 мс | 624 мс | 0.0567 | 316 мс |

  Цель LCP ≤2.0 с / CLS ≤0.1 не превышена ни на одной странице (CLS каталога 0.095 cold —
  на границе: skeleton→карточки; на warm-загрузке 0). Реальные мобильные числа — CrUX после публикации.
- **C5 E2E**: **5/5 сценариев зелёные** (`npx playwright test`, chromium headless, prod-сборка),
  фикс навигации: `waitUntil:'domcontentloaded'` (сторонний YouTube-трейлер вешал `load`).
- **Исправления кода (не документации)**: bearer-заголовок `BRIDGE_TOKEN` в `lib/providers/bridge.ts`
  (без него прод-схема «bridge за Caddy» не работала бы); Turnstile-виджет в форме отзывов
  (без него `TURNSTILE_SECRET` ломал все POST); баг клиента loadtest (парс 20 МБ titles.json
  на каждый из 100 запросов искажал замер); плейсхолдеры `anistream.local` → `example.com`+TODO;
  `check-env.mjs` читает `.env.local` и печатает 6 групп с подсказками; LIMITS.md/README/ANALYSIS
  синхронизированы с фактом.
- Регресс-контроль: typecheck чисто, vitest **16/16**, smoke **30/30**.

## 8. Ограничения верификации (что НЕ проверено и почему)

Отдельно от «не сделано»: следующие пункты проверить в песочнице физически невозможно — они
помечены 👤/🧩 в матрице и вынесены в чек-лист (§9). Здесь — честный перечень границ проверки.

| Что не проверено | Почему | Чем закрыто частично |
|---|---|---|
| Плеер на реальном iPhone (fullscreen, `webkitEnterFullscreen`, автоплей) и Android (A5.2/A5.7/A6.4) | в песочнице нет устройств; эмуляция не заменяет Safari iOS | код по гайдлайнам Apple (playsInline, mute-first), smoke на мобильных вьюпортах; 👤 чек-лист ниже |
| Supabase RLS: прямой POST anon → 403, через edge-функцию → 201 (A3.1) | нужен реальный Supabase-проект (регистрация, ключи) | схема/функция/виджет готовы; без проекта общие отзывы выключены (409) — «открытого insert» в проде нет |
| Sentry/TG-алерты/аналитика вживую (A7.1/A7.3/A7.4) | нет ключей/токенов пользователя | код активируется env-переменными; `check:env` подсказывает состав групп |
| web-push доставка (C4) | VAPID-ключи генерируются на стороне владельца домена | кнопка подписки скрыта до ключей; скрипт+cron готовы |
| `check:kodik` с домашнего (residential) IP | песочница — датацентр-IP | факт: статический токен 401 и здесь; bridge-автопул работает даже отсюда; 👤 финальное подтверждение |
| Зелёный CI-ран GitHub Actions | нет подключённого GitHub-репозитория | workflow-файлы валидны; локально выполнен эквивалент (build → playwright test 5/5) |
| Полевые LCP/CLS (CrUX), uptime 99.5%, ошибки парсеров ≤2% | это прод-метрики живой аудитории | локальные LCP/CLS замерены CDP (§7, итог 3.2); `/api/health`+`/api/metrics` готовы к подключению мониторов |
| Lighthouse-отчёт как таковой | LH CLI падает/зависает при 1 CPU и 1 ГБ RAM | метрики сняты тем же движком Chromium через PerformanceObserver (метод указан в отчёте) |

## 9. 👤 Действия пользователя перед публикацией (чек-лист, обновлён после 3.2)

1. **ADMIN_TOKEN** — сгенерировать свой (`openssl rand -hex 24`); песочничный скомпрометирован.
2. **Домен** — вписать `NEXT_PUBLIC_SITE_URL` (canonical/OG/sitemap; email в privacy подхватится
   автоматически) и заменить `example.com` в `public/.well-known/security.txt` (3 места, TODO-метки).
3. **Live-слой (A0.1)** — задеплоить bridge на VPS/домашнюю машину (`deploy/*.service` +
   `deploy/Caddyfile`, `BRIDGE_TOKEN` в env сайта); после деплоя прогнать `npm run check:kodik`
   и `BRIDGE_URL=… npm run loadtest` со своего IP. Если авто-пул токенов с вашего IP тоже
   получит 401 — переходить на вариант (c) (DEPLOY.md §A0.1): сайт полностью работает на кэше.
4. **Supabase (A3.1/C2)** — создать проект, применить `supabase/schema.sql`, задеплоить
   `supabase/functions/submit-review`, вписать URL/anon/service-ключи; проверить: прямой POST
   anon → 403, через форму → 201. Turnstile: задавать `TURNSTILE_SECRET` только парой с
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
5. **Мониторинг (A7)** — Sentry DSN, TG бот-токен/чат, `NEXT_PUBLIC_ANALYTICS_SRC`; UptimeRobot
   на `/api/health` (5 мин); GSC — отправить `/sitemap.xml`.
6. **Пуш (C4, опц.)** — `npx web-push generate-vapid-keys` → `VAPID_PUBLIC/PRIVATE`, `PUSH_CONTACT`.
7. **CI (C5)** — запушить в свой GitHub-репозиторий: workflows ci/e2e/backup/sync/push подхватятся;
   дождаться зелёного E2E-рана (5 сценариев).
8. **Реальные устройства** — iPhone: fullscreen/автоплей/смена озвучки; Android: 10 страниц без
   горизонтального скролла.
9. **Next 16 (опц.)** — codemod `middleware.ts` → `proxy.ts` (сейчас только warning).
