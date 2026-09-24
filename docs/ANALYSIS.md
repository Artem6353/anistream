# Анализ исходного проекта и что улучшено в AniStream 2.0

Источники анализа: скриншот главной страницы (`screencapture-localhost-3000…png`) и дамп дерева
файлов проекта (`Документ Microsoft Word.pdf`, 22 страницы, каталог `сайт_для_аниме`).

## 1. Что представляет собой исходный проект

Next.js (App Router, TypeScript) — агрегатор аниме с собственным плеером.

**Маршруты (по дампу `.next/server` и `types/app`):**
`/`, `/catalog`, `/genres`, `/genre/[slug]`, `/anime/[slug]`, `/anime/[slug]/[episode]`,
`/schedule`, `/search`, `/profile/bookmarks|history|settings`,
API: `/api/providers/[slug]/[episode]`, `/api/schedule`, `/api/search`, `robots.ts`, `sitemap.ts`.

**Компоненты:** `anime/*` (Hero, Rail, PosterCard, PosterGrid, EpisodeList, FilterPanel,
ContinueWatchingRail, BookmarkButton, WatchButton, TrailerCard, MetaBadges, Pagination, ExpandableText),
`layout/*` (SiteHeader, MobileNav, CommandPalette, SearchBar, Footer, RouteSkeleton…),
`player/*` (VideoPlayer, EmbedPlayer, useHlsPlayer, Controls, SeekBar, SettingsMenu,
ProviderSourceSelector, NextEpisodeOverlay, SkipIntroButton, VoiceoverPicker, EpisodePanel),
`profile/*`, `schedule/ScheduleBoard`, `system/*` (TvNavigation, DevicePreferences), `ui/*`.

**Данные:** провайдеры метаданных AniList + Shikimori (`lib/anilist.ts`, `lib/shikimori.ts`),
плеер-провайдеры Kodik / Aniboom / cvh / demo (`lib/providers/*`), прогрев-кэши в `.cache/*.json`
(`kodik-bridge-cache`, `multi-provider-catalog-warm-v153`, `multi-provider-embeds-v154`…),
`lib/aniskip.ts` (пропуск опенингов), `lib/library/*` (закладки/история), `data/ru-titles.json`.

### Сильные стороны оригинала

1. Полноценная продуктовая функциональность: каталог, плеер с несколькими источниками,
   расписание, профиль, командная палитра, ТВ-режим, выбор озвучек, aniskip.
2. Продуманная декомпозиция: компоненты разложены по доменам (anime/player/profile/layout/system/ui).
3. Реестр провайдеров и кэш-слой — правильная архитектурная идея для агрегатора.
4. SSR/PRERENDER: в `.next/server/app/anime/[slug]` лежат готовые HTML+RSC популярных тайтлов.

### Слабые места и риски

1. **Хрупкая зависимость от внешних плеер-провайдеров**: мосты Kodik/Aniboom с токенами,
   прогрев-кэши версионируются вручную (`-v153`, `-v154`), JSON-кэши лежат в репозитории рядом с кодом.
2. **Тяжёлый клиентский плеер**: HLS-стек (hls.js) тянет бандл и падает вместе с сетью;
   нет простого офлайн-фолбэка.
3. **Постеры и расписание целиком зависят от внешних CDN/API** — без сети страница деградирует
   в пустые плейсхолдеры (на скриншоте видны битые/полузагруженные карточки в рельсах).
4. **Дизайн-система стихийна**: герой-карусель с простыми точками, рельсы без стрелок и краевых
   затуханий, карточки с мелкими служебными бейджами, разнородные отступы секций.
5. Профиль и настройки есть, но без единого хранилища состояния (store разрознен: hooks/store/types).
6. Мелочь: дублирование сущностей (`Header.tsx` и `SiteHeader.tsx`), «Слік»-кнопка в шапке на
   скриншоте — признак непройденного редакционного прохода по UI-текстам.

## 2. Что сделано в AniStream 2.0

### Архитектура и надёжность

| Было | Стало |
| --- | --- |
| Кэши провайдеров файлами в `.cache/*.json` с ручными версиями | Снапшот каталога `lib/data/titles.json` (54 тайтла, метаданные AniList + RU-описания) + серверный кэш расписания с TTL |
| Расписание и постеры только из сети | Двухслойность: SSR отдаёт детерминированный офлайн-фолбэк (демо-неделя, генеративные SVG-постеры), клиент апгрейдит до живых данных AniList через `/api/schedule` |
| HLS-стек в плеере | Нативное `<video>` + кастомный UI (0 зависимостей): прогресс с буфером, скорость, PiP, полноэкранный, горячие клавиши, оверлей следующей серии, пропуск опенинга |
| Разрозненные hooks/store | Единый `lib/library.ts` на `useSyncExternalStore`: закладки, история с прогрессом, настройки, синхронизация между вкладками |
| Провайдеры жёстко вшиты | Реестр `lib/providers.ts`: demo доступен всегда, Kodik/Aniboom включаются токенами без правок UI |
| — | RSC по умолчанию: `/catalog`, `/genres`, `/genre/[slug]` работают без клиентского JS; фильтры — идемпотентные GET-параметры, ссылкой можно делиться |
| — | ISR: `/` и `/schedule` (revalidate 1h), API-кэш 10 мин; First Load JS 102–125 kB на страницу |

### Данные

- Каталог собран из AniList GraphQL (рейтинги, фавориты, сезоны, постеры, баннеры) и дополнен
  русскими названиями/описаниями; онгоинги помечены живым статусом.
- Расписание — **живая неделя эфиров AniList** (текущий сезон осень-2026), с маппингом известных
  тайтлов на RU-названия каталога; офлайн — детерминированная демо-неделя.
- Поиск: ранжирование по RU/ромадзи/EN/жанрам + `/api/search` для палитры и интеграций.

### Дизайн и UX

- Единая дизайн-система на CSS-токенах: тёмная тема, акцент-градиент (4 переключаемых акцента),
  радиусы/тени/типографика, фокус-ринги, `prefers-reduced-motion` и ручная настройка «меньше анимаций».
- Герой-карусель с автопрокруткой, клавиатурой и скримом; рельсы со стрелками, scroll-snap и
  краевыми затуханиями; карточки с hover-подъёмом, быстрыми действиями (смотреть/закладка) и
  прогресс-баром продолжения.
- Командная палитра `Ctrl+K`: тайтлы + жанры + действия, навигация стрелками.
- Тосты, скелетоны загрузки, спроектированные 404/ошибка/пустые состояния, skip-link, aria-разметка.
- Мобильная нижняя навигация; плеер с автопереходом и сохранением позиции каждые 5 секунд.

### Качество кода

