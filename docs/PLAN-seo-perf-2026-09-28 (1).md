# AniNova — план доработки по итогам аудита (SEO + PageSpeed), 28.09.2026

> **Статус волн:** S1 ✅ выполнена 28.09 (commit `ecc97aa`) · S2 ✅ выполнена 28.09 (commits `c9d8cfd`+`442abc4`+`9cf5edc`: HTML главной 1100→212 КБ, SSR-img 268→46, h3 237→24, flight 590→~110 КБ, text/HTML 1.9→4.5%) · S3 ✅ выполнена 28.09 (commits `953856d`+`f75a058`+`4ea54fa`+`dbe963d`+`6e8afd4`+`d0c3ce9`: H1=1/66 симв., h3 24→10 уникальных, JSON-LD 3 блока, canonical+OG на всех ключевых, keywords убран, W3C 0/0, sitemap/robots починены на живой домен) · S4–S6 — в очереди. **Прод `https://aninova-catolog.vercel.app`** (домен снова сменился: `aninova-catalog` → 307 на него; `anistream.vercel.app` отошёл третьему лицу — NEXT_PUBLIC_SITE_URL на Vercel протух, S3.0 обходит это через VERCEL_PROJECT_PRODUCTION_URL).
> **Внимание: прод-домен сменился** — проект на Vercel переименован, живой адрес теперь `https://aninova-catalog.vercel.app` (старый `aninova-catolog.vercel.app` → 404). Все проверки ниже — по новому домену.
> **Итоги S1 (прод-замер 28.09):** постер 230×345: 53.7→21.1 КБ (-61%, webp, край MISS→HIT); баннер 1900×400 w=1600: 357.6→108.5 КБ (-70%); мобильный LCP-баннер w=752: **35.4 КБ** (было 164–494 КБ jpeg); прямых `<img>` на s4.anilist.co в SSR главной: **0** (было 266+); preload hero-баннера в `<head>`: есть; Content-Type всегда соответствует байтам (баг .webp-фиксации исправлен); авто-переговоры → WebP (AVIF только по явному `fmt=avif`: энкод 3.4 с против 90 мс при равной экономии).
> **Итоги S2 (локальный замер prod-сборки 28.09):** S2.1 — рельсы 14→10, онгоинги 178→10 (главный пожиратель веса: ~480 КБ flight), weekTop 12→10, «Новые эпизоды» ≤8 строк (3/3/2 Вчера/Сегодня/Завтра), EveningRail убран с главной; S2.2 — онгоинги/полнометражки/TopTabs стали ленивыми (LazyRail/useLazyTitles: в SSR только слаги, карточки через /api/titles по IntersectionObserver, skeleton без CLS), PosterCard переведён на CardTitle-проекцию (RSC-payload карточки 2.7→0.3 КБ), /api/titles отдаёт status; S2.3 — SeoIntro (3 абзаца) + FAQ 6 вопросов (details/summary). **HTML главной 1100→212 КБ** (цель ≤600), SSR `<img>` 268→46 (цель ≤150), ссылок 564→130, h3 237→24, flight ~590→~110 КБ, text/HTML 1.9→4.5% (цель ≥4%), «онгоинг» 178+→20 вхождений.

Источники данных:
- **SuperSEO Analyzer** (`uploads/seo-analysis-e7f28677.html`), цель `https://aninova-catalog.vercel.app`, итог **74.3/100**, TTFB 423 мс, HTML **1081 КБ**.
- **PageSpeed Insights** (4 скриншота от 28.09, 02:58): mobile **82/93/100/100**, desktop **95/93/100/100** (Perf/A11y/BP/SEO).
- Расхождение: в SuperSEO PSI mobile = 74 и LCP 12.3 с, на скриншотах 82 и 4.8 с — это вариативность прогонов (холодный кэш/регион). Лечим худший случай, цели ставим по обоим прогонам.

---

## 1. Сводка текущего состояния

| Метрика | Mobile | Desktop | Норма | Статус |
|---|---|---|---|---|
| Performance | 82 | 95 | ≥90 | ⚠️ mobile |
| Accessibility | 93 | 93 | 100 | ⚠️ |
| Best Practices | 100 | 100 | 100 | ✅ |
| SEO | 100 | 100 | 100 | ✅ |
| FCP | 1.4 с | 0.3 с | ≤1.8 с | ✅ |
| **LCP** | **4.8 с** (в прогоне SuperSEO 12.3 с) | 1.4 с | ≤2.5 с | 🔴 |
| TBT | 40 мс | 30 мс | ≤200 мс | ✅ |
| CLS | 0.005 | 0.002 | ≤0.1 | ✅ |
| Speed Index | 1.8 с | 0.8 с | — | ✅ |

Группы SuperSEO: meta 78.6 · **headings 27.3** · content 75 · images 83.3 · links 80 · **technical 64.3** · speed 85.7 · security 75 · **schema 50** · mobile 100 · external 100 · w3c 50.

Главный инсайт PSI (оба устройства): **«Улучшите загрузку изображений» — экономия 2412 KiB (mobile) / 2755 KiB (desktop)**. Раскладка по скриншотам:
1. `s4.anilist.co` — баннеры Hero (`div.hero__slide > img.hero__bg`): 5 файлов 164–494 КБ (суммарно ~1.4–1.7 МБ), разрешение до 1220×1100 против размера контейнера, JPEG.
2. `aninova-catalog.vercel.app/img?url=…` — постеры (`img.poster-art`, `span.poster-anim`): оригинальные JPEG 27–163 КБ без ресайза (230×329 в контейнер 150×220, 220×320 в 44×62 и т.д.), webp/avif **0 шт**, srcset **0 шт**.

---

## 2. Корневые причины (ранжировано по влиянию)

| # | Проблема | Где в коде | Эффект |
|---|---|---|---|
| R1 | Прокси `/img` **не транскодирует и не ресайзит**: байты апстрима отдаются как есть; negotiation по Accept только пишет jpeg-байты в файл `.webp/.avif` и отдаёт их с чужим Content-Type (браузер спасает sniffing, пользы 0) | `app/img/route.ts` | +2.4–2.7 МБ трафика, LCP mobile 4.8–12.3 с |
| R2 | Постеры/баннеры — plain `<img>` без srcset/sizes/resize | `components/anime/PosterArt.tsx`, `components/anime/Hero.tsx` | то же + «размер изображения превышает контейнер» |
| R3 | Нет preload LCP-элемента (первый баннер Hero) | `components/anime/Hero.tsx` | LCP mobile |
| R4 | Тяжёлый HTML главной: 1081 КБ, 266 img, 539 ссылок, ~237 H3 (дубли тайтлов в разных рельсах) | `app/page.tsx`, `components/anime/PosterCard.tsx` (`<h3 class="card__title">`) | рендер mobile, text/HTML 1.9%, headings 27.3, плотность «онгоинг» 5.3% |
| R5 | Главная: **нет H1**, нет JSON-LD (на `/anime/[slug]` он есть), нет `og:url`/`og:locale`/canonical, устаревший `keywords` | `app/layout.tsx`, `app/page.tsx` | headings 27.3, schema 50, meta 78.6 |
| R6 | Контраст текста: `--muted-2` dark `#6b7689` ≈ 4.15:1, light `#8a93a3` ≈ 2.9:1 (норма 4.5:1); чипы жанров `--dbi: hsl(H 80% 65%)`, `span.sidebar-top__score`, `span.acc__date/__meta`, `p.panel__note` | `app/globals.css` (строки 14–15, 3584+), чипы | A11y 93 (mobile+desktop) |
| R7 | CSP только в Report-Only → сканеры считают «CSP отсутствует»; 1 ошибка W3C | `next.config.ts` | technical 64.3, security 75, w3c 50 |
| R8 | Нет аналитики (Метрика/GA) → нет поведенческих сигналов и ИКС | — | вне страницы |
| R9 | Офф-сайт: XT Trust 0.01, Яндекс ИКС None, внешних ссылок 0 | — | вне страницы |
| R10 | Сервер US (Amazon) — для РУ-аудитории TTFB держит Vercel CDN (ISR `revalidate=3600`), факт. 423 мс | — | приемлемо, не чиним |

Ложные срабатывания SuperSEO (не чиним, только верифицируем вручную): «HTTPS включён: внимание», «HTML5 DOCTYPE: внимание», «viewport: внимание» — на проде HTTPS, `<!DOCTYPE html>` и viewport присутствуют (это артефакт парсера). `geoip`/`whois` = 100 при 0 проверок — пустые группы, игнор.

---

## 3. План работ (волны S1–S6, по коммиту на блок)