- TypeScript strict, доменные типы в `lib/types.ts`, без `any` в домене.
- Один источник правды для подписей (`lib/labels.ts`), склонения и время (`lib/format.ts`).
- 14 маршрутов + API, `sitemap.ts`/`robots.ts`, метаданные и OG на каждой странице.
- Сборка проходит `tsc --noEmit` и `next build` без предупреждений; все маршруты проверены HTTP-тестами (200/404).

## 3. Итерация 2.1 (продолжение)

- **Трейлеры**: 51/54 тайтлов получили youtube-nocookie трейлеры из поля `trailer` AniList;
  блок на детальной странице с ленивой загрузкой.
- **OG-карточки**: `next/og` (Satori) — сайтовая карточка и персональная карточка тайтла
  (баннер + постер + рейтинг + описание); генерируются на сервере, офлайн-фолбэк — генеративный арт.
- **PWA**: `manifest.ts`, maskable-иконка, service worker с офлайн-оболочкой,
  cache-first для постеров AniList и network-first для `/api/schedule`.
- **UX**: `/` открывает командную палитру; герой собирается из `heroSlides()` (только тайтлы с баннерами).
- **Корректность статусов**: `notFound()` вынесен в `generateMetadata` (до старта стриминга),
  корневой `loading.tsx` заменён посегментными скелетонами — 404 теперь настоящий HTTP-404.
- **QA**: `scripts/smoke.mjs` (`npm run smoke`) — 21 маршрутная проверка статусов; все PASS.

## 4. Итерация 2.2: провайдеры, Shikimori, ТВ-режим

### Обзор упомянутых библиотек

| Библиотека | Что это | Решение |
| --- | --- | --- |
| `thedvxch/kodikwrapper` (npm 3.1.0) | Node-обёртка kodikapi.com: `Client.search`, `VideoLinks.getLinks/parseLink/parseSkipButtons` | **Интегрирована**: резолвер `lib/providers/kodik.ts` |
| `YaNesyTortiK/AnimeParsers` | **Python**-библиотека парсеров (kodik/anilibria/shikimori/aniliberty) | В Node неприменима; использована как справочник API (KODIK_API.md, SHIKI_API.md) и домен shikimori.**io** из changelog; база для будущего aniboom-парсера |
| `qt-kaneko/Shikiplayer` | Браузерное расширение: встраивает Kodik-плеер в сайт Shikimori | Референс UX (озвучки, настройки, быстрый релиз-цикл); не библиотека |
| `YaNesyTortiK/Kodik-Download-Watch` | Python-утилита просмотра/загрузки из Kodik | Референс потока VideoLinks (parse → getLinks → skip-тайминги) |

### Что сделано

1. **Серверный прокси провайдеров** `GET /api/providers/[slug]/[episode]?provider=…` (как в оригинале):
   токены не выходят с сервера; ответы кэшируются CDN-заголовком на час.
   Коды ошибок: 409 — провайдер залочен (нет токена), 502 — апстрим недоступен, 400/404 — валидация.
2. **Kodik-резолвер**: поиск по `shikimori_id` (датасет обогащён ids), ссылка конкретной серии из
   `seasons→episodes`, прямые HLS-файлы через `VideoLinks.getLinks`, тайминги OP/ED из `parseSkipButtons`,
   озвучка из `parseLink(extended)`; фолбэк — embed-iframe плеера Kodik.
3. **Плеер**: переключение провайдеров пилюлями над плеером; HLS через ленивый `import('hls.js')`
   (MP4 — нативно, бандл не растёт для демо-сценария); меню качества по файлам провайдера;
   кнопка «Пропустить опенинг» с реальными таймингами; выбор провайдера по умолчанию в настройках.
4. **Shikimori как второй источник**: `lib/shikimori.ts` + `scripts/refresh-shikimori.mjs` —
   54/54 тайтлов обогащены (id, русское имя, RU-описание, скор); дедупликация по сопоставлению имён;
   на детальной странице — блок «Описание по данным Shikimori» + русское имя в подзаголовке.
5. **ТВ-режим**: `lib/tv/useTvMode.ts` — пространственная D-pad навигация (геометрия rect + штраф
   поперечного смещения) без ручных реестров фокуса; включается в настройках, стили фокуса `data-tv`.
6. **QA**: smoke расширен до 26 проверок (включая коды ответов прокси-провайдеров). Все PASS.

## 5. Итерация 2.3: боевая конфигурация окружения и диагностика Kodik

1. **Drop-in совместимость `.env`**: модуль `lib/config/providers.config.ts` читает схему
   исходного проекта (`KODIK_*`, `SHIKIMORI_*`, `ANISKIP_ENABLED`, `DEMO_ENABLED`,
   `PROVIDER_CACHE_*`, `NEXT_PUBLIC_SITE_*`); сайт-URL проникает в metadataBase/OG/sitemap/robots.
2. **Файловый кэш резолвов** `lib/providers/cache.ts` (аналог `.cache/kodik-bridge-cache.json`):
   TTL и путь из окружения, атомарная запись, in-memory слой поверх.
3. **AniSkip-фолбэк** (`lib/aniskip.ts`): если Kodik не отдал skipButtons, тайминги OP/ED берутся
   с api.aniskip.com по MAL-id; датасет обогащён `idMal` (50/54 тайтлов).
4. **Цепочка токенов Kodik**: `KODIK_TOKEN` → `getPublicToken()` (кэш 1 ч). Выяснено экспериментом:
   токен из вашего `.env.local` (`447d179e…`) совпадает с публичным токеном плеера Kodik —
   это не приватный ключ, а извлекаемый из плеерного скрипта; на момент теста апстрим отклонял его
   (401) и с тестового дата-центр IP, и свежераспакованный — типичная ротация/geo-block публичных токенов.
   Интеграция при этом проверена до границы апстрима: HTTP-контур, маппинг ошибок (409/502/400/404),
   фолбэк плеера на демо и файловый кэш работают.
5. **Диагностика**: `scripts/check-kodik.mjs` (`npm run check:kodik`) — воспроизводимая проверка
   цепочки с машины владельца (residential-IP), где публичные токены обычно принимаются.

## 6. Итерация 2.4: воспроизведение проверенной архитектуры оригинала

После разбора боевой схемы оригинала плеер-слой перестроен 1-в-1 по ней:

1. **Единая точка входа** `GET /api/providers/[slug]/[episode]` возвращает `EpisodeSources` —
   фронт/плеер не знают про Kodik/CVH/AniBoom, они выбирают озвучку/источник из единого списка
   (`{ id, label, providerId, providerName, kind: embed|file, embedUrl|files }`).
2. **Контекст каталога**: registry передаёт провайдерам полный контекст AniList
   (anilistId, malId, shikimoriId, slug, title, originalTitle, year, format, episodesCount)
   плюс episode/totalEpisodes — провайдер не угадывает тайтл.