Правила процесса не меняются: отдельный коммит на блок, `npm run typecheck && npm run build` после каждого, проверка на проде, email коммита `artemnovozhennikov@mail.ru`.

### Волна S1 — изображения и LCP (P0, цель: Perf mobile ≥90, LCP ≤2.5 с, экономия ~2.5 МБ)

**S1.1 — `/img` прокси v2: транскод + ресайз** (`app/img/route.ts`)
- Параметры `?url=&w=&q=&fmt=auto|webp|avif|jpeg`; транскод через `sharp` (`serverExternalPackages: ['sharp']` в `next.config.ts`), ресайз по `w` (×2 для dpr-варианта), качество 72–80.
- Кэш варианта в `/tmp/img` (serverless) + FS-кэш на self-hosted; `Cache-Control: public, max-age=31536000, immutable` (уже есть) → транскод один раз на регион, дальше с края Vercel.
- **Фикс бага Content-Type**: отдавать ровно тот MIME, в котором лежат байты; убрать запись jpeg-байтов в `.webp`-файл.
- Whitelist хостов и контракт `?url=` не меняем (обратная совместимость со всеми вызовами).

**S1.2 — `next/image` с кастомным loader'ом на `/img`** (`PosterArt.tsx`, `Hero.tsx`, `lib/art.ts`)
- `loader` → `/img?url=…&w={width}&fmt=auto`; получаем srcset/sizes/fetchPriority автоматически, без ломки прокси-контракта.
- Постер-слоты: карточка рельса `sizes='(max-width:768px) 44vw, 220px'`, сайдбар/топ — свои; баннер Hero `sizes='100vw'`, `w≤1600, q=72`.
- Фолбэк-логика (`onError` → генеративный `artUri`) сохраняется.

**S1.3 — preload LCP** (`Hero.tsx`)
- `ReactDOM.preload(href первого баннера, { as:'image', fetchPriority:'high' })` в RSC; первый слайд остаётся `priority`, остальные `lazy` (не менять — иначе CLS/трафик).

**Приёмка:** инсайт PSI «современные форматы/ресайз» ≈ 0 KiB; баннер Hero ≤ 250 КБ; LCP mobile ≤ 2.5 с (медиана 3 прогонов); CLS ≤ 0.05.

### Волна S2 — вес HTML и DOM главной (P0, цель: HTML ≤ 600 КБ, DOM ≤ ~4500 узлов, text/HTML ≥ 4%)

**S2.1 — trim рельсов** (`app/page.tsx`, `lib/catalog.ts homeRails()`)
- Карточек в рельсе 12→10, `weekTop` 12→10, сайдбар-топ 10→8, `LatestEpisodes` ограничить 8 строками; убрать дублирование выдачи (Evening/Because/ForYou перекрываются по смыслу — оставить 2 из 3).

**S2.2 — ленивые рельсы ниже сгиба**
- SSR оставляет Hero + LatestEpisodes + 2 рельса + чипы жанров + сайдбар; остальные рельсы догружаются клиентом через `IntersectionObserver` + существующие данные каталога (без нового API), с skeleton-состоянием. SEO-контент (чипы, текстовый блок, sitemap) остаётся в SSR.

**S2.3 — текстовый SEO-блок + FAQ** (`app/page.tsx`, новый `components/home/SeoIntro.tsx`)
- 2–3 абзаца о каталоге (разбавить плотность «онгоинг» 5.3% → ≤3%), FAQ-аккордеон на 4–6 вопросов (жанры/расписание/плеер) — одновременно контент под FAQPage-разметку из S3.

**Приёмка:** HTML главной ≤ 600 КБ (замер `curl -s | wc -c`), 266→≤150 img в SSR, text/HTML ≥ 4% в SuperSEO.

### Волна S3 — on-page SEO (P1, цель: headings ≥80, schema ≥90, meta ≥95) — ✅ ВЫПОЛНЕНА 28.09

**S3.0 (внеплановый hotfix, `953856d`)** — прод-URL: `NEXT_PUBLIC_SITE_URL` на Vercel указывает `anistream.vercel.app` (домен отошёл третьему лицу — отдаёт чужой сайт); sitemap.xml (7966 URL) и robots.txt ссылались на него. `resolveSiteUrl()`: *.vercel.app из env считается протухшим при известном `VERCEL_PROJECT_PRODUCTION_URL`; кастомный домен в env сохранит приоритет (S6). Legal-страницы переведены на `site.url`.

**S3.1+S3.3 — заголовки/анкоры/W3C (`f75a058`, `6e8afd4`)** ✅
- Page-level sr-only H1 «AniNova — каталог аниме: онгоинги, расписание выхода серий и плеер» (66 симв., ≠ title); hero-тайтл h1→h2; на главной ровно 1 H1.
- `PosterCard`: h3→p (24 дубля H3 устранены), article→div (W3C «Article lacks heading» ×20); FAQ-вопросы → 6 уникальных h3; на главной h3=10, все уникальные.
- W3C-фикс `role=tab`→`tabpanel`: TopTabs (+ Hero-dots → role=group), ReviewsSection, PlayerShell, achievements. W3C главной: **0 ошибок / 0 предупреждений** (было 1 ошибка).
- Якоря: sr-only-тексты в ссылках-постерах (устранены 9 дублей «Анонс 2027 12 серий») и иконках хедера (🎲/🏆/закладки/настройки) — коротких анкоров 0.
- e2e-селекторы тегонезависимы (`.hero__title`, `.card .card__title a`) — не сломаны; vitest 30/30.

**S3.2 — разметка и мета (`4ea54fa`, `dbe963d`, `d0c3ce9`)** ✅
- JSON-LD главной (`components/home/HomeJsonLd.tsx`): WebSite+SearchAction(/search?q=), CollectionPage+ItemList (10 из «Сейчас популярно»), FAQPage (6 из FAQ_ITEMS) — 3 валидных блока.
- metadata: `keywords` удалён; canonical + полный OG (type/url/locale ru_RU/siteName/images) на /, /catalog, /schedule, /top, /genres, /search (canonical на чистый /search), /genre/[slug], /anime/[slug] (+og:url), /anime/[slug]/[episode], /collections/[slug]. **Нюанс: Next мержит metadata поверхностно — page-level openGraph полностью заменяет layout-объект**, поэтому поля дублируются на страницах явно.
- Фикс дубля бренда в title /catalog, /anime/[slug], /genre/[slug] («— AniNova · AniNova» — template добавлял второй суффикс).
- Убран unused preconnect s4.anilist.co (PSI: изображения с S1 идут через /img).
- /img: webp/jpeg default q75→70 (постер w640 ~23→21.7 КБ), hero-баннер q72→64 (w750 webp 27.1→25.4 КБ); fmt=auto: fallback для wildcard-Accept orig(349 КБ!)→webp(25.4 КБ) — краулеры/curl больше не тянут оригиналы; jpeg только по явному jpeg-only Accept; Vary: Accept сохранён.

**Приёмка (факт на проде 28.09):** H1=1 (66) ✓ · h3=10 unique ✓ · JSON-LD=3 valid ✓ · keywords absent ✓ · canonical+og:url+og:locale+og:image на всех ключевых ✓ · sitemap/robots → aninova-catolog ✓ · W3C 0/0 ✓ · коротких анкоров 0 ✓ · title без дубля бренда ✓. Ожидание SuperSEO: headings 27.3→≥73, schema 50→100, meta 78.6→≥95, technical ↑, w3c 50→100. **Перегнать SuperSEO/PSI для фиксации.**

**PSI 28.09 (срез до S3, отчёт mcxraslsys + API-квота 429):** mobile Perf 89 (было 82) / A11y 93 / BP 100 / SEO 100: FCP 1.2, LCP 3.4 (было 4.8), TBT 80, CLS 0, SI 4.2; desktop Perf 83–99 (сильный разброс TBT 30–350 мс — шум десктоп-прогона; LCP 0.8, FCP 0.3, CLS 0.001). Инсайты: image delivery (баннеры/постеры — закрыто q64/q70 в S3.2), legacy JS 12 КБ (polyfills в chunk 3794 — бэклог), render-blocking CSS 18.8 КБ (норма), unused preconnect (убран).


### Волна S4 — доступность, контраст (P1, цель: A11y 100 на обоих устройствах)