3. **Локальные Python-bridge** (проверенная рабочая связка): `bridges/kodik_bridge.py` (8765,
   anime-parsers, `KodikParser`, `with_episodes`, поиск КОНКРЕТНОЙ серии → `/seria/…` embed) и
   `bridges/multi_player_bridge.py` (8766, anime-dl-core → CVH `animego.me/cdn-iframe/…`,
   AniBoom `aniboom.one/embed/…`). Контракт `/health` + `/resolve` задокументирован в `bridges/README.md`,
   нормализатор Next терпим к историческим формам (`results[]`, `embed_url`, `link`).
4. **Cache-first + self-growing** + отдельные этапы **warmer** (`npm run warm`: «есть ли провайдер»)
   и **hydrator** (`npm run hydrate`: «сохрани episode-specific embed»), статистика
   successful/cached/failed как в оригинале (2399/2348/51 → у нас 12/12/0 на мок-bridge).
5. **Registry-merge**: `PROVIDER_MODE=merge` собирает озвучки всех провайдеров (Kodik 10 + CVH 5 +
   AniBoom 4 → единый список), `first` — остановка на первом ответившем; пер-провайдер таймаут
   `PROVIDER_TIMEOUT_MS`; ошибки bridge видны в `errors` и флагом в плеере, страницу не роняют.
6. **Kodik-direct** оставлен запасным путём (kodikwrapper: episode-specific link из seasons→episodes,
   VideoLinks HLS, skipButtons) на случай absence bridge при живом токене.
7. Проверено end-to-end на мок-bridge: episode-specific embed с shikimoriId и номером серии в URL,
   второй запрос — из кэша, warmer/hydrator пишут `.cache/warm-summary.json` и кэш-файл.

## 7. Итерация 2.5: импорт боевого кэша прошлого проекта (2399 тайтлов)

Полученный дамп `.cache` (docx) распарсен: внутри `kodik-anilist-map.json`,
`kodik-bridge-cache.json` (3322 ключа `{anilistId, episode}` → voiceovers с `/seria/…`),
`kodik-catalog-warm.json`, `multi-provider-catalog-warm.json` и
`multi-provider-embeds-v154.json` (2348 записей `id:ep` → providers → voiceovers → embedUrl + opening/ending).

1. Импортёр (`scripts/import-legacy-cache.mjs`, `npm run import-legacy`) мапит anilistId→slug
   текущего каталога, нормализует `//…` → `https://…`, voice/subs, opening/ending → skip-тайминги,
   и складывает `EpisodeSources` в `.cache/providers-resolve-cache.json` с годовым TTL записи.
2. Итог импорта под текущий каталог (54 тайтла): **48 тайтлов, 420 источников**
   (kodik 315, cvh 64, aniboom 41) — включая эталонные URL из вашего разбора:
   `animego.me/cdn-iframe/52991/Dream Cast/1/1`, `aniboom.one/embed/…?episode=1`, `kodikplayer.com/seria/…`.
3. Cache-first сразу отдаёт их плееру (`fromCache: true`, флаги `cvh + aniboom` в баре),
   warmer теперь считает 48/54 тайтлов с источниками без единого bridge; живые резолвы bridge
   при miss перезаписывают legacy-записи свежими (self-growing поверх легаси-базы).
4. Методология episode-specific полностью совпадает с описанной вами: `with_episodes=true` →
   `seasons[*].episodes[*]` → точный episode → translation-ссылки `/seria/…`; при отсутствии
   названия — shikimori-id discovery (у нас: shikimoriId из датасета → `search_by_id`);
   CVH/AniBoom — `get_voices(anime_id, episode)`-эквивалент через multi-player bridge.

## 8. Итерация 2.6: все серии всех тайтлов + каталог 1600+

1. **Причина «работает только 1 серия»**: боевой кэш хранит в основном episode-1 резолвы
   (медиана серий на тайтл = 1), а серии 2+ без bridge не резолвились. Лечение — синтез:
   номер серии является частью embed-URL у CVH (`cdn-iframe/<id>/<voice>/<season>/<ep>` и
   `?dubbing=<voice>`) и AniBoom (`?episode=N`) → `lib/providers/synthesize.ts` строит серии 2+
   из кэш-шаблона episode-1 (или любой кэшированной серии).
2. **Gap-fill**: если у тайтла нет CVH/AniBoom-шаблона (kodik-only, hash уникален на серию),
   URL подбираются пулом глобальных озвучек CVH (имена озвучек не привязаны к тайтлу):
   топ-10 из легаси-кэша (AnilibriaTV, AniDUB, SHIZA Project, …) с пометкой `guessed`.
3. **Честная доступность**: `/api/availability/[slug]` → cache | synth | guess | demo для каждой
   серии; точки на сетке серий + уведомление в плеере, когда идёт тест-поток.
4. **Каталог 1623 тайтла**: к 54 редакционным добавлены все anilist-id из боевого кэша
   (1598 живых из 2348; 750 id в AniList более не существуют). Клиентский бандл облегчён:
   профиль/«продолжить»/палитра берут тайтлы через `/api/titles` и `/api/search` вместо датасета.
5. **Кэш переимпортирован под новый каталог**: 1617 тайтлов / 7529 источников
   (kodik 6542, cvh 698, aniboom 289). Warm по первым 400 тайтлам: 394 с источниками.
6. AniLibria как безключевой all-episodes провайдер исследована и отклонена: публичный API v3
   возвращает 410, зеркала пусты — мёртвый код не поставляем.

## 9. Итерация 2.7: предпубликационный аудит и починка

1. **«Работает только 1 серия» у kodik-only тайтлов (например, HxH 2011)**: синтез пропускал
   episode 1 (`episode <= 1 → null`) и не умел строить серию 1 из шаблона других серий.
   Теперь `synthesizeEpisode` покрывает ЛЮБОЙ номер: шаблон из любой кэшированной серии
   (кроме самой себя) + guess-пул озвучек CVH по shikimoriId. HxH: ep1 и ep148 — по 11 источников.
2. **Поиск «не искал аниме»**: новые тайтлы до обогащения имели только ромадзи — RU-запросы
   промахивались. В индекс `searchTitles` добавлено `shikimori.ru`; фоновое обогащение доведено
   до 1577/1623 тайтлов с русскими названиями и описаниями («кайдзю» → «Кайдзю № 8»).
3. **Мелочи публикации**: явное «Найдено: N» в каталоге, год 0 убран из фильтра, рейтинг 0 не
   рисуется на карточках, фолбэк-текст описания вместо пустоты, DMCA-блок «Правообладателям»
   в футере, npm-алиас `enrich`, README-чеклист публикации (домен в NEXT_PUBLIC_SITE_URL,
   build/start, warm/hydrate, smoke, юридическая заметка).
4. **Аудит маршрутов**: smoke 24/24; каталог с композитными фильтрами (genre+type+sort) — 574
   результата; поиск, жанры, главная, расписание, профиль, OG, sitemap/robots — без ошибок.

## 10. Итерация 2.8: живые bridge v2 на реальной библиотеке AnimeParsers

1. `anime-parsers` отсутствует в PyPI, ставится zipball'ом с GitHub; модуль `parser_shikimori`
   содержит f-strings из Python 3.12+ → в bridge встроен compat-загрузчик `parser_kodik`/
   `parser_animego` для Python 3.11 (пакет ставится как `anime_parsers_ru`).
2. **kodik_bridge v2**: `KodikParser(token=None)` сам подбирает рабочий токен из пула
   (функция `get_token` официального репозитория) — проверено: токен жив даже с дата-центр IP,
   где «публичный токен» из плеера уже отклонён (401). Далее боевая схема: `search(shikimori_id,
   with_episodes=true, episode=N)` → `seasons[*].episodes[*]` → точная серия → `/seria/…` на озвучку.
3. **multi_player_bridge v2**: `AnimegoParser.get_voices(shikimoriId, episode)`; ответ
   `{voices:[{label, translation_id, player, embed}]}`; фолбэк — `search(title)` + `get_voices(animego_id)`,
   т.к. id animego ≠ id shikimori (embed при этом содержит shikimori-id: `cdn-iframe/52991/…`).
4. **Registry**: порядок cache → live-bridge → синтез/guess → demo; live-провайдеры сливаются
   параллельно (`PROVIDER_MODE=merge`). Замер: Frieren ep26 вне кэша → `sourcesUsed:
   [kodik, cvh, aniboom]`, 20 источников за ~4 c; прогретые bridge убирают таймаут первого запроса.
5. Синтез/guess помечены `fromCache: false` (честные флаги в плеере); инструментация registry убрана.

## 11. Итерация 2.9: редизайн по мотивам AnimeGO + скорость + все устройства

1. **Скорость warm/hydrate**: warm больше не дёргает резолвы — идёт через `/api/availability/[slug]`
   (чистое чтение кэша) с параллельностью 12; hydrate — параллельность 8; запись кэша коалесцируется
   дебаунсом (`PROVIDER_CACHE_WRITE_DEBOUNCE_MS`, по умолчанию 750 мс) вместо перезаписи файла на
   каждый miss (убирает O(n²)-IO, из-за которого warm «полз» на больших каталогах).
2. **Каталог как на AnimeGO, но лучше**: вид «список» (строки с описанием) и «сетка» с переключателем,
   сайдбар-фильтры (диапазон лет, тип, статус, длина серий, жанры-аккордеон, сортировка),
   серверные GET-параметры (ссылки делимые), чипы снятия жанров.
3. **ТОП-250** (`/top`): нумерованный рейтинг с медальными цветами топ-3 и сайдбар-статистикой
   (средняя оценка, лидер) — как TOP-250 AnimeGO, но по живым оценкам AniList.
4. **Карточка тайтла**: инфо-таблица (тип, эпизоды, жанры, первоисточник, сезон, статус,
   длительность, рейтинг, студия, возраст) — поля докачаны из AniList (1500/1623 тайтлов:
   studios/source/duration/isAdult); кнопка «Добавить в список» с шестью статусами
   (Смотрю/Просмотрено/Отложено/Брошено/Запланировано/Пересматриваю) + страница `/profile/list`.
5. **Главная**: двухколоночный блок «Расписание аниме» (аккордеон по дням, сегодня раскрыт)
   + лента «Обновления аниме» (серии сегодняшнего дня с временем) — функциональный аналог
   главной AnimeGO поверх наших живых данных AniList.
6. **Все устройства**: media-правки нового UI (сайдбар → стек <980px, плеер-бар и громкость на
   узких экранах, чипы источников скроллом), `@media (hover:none)` — закладки и действия видны
   без ховера (тач), меню списков не выезжает за экран, сетки строк/топа сжимаются до 420px.
7. Smoke расширен до 30 маршрутов (top, profile/list, list-view, availability, api/titles) — все PASS.

## 12. Итерация 2.10:_security-апгрейд Next.js (CVE-2025-66478 и компания)

1. `next@15.5.4` помечен уязвимым (CVE-2025-66478); деприкейтед также 15.5.5–15.5.8
   (security-update-2025-12-11). Патчеванная линия 15.x заканчивается на 15.5.25, но postcss
   внутри 15.x остаётся с advisory (GHSA-qx2v-qp2m-jg93 и др.) — лечится только next 16.3+.
2. Выбран **next@16.3.5**: `npm audit` → **0 vulnerabilities**; sharp/postcss закрыты.
3. Next 16 по умолчанию собирает через Turbopack, который на хостах с малой RAM может упирать
   в OOM; в package.json зафиксировано `"build": "next build --webpack"` — предсказуемый режим,
   проверенный CI-прогоном (30/30 маршрутов, OG-генерация). Флаг убирается для Turbopack.
4. Совместимость App Router-кода с 16.x подтверждена полным смоуком и прод-сборкой без правок
   исходников; `next/og`, API-роуты, ISR и кэш-слой работают как на 15.x.

## 13. Итерация 2.11: тихие bridge и таймаут-дисциплина

Разбор стены `ConnectionAbortedError [WinError 10053]` из консоли bridge: клиент (Next) рвал
соединение по `PROVIDER_TIMEOUT_MS=6000`, а bridge дописывал ответ в закрытый сокет. Не фатально
(поток умирал, сервер жил, сайт падал на кэш), но спамило и обрезало медленные ответы AnimeGo.
Лечение с обеих сторон:
1. Bridge: внутренние кэши `(provider, id, episode) → sources` с TTL 6 ч (замер: 1-й вызов 6.8 c,
   2-й — 11 мс); `_send` и `do_POST` ловят abort-ошибки молча; `QuietServer.handle_error`
   подавляет трейсбеки обрывов соединения.
2. Registry: индивидуальные таймауты провайдеров `timeoutFor(id)` = bridge-таймаут + 500 мс grace
   (клиент больше не рвёт раньше, чем bridge успеет ответить); merge-гонка и slot-race используют их.

## 14. Итерация 2.12: выполнение ТЗ 2.0 (спринты 1–4)