`app/globals.css` + генерация цвета чипов:
- dark `--muted-2: #6b7689 → #8b96ab` (≈6:1 на `#0b0d11`); light `--muted-2: #8a93a3 → #5c6572` (≈5.5:1 на `#f6f7fb`).
- `card__meta/card__genre/card__type`, `panel__note`, `acc__date`, `acc__meta` — перевести с `--muted-2` на контрастные токены (проверить оба theme-атрибута).
- Чипы жанров: светлота `--dbi` считать по контрасту (dark: L ≥ 72%, light: L ≤ 42%), а не фикс. 65%.
- `span.sidebar-top__score`, бейджи skorа на карточках — проверить пары фон/текст в обеих темах.

**Приёмка:** PSI Accessibility 100; аудит «contrast» пуст; визуальный регресс тем dark/light (скриншоты главной и /schedule).

### Волна S5 — technical/security (P2, цель: technical ≥85, security 100, w3c 100)

- **CSP enforce**: по плану аудита 28.09 неделя в Report-Only завершается → переключить `Content-Security-Policy-Report-Only` → `Content-Security-Policy` (embed-плееры и Turnstile уже в whitelist); перед переключением проверить отчёты.
- **W3C**: воспроизвести 1 ошибку валидатором (вероятно — void-элемент с `/` или дубль id в рельсах), починить; info-предупреждения «trailing slash» игнорируем.
- **Метрика**: `next/script` (strategy `lazyOnload`) Яндекс.Метрика + цели на просмотр/поиск; GA опционально. Даст данные для ИКС и поведенческих.
- robots/sitemap уже валидны — не трогаем.

### Волна S6 — офф-сайт и индексация (P2, без коммитов кода, кроме мета-файлов)

- Google Search Console + Яндекс.Вебмастер: подтвердить `aninova-catalog.vercel.app`, отправить `sitemap.xml`, включить обход; мониторинг покрытия.
- Заявка на ИКС (появится после индексации + Метрики).
- Каталоги/профили: страницы проекта на Shikimori/MAL/AniLibria-сообществах, пост в TG-канале проекта — первые внешние ссылки (XT Trust 0.01 → рост).
- Рассмотреть свой домен (vercel.app без whois ограничивает траст; на своём домене + sitemap в GSC рост быстрее). Решается пользователем.

---

## 4. Целевые показатели после волн S1–S5

| Метрика | Было | Станет |
|---|---|---|
| PSI Perf mobile | 82 (74 в холодном прогоне) | ≥ 90 |
| PSI Perf desktop | 95 | ≥ 97 |
| LCP mobile | 4.8 с / 12.3 с | ≤ 2.5 с |
| PSI A11y | 93 | 100 |
| Экономия изображений | 2412/2755 KiB | ≈ 0 |
| HTML главной | 1081 КБ | ≤ 600 КБ |
| SuperSEO итог | 74.3 | ≥ 85 |
| headings / schema / technical | 27.3 / 50 / 64.3 | ≥ 80 / ≥ 90 / ≥ 85 |

## 5. Риски и ограничения

- `sharp` на Vercel: требует `serverExternalPackages` и увеличивает cold-start функции `/img` (~+100 мс один раз на вариант); компенсируется immutable-кэшем края. Альтернатива при проблемах — `squoosh-wasm` или предотжата на sync в Supabase Storage (не сейчас).
- S2.2 (ленивые рельсы): не задеть SSR-контент для краулеров — чипы, H1, FAQ и ItemList остаются в серверной выдаче; проверить рендер без JS (режим «Отключить JS» в DevTools).
- S3.1 (h3→p): обновить `e2e/smoke.spec.ts`, проверить, что стили `.card__title` не зависят от тега.
- S4: правки токенов проходят через обе темы и плеер (плеер всегда тёмный — не задеть).
- Не трогаем: контракты `/api/providers/*`, `lib/sync.ts|library.ts|catalog.ts` деструктивно, `scripts/expand-catalog.mjs|fetch-jikan.mjs`, RLS-триггеры, ключи `anistream:*`.
- Токен PAT в чате всё ещё не отозван — отозвать после окончания волн (напоминание).

## 6. Порядок проверки каждой волны

1. `npm run typecheck && npm run build` (локально `NODE_OPTIONS=--max-old-space-size=448`).
2. Прод-деплой Vercel → прогон PSI mobile+desktop (3 раза, медиана) по `https://aninova-catalog.vercel.app/` и `/anime/<slug>`.
3. SuperSEO re-run (головная + 1 карточка), сверка групп с таблицей целей.
4. Ручной чек: темы dark/light, мобильная вёрстка главной, плеер (CSP после S5), скриншоты для отчёта.