| Пункт ТЗ | Статус | Реализация |
| --- | --- | --- |
| 1.1 / 3. База 5000+ и полнота франшиз | ✅ | `scripts/expand-catalog.mjs`: **5002 тайтла**, 3491 со связями (SEQUEL/PREQUEL/PARENT/SIDE/SPIN), 4971 с персонажами, 3262 с трейлерами; авто-прогон каждые 6 ч через `.github/workflows/sync-catalog.yml` |
| 1.2 Синхронизация плееров | ✅ | registry: cache → live-bridge (kodik/cvh/aniboom) → synth → guess; покрытие warm 1611/1623 до расширения |
| 1.3 Очередь ошибок парсеров | ✅ | `.cache/provider-errors.jsonl` + админка `/admin/login` (httpOnly-cookie от ADMIN_TOKEN) |
| 2.1 Список серий в плеере | ✅ | горизонтальный скролл-бар под плеером + сетка в боковой панели, активная подсвечена, автоскролл |
| 2.2 Табы озвучек | ✅ | боковая панель: группы по провайдерам (Kodik/CVH/AniBoom/Demo) и подгруппы «Многоголосый/Субтитры»; выбор хранится в localStorage per-title |
| 2.3 Порядок просмотра | ✅ | блок «Порядок просмотра» (BFS по связям + хронология), метка «вы здесь» |
| 2.4 График выхода серий | ✅ | таблица под плеером: №, название, дата, время МСК, статус; онгоинги — точные даты AniList airingSchedule |
| 2.5 Трейлеры | ✅ | YouTube-трейлеры из AniList (TrailerCard), 3262 тайтла с трейлером |
| 3.1 Персонажи | ✅ | блок с фото, именем и ролью (MAIN/SUPPORTING), до 12 персон |
| 3.2 Галерея кадров | ✅ | Shikimori screenshots + лайтбокс (Esc/←/→); наполняется фоновым enrich |
| 3.3 Названия/даты серий | ⚠️ | даты онгоингов точные (МСК); названий серий у завершённых тайтлов AniList/Shikimori не отдают — честно помечено в UI и доках |
| 3.4 Автодобавление | ✅ | GH Actions cron 6h + workflow_dispatch; коммит `lib/data/titles.json` → автодеплой |
| 4.1 Отзывы/комментарии | ✅ | отзывы с оценкой 1–10, комментарии с ответами и лайками; local-режим из коробки, общий — Supabase free (REST, схема в `supabase/schema.sql`) |
| 4.2 Профили | ✅ | списки статусов, история, имя для отзывов в настройках |
| 4.3 Админ-панель | ✅ | `/admin/login` (cookie-гейт): очередь модерации (тайтлы без источников), ошибки парсеров, статистика кэша |
| NF: XSS/безопасность | ✅ | React-экранирование текста, токены только в env, ADMIN-гейт |
| NF: SEO 5000+ | ✅ | sitemap на все тайтлы, ЧПУ, метатеги, OG-карточки |
| NF: отказоустойчивость | ✅ | при недоступности провайдеров — synth/guess/demo + уведомление в плеере |

Ограничение среды сборки: cgroup 1 ГБ — каталог переведён на runtime-чтение `lib/data/titles.json`
через `fs` (без упаковки 15 МБ JSON в webpack), для Vercel добавлен `outputFileTracingIncludes`.

## 15. Итерация 2.13: хотфиксы по ревью пользователя

1. **Кадры не открывались**: Shikimori отдаёт `screenshots[].original` относительными путями —
   нормализованы до `https://shikimori.io/…` (5965 URL в датасете + нормализация в enrich/expand).
2. **Мусор в описаниях**: Shikimori-описания содержат BBCode (`[character=723]Нами[/character]`),
   AniList — HTML (`<i>`): добавлена очистка BBCode+HTML+сущностей; пропатчено 7286 описаний
   в датасете, очистка встроена в enrich и expand на входе.
3. **«Вышла» у анонса 2027 года**: EpisodeGuide переписан по статусам: `upcoming` → строка премьеры
   «ожидается» (сезон/год), `ongoing` → вышедшие серии с точными датами МСК + следующая «ожидается»,
   `finished` → «вышла» + сезон; ложных «вышла» больше нет.
4. **Rich-бейдж**: рейтинг 0.0 у анонсов больше не рисуется (MetaBadges).
5. **Enrich ускорен в ~6 раз**: 5 воркеров (CONCURRENCY), rate-limit-пауза 120 мс, флаг
   `shikimoriChecked` — повторные прогоны не трогают проверенные тайтлы (прогон 4762 тайтлов за 8 c
   после первичного обогащения), запись каждые 40 и в конце, ETA в прогресс-баре.
6. Покрытие озвучками: тайтлы без shikimori-id не получают guess-источники — после полного enrich
   warm-покрытие растёт с 2752 к ~5000; оставшиеся без источников видны в админке и честно
   помечаются серой точкой в плеере.

## 16. Итерация 2.14: ручная модерация источников (ТЗ 4.3, финал)

1. **Ручные источники**: `lib/data/manual-sources.json` — модератор может добавить любой embed/файл
   конкретному тайтлу и серии; registry отдаёт их с приоритетом над кэшем и live-провайдерами,
   в плеере они показываются группой «Ручной источник». Формат:
   `{ "<slug>": { "<episode>": [ { "label": "Название озвучки", "embedUrl": "https://…" } ] } }`.
2. **Кураторский скрипт** `scripts/curate-titles.mjs`:
   `missing` — список тайтлов без источников из warm-summary; `remove <slug…>` — убрать тайтл из каталога.
3. Финальное состояние покрытия: **4998/5002** тайтлов с источниками; оставшиеся 4
   (Biaoren, NOBLESSE: Awakening, Yeosingangnim, Futabu!) — корейские/китайские тайтлы вне Shikimori
   и легаси-кэша: закрываются ручными источниками или удаляются куратором; hydrate в режиме gaps
   честно не подменяет их тест-потоками (ok:0, пустых:31 = 4 тайтла × их серии).

## 17. Итерация 3.1: выполнение и верификация handoff-ТЗ (Части A–E)

Итерация 3.0 («все улучшения сразу»: Faза 0–2 — тесты, капча/rate-limit, admin-cookie, даты серий,
image-proxy, модерация в UI, KV-кэш, Supabase Auth, i18n-lite, web-push, e2e, reco) задокументирована
в `docs/REPORT.md` §5.5. Итерация 3.1 закрывает пользовательский handoff-документ (Части A–E,
~40 задач) и документирует покрытие по каждой: **полная матрица — `docs/REPORT.md` §7**.

1. **Верификация админ-флоу на prod-сборке (10/10)**: login (неверный токен → 403, верный → 200 +
   httpOnly cookie), `/admin` без cookie → 307 на `/admin/login`, hide тайтла → страница 404,
   hide без cookie → 403, `/api/admin/tickets` → dmca:1 + reports:1, unhide → 200. Rate-limit:
   429 на 30-м запросе `/api/search`. Smoke 30/30, vitest 16/16, typecheck чисто.
2. **Найден и исправлен баг инвалидации кэша**: `lib/catalog.ts` — `mtimeNow()` возвращал сохранённый
   `CACHE.mtime` вместо свежего `statSync`, поэтому после записи `titles.json` (hide/unhide/manual)
   slug-карта не пересобиралась и `/anime/futabu` оставался 404 даже после unhide. Вторая половина
   бага: страница тайтла имеет `revalidate = 3600`, и Next кэшировал 404 — в `app/api/admin/hide/route.ts`
   добавлены `revalidatePath('/anime/'+slug)` и `revalidatePath('/', 'layout')`. Подтверждение:
   после `clean-titles fix` живой сервер отдал очищенное название без рестарта.
3. **Данные (A4.2/A4.3)**: новые скрипты `scripts/check-posters.mjs` (HEAD с GET-фолбэком,
   concurrency, результат в `.cache/broken-posters.json`) — прогон по всем **5002 постерам: 0 битых**;
   `scripts/clean-titles.mjs report/fix` (HTML-теги только в description, entity с `;`, двойные пробелы,
   мойибаке; легитимные `XY&Z`, `Migi&Dali`, `<DOGEZA>`, `<<Fruitmaster>>` детектор не трогает) —
   исправлено 18 полей, повторный скан: 0 артефактов.
4. **Инфраструктура**: создан `.env.example` — полная схема env (ADMIN_TOKEN, Kodik/bridge,
   SUPABASE_*, TURNSTILE_*, SENTRY, TG_*, VAPID_*, UPSTASH_*, Shikimori); ADMIN_TOKEN сгенерирован
   и проверен в боевом флоу. Решения A0 (VPS + systemd + Caddy с bearer-токеном) зафиксированы
   в `docs/DEPLOY.md`, юниты — в `deploy/`.
5. **Честные остатки** (см. матрицу): A0.1/A8.1 — live-проверка bridge и load-test возможны только
   на машине пользователя (Kodik отдаёт 401 с датацентр-IP); B6 — точные даты серий у 1647 тайтлов
   (остальные — сезонное расписание, дозаполнение `enrich-shikimori-resumable.mjs`); C5 — e2e-спеки
   написаны (3 сценария), прогон локальный (в песочнице нет браузеров); A5.2/A5.7/A6.4 — финальные
   проверки на реальных iPhone/Android; A1.5/A1.2 — заменить placeholder-домен `anistream.local`
   в `security.txt` и email в `app/privacy/page.tsx`. Полный чек-лист действий перед публикацией —
   в конце `docs/REPORT.md` §7.

## 18. Дорожная карта (реально будущее, с учётом сделанного в 3.0–3.2)

Уже реализовано и здесь больше не планируется: KV/Redis-кэш резолвов (3.0, `lib/providers/cache-kv.ts`),
web-push подписки на серии (3.0, VAPID + cron), аккаунты и синхронизация профиля через Supabase Auth
(3.0, `lib/sync.ts` — включается ключами пользователя), точные даты серий finished-тайтлов (3.2, B6).

1. **Парсер Aniboom/Anilibria**: портировать идеи AnimeParsers (Python) на TS или поднять
   Python-sidecar третьим bridge — закроет тайтлы, которых нет в Kodik/CVH.
2. **VoiceoverPicker** поверх `translations` из kodik-резолвера (как в Shikiplayer): выбор озвучки
   до резолва, а не только по факту найденных источников.
3. **EN-контент**: сейчас i18n-lite покрывает только chrome-словари; описания/жанры EN есть в данных
   AniList — нужен полноценный next-intl-слой и EN-роуты для SEO (hreflang уже готов).
4. **Свежие онгоинги в кэше**: cron-гидрация top-онгоингов (сейчас warm/hydrate запускаются вручную
   или GH Actions по расписанию; при live-слое не требуется).

## 19. Итерация 3.2: добивание по задачам приёмки (блоки 1–5, 23.09.2026)

1. **B6 — даты серий (переписан `fetch-episode-dates.mjs`)**. Найден корень 34%-покрытия: баг
   пагинации — фильтр `!t.epdates` уменьшал массив по ходу цикла, а `slice((page-1)*50,…)` продолжал
   расти → скрипт пропускал каждую вторую пачку. Новая версия: все finished (без лимита ≤60 серий),
   батчи 50 id, постраничный добор гигантов >250, `startDate` для фильмов/OVA без ТВ-расписания
   (помечено `epdatesSource:'startDate'`, неполные даты не fabric-уются), resume (запись каждые
   8 батчей + по SIGINT), `--report`. Итог: **4829/4843 finished = 99.7%** (цель 80%); без дат 14
   (7 гигантов типа Doraemon/Naruto Shippuuden — у AniList физически нет расписания + 7 редких
   movie/OVA без полной startDate). Отчёт: `.cache/episode-dates-report.json`.
2. **C5 — E2E до 5 сценариев и первый реальный прогон**. В песочницу поставлен chromium
   (`npx playwright install chromium` + `install-deps`), дописаны сценарии «каталог → тайтл →
   отзыв (локальный режим)» и «профиль → список → сохранение (Смотрю → /profile/list → убрать)».
   Fix: `waitUntil:'domcontentloaded'` — YouTube-трейлер на странице тайтла вешал событие `load`.
   Результат: **5/5 зелёные за 22 с** на prod-сборке. `e2e.yml`: триггеры push/PR/workflow_dispatch
   + артефакт трейсов при падении. Урок: renderer в песочнице (1 ГБ) крашится при нехватке памяти —
   e2e гонять без поднятых bridge.
3. **A8.1 — load-test bridge (впервые реально)**. Подняты оба bridge (`pip install requests` +
   AnimeParsers; compat-загрузчик py3.11 отработал). Первый прогон 100× `/resolve`: p50 19 с /
   p95 60 с / 8 таймаутов, а 60+ одновременных `/api/providers` роняли Next-сервер в OOM. Причины
   и fixes: (а) клиент loadtest парсил 20-МБ `titles.json` на каждый из 100 запросов — контекст
   строится один раз; (б) у `ThreadingHTTPServer` backlog=5 — бурст вставал в SYN-retry,
   поставлен `request_queue_size=128`; (в) GIL-трешинг 100 потоков — семафор активных хендлеров
   (`BRIDGE_MAX_HANDLERS=16`); (г) отсутствие single-flight — 100 клиентов делали 100 походов
   в апстрим, добавлен `_single_flight` (один лидер на ключ, остальные ждут результат) + негативный
   кэш ошибок 30 с + `BRIDGE_UPSTREAM_CONC=4`; (д) на стороне Next — in-flight dedupe в роуте
   `/api/providers/[slug]/[episode]`. После: warm 100× p95 **192 мс**, cold-бурст 100× p95
   **1.2 с** (1 поход в апстрим), CVH cold 100× p95 4.7 с (латентность animego), Next live 55×
   p95 **3.8 с**, ошибок 0; rate-limit middleware под нагрузкой отдал 429 лишним (работает).
4. **A0.1 — live-слой проверен фактом**. `npm run check:kodik` с датацентр-IP: статический
   `KODIK_TOKEN` и публичный токен → 401. НО bridge через авто-пул AnimeParsers резолвит **живые**
   источники с того же IP: Kodik — episode-specific `/seria/…` embed-ы («КОМНАТА ДИДИ», «OnWave»,
   0.6–0.8 с), CVH — `animego.me/cdn-iframe/…` («Dream Cast», «AniLibria», ~3.3 с). Вывод: вариант
   (a) жизнеспособен, 401 касается только пути kodikwrapper со статическим токеном. Найден и закрыт
   баг прод-схемы: `lib/providers/bridge.ts` не отправлял `Authorization: Bearer $BRIDGE_TOKEN` —
   за Caddy bridge был бы недоступен. DEPLOY.md §A0.1 переписан фактическими результатами.
5. **Переклассификация «зелёных» пунктов (блок 2)**: A3.1 → 🧩👤 (RLS/Turnstile включаются только
   после деплоя Supabase; до этого общие отзывы выключены кодом — POST 409, «открытого insert» нет);
   добавлен **Turnstile-виджет** в форму отзывов (без него `TURNSTILE_SECRET` ломал все POST —
   сервер ждал токен, которого не было в UI). A7.3 → 🧩 («до подключения TG алертов нет»),
   A7.1/A7.4 — пометки; C2 → 🧩; C4 → ⚠️🧩 (PWA работает, пуш без VAPID выключен). Часть E
   матрицы — колонка «Обеспечен?» без смешивания кода и факта.
6. **Документы (блок 3)**: REPORT §5 разделён на «цель»/«измерено»; §5.5 переименован в «Итоговое
   состояние после итерации 3.0» (зависимости — отдельной строкой); §6 переписан под текущее
   состояние (дистанция до готовности = действия пользователя, не код); §18 (эта глава) очищен от
   уже сделанного; README синхронизирован (Next 16.3.5, 5002 тайтла, кэш 3420 записей, команды,
   env-таблица = .env.example); LIMITS.md актуализирован (Upstash: KV-адаптер включается только
   с ключами, без них расход 0; добавлены строки AniList 90 req/мин и Kodik 401-факт).
7. **Мелочи (блок 5)**: `check-env.mjs` теперь читает `.env.local` (plain-node не получал его)
   и печатает 6 групп с подсказками (обязательные/Supabase+капча/мониторинг/push/KV/live);
   `anistream.local` убран из кода — security.txt → `example.com` + TODO-комментарии, privacy
   берёт домен из `NEXT_PUBLIC_SITE_URL` (фолбэк example.com), send-push default → example.com;
   `/admin?token=` в комментариях/доках → `/admin/login` (cookie); аудит mtime: чтения только в
   `lib/catalog.ts`, оба через свежий `statSync`; `.env.example` дополнен `BRIDGE_TOKEN`,
   `SUPABASE_SERVICE_KEY`, уточнён `NEXT_PUBLIC_IMG_PROXY`.
8. **Web-метрики (4.3)**: Lighthouse CLI в песочнице не работает (1 CPU/1 ГБ — tab crash на
   mobile-пресете, hang на desktop), поэтому создан `scripts/measure-web-vitals.mjs`
   (`npm run measure:vitals`) — LCP/CLS/FCP через CDP `PerformanceObserver` тем же Chromium,
   cold+warm, merge-режим для постраничных прогонов. Результаты (desktop 1280×800, LAN):
   LCP 0.4–1.1 с, CLS ≤0.095 (cold каталог) — цель ≤2.0/≤0.1 не превышена.
9. **Финальная верификация**: `tsc --noEmit` чисто, vitest **16/16**, smoke **30/30**,
   Playwright **5/5**. Бэкапы перед правкой данных: `backups/titles.pre-b6.*.json`,
   `backups/providers-cache.pre-b6.*.json`.

## 20. Итерация 3.3: история для iframe-источников + автосинхронизация (24.09.2026)

1. **Фолбэк истории для embed (задача 1)**: `components/player/PlayerShell.tsx` — новый
   `useEffect`: если выбранный источник `kind === 'embed'` (Kodik/CVH/AniBoom — из
   кросс-доменного iframe `currentTime` не читается), при заходе на серию один раз пишется
   `saveProgress({position: 0, duration: 0})`. **Guard от затирания**: если для (slug, episode)
   уже есть запись с `position > 0` и `updatedAt` моложе 24 ч — не трогаем (смотрели Demo →
   переключились на CVH → прогресс цел). Устаревшая (>24 ч) запись перезаписывается нулём.
   `embedLoggedRef` — ровно одна попытка на (slug, episode) за монтирование; нативному video
   не мешает (его 5-секундный интервал перезаписывает запись реальной позицией).
2. **AutoSync (задача 2)**: новый `components/system/AutoSync.tsx` (рендерит `null`, смонтирован
   в `app/layout.tsx` рядом с ClientMonitoring). Подписка на `useLibrary()`; при изменении
   history/lists и живой сессии (`getToken() && isSessionValid()`) — `pushLocal` с debounce 10 с.
   **Отклонение от буквального ТЗ (осознанное)**: добавлен `MAX_WAIT_MS = 30 с` — плеер пишет
   историю каждые 5 с, и «чистый» trailing-debounce во время просмотра не сработал бы НИКОГДА
   (каждый тик переносит таймер) → сценарий A приёмки провалился бы. Гибрид: одиночные изменения
   (списки) улетают через 10 с, непрерывные (просмотр) — не реже раза в 30 с. Факт: 4 POST
   в /rest/v1/ за минуту просмотра (2 пуша × lists+history) — в пределах «не больше 3–4».
   Первый рендер пропускается (`firstRender`), ошибки глушатся в `console.warn`, на
   `SessionExpiredError` — остановка до следующего входа (без попыток логина); анонимов
   не трогаем вообще (0 запросов к Supabase). Кнопки SyncSection остались как ручной fallback.
   `isSessionValid()` уже была в `lib/sync.ts` с итерации 3.2 — не дублировали.
3. **Верификация**: `tsc --noEmit` чисто, vitest 26/26, prod-сборка (mock-окружение
   Supabase :54400 + локальный mp4 через page.route — внешний gtv-bucket из песочницы 403),
   UI-приёмка **20/20**: T1.1–T1.4 (iframe-запись 0%, Demo ~30 с → 29.6 с, возврат на CVH и
   reload не сбрасывают, >24 ч перезаписывается), сценарии A–E (авто-пуш истории/списка без
   кнопок, ≤4 POST/мин, аноним — 0 запросов при живом localStorage, ручная кнопка + toast).
   Финальная пересборка с реальным `.env.local` + smoke.

## 21. Итерация 3.4: конфликт счётчиков реакций — триггер БД vs read-modify-write в API (24.09.2026)

1. **Проблема**: в прод-Supabase на `public.review_reactions` стоят триггеры
   (after insert/update/delete), пересчитывающие `public.reviews.likes/dislikes` как
   `count(*)` — это единственный источник правды для счётчиков. Но
   `app/api/social/reviews/[id]/react/route.ts` дополнительно писал в `reviews.likes/dislikes`
   сам по схеме read-modify-write (`likes = current + delta`). Поскольку чтение выполнялось
   ПОСЛЕ срабатывания триггера, API прибавляло delta поверх уже пересчитанного значения:
   один клик 👍 → +2 лайка при одной строке в `review_reactions`. Механизм воспроизведён
   на моке PostgREST с симуляцией триггеров: старая последовательность (мутация → чтение →
   +delta → PATCH reviews) даёт `likes=2`; новая (мутация → чтение → возврат) — `likes=1`.
2. **Правка** (единственный изменённый файл кода): из route.ts удалены `deltaLikes`/
   `deltaDislikes` со всеми присваиваниями в трёх ветках мутации, итоговый `PATCH reviews`
   и ветка `404 review not found`. Осталось: проверки `supabaseConfigured()`/`reviewId`/`kind`,
   rate-limit `react:{ip}` 30/мин, `getOrCreateUserId()`, чтение предыдущей реакции
   (`review_reactions?...&select=kind`), insert/delete/update в `review_reactions`, затем
   ОДИН SELECT `reviews?id=eq...&select=likes,dislikes` — значения, уже посчитанные
   триггером, возвращаются клиенту как есть (`likes: review?.likes ?? 0`,
   `myReaction: prev === kind ? null : kind`). Guard `!reviewRes.ok → 502` сохранён
   (единый стиль обработки ошибок supaFetch). Триггеры/схема БД, `ReviewsSection.tsx`,
   `POST /api/social/reviews`, `lib/userId.ts`, `lib/sync.ts`, `lib/library.ts`,
   `app/api/push/*` — не тронуты.
3. **Верификация**: `tsc --noEmit` чисто, vitest 26/26, prod-сборка. API-приёмка
   (Next :3100 + мок :54399 с триггерами) **17/17**: A — один клик → `likes=1` (не 2),
   1 строка; B — toggle off → 0/0 строк; C — снова 1; D — 👍→👎: likes=0, dislikes=1,
   1 строка kind=dislike; E — 10 кликов ×0.5 с (выделенный IP): 10×200, чётный финал
   likes=0/0 строк (+доп. 7 кликов → 1/1); F — создание отзыва: likes=0/dislikes=0, виден
   в списке; kind≠like/dislike → 400; регрессия GET myReaction. UI-приёмка (Playwright,
   /anime/one-piece): фаза 1 **13/13** (счётчик «👍 1» а не 2, is-active, персист и
   подсветка myReaction после reload, создание отзыва через капчу, 0 pageerror), фаза 2
   (E через UI) **4/4**: 9×200 + 1×429 — 10-й клик отбит middleware-лимитом 10 req/мин
   на /api/social/reviews (1 GET страницы + 10 POST с одного IP); финал likes=1/1 строка,
   UI синхронен с БД, чётность в рамках критерия «0 или 1». Финальная чистая пересборка
   с реальным `.env.local`, smoke — All routes OK.

## 22. Итерация 3.5: рейл «Продолжить просмотр» — дубли карточек по сериям (25.09.2026)

1. **Симптом**: на главной в рейле «Продолжить просмотр» одно аниме выводилось
   несколькими карточками — по одной на каждую просмотренную серию (Фрирен 1, 2, 3 →
   три карточки вместо одной).
2. **Причина**: `lib/library.ts` хранит историю по `(slug, episode)` — это правильно
   (прогресс каждой серии, синхронизация `profile_history` тоже по эпизодам). Но
   `ContinueWatchingRail.tsx` строил карточки из полного массива `history` без
   агрегации: дедупликация применялась только к слагам для `useTitles`
   (`[...new Set(...)]`), а `items = history.map(...).slice(0, 12)` рендерил каждую
   запись истории отдельной карточкой.
3. **Исправление** (только слой отображения, модель данных не менялась):
   - `components/anime/ContinueWatchingRail.tsx`: группировка по slug через `Map` —
     на каждый slug остаётся запись с максимальным `updatedAt` (`?? 0`), сортировка
     «свежие сначала», `slice(0, 12)` (прежний лимит рейла сохранён); рендер из
     `uniqueHistory`; `key={h.slug}` (теперь уникален). Карточке передаются
     `resumeEpisode` и `resumeHref=/anime/{slug}/{episode}` — клик открывает плеер
     последней просмотренной серии напрямую.
   - `components/anime/PosterCard.tsx`: два **опциональных** пропа — `resumeEpisode`
     (подпись «Продолжить с серии N», для одноэпизодных тайтлов «Продолжить
     просмотр») и `resumeHref` (переопределение ссылки, по умолчанию прежнее
     `/anime/{slug}`). Остальные 9 потребителей (ForYouRail, PosterGrid, каталог,
     жанр, главная, MyList, BookmarksList, страницы аниме) пропы не передают —
     рендер у них не изменился.
   - `app/globals.css`: класс `.card__resume` (подпись под `card__meta`, акцентный
     цвет) — единственное дополнение.
   - Не тронуты (по границам задачи): `lib/library.ts`, `lib/sync.ts`, схема
     Supabase/`profile_history`, `/profile/history`, `HistoryList.tsx`,
     `PlayerShell.tsx`, `AutoSync.tsx`, API-роуты, лимит карточек рейла (12).
4. **Верификация**: `tsc --noEmit` чисто; vitest 26/26; prod-сборка ~90 с;
   `SMOKE_URL=:3100 npm run smoke` — All routes OK. UI-приёмка (Playwright
   headless-shell, Next :3100, посев `anistream:history` из 5 НАМЕРЕННО
   перемешанных записей: Фрирен ep1/2/3 — самая свежая ep3 не первая в массиве,
   one-piece ep5, фильм koe-no-katachi) **12/12 PASS**: A — у Фрирен ровно одна
   карточка с подписью «Продолжить с серии 3» (всего в рейле 3 карточки по числу
   уникальных slug); B — прогресс-бар ≈25% = позиция 3-й серии (300/1200), а не
   1-й; порядок — самые свежие слева; фильм — «Продолжить просмотр»; C —
   `/profile/history` без изменений: 5 строк, Фрирен тремя отдельными строками
   (Серия 1, 2, 3); D — href карточки и клик ведут на
   `/anime/sousou-no-frieren/3`, плеер показывает «серия 3 из 28»; pageerror 0.
   Контроль старой логики (node): те же 5 записей → 5 карточек (3 дубля Фрирен
   ep2, ep1, ep3); новая логика → 3 карточки, Фрирен ep3.
