# AniNova 3.0 — целевая архитектура и ADR (B0 freeze)

**Дата:** 2026-11-20  
**Основание:** `docs/ANINOVA_3_AUDIT.md` (B0), Master Specification v1.0  
**Статус:** architecture freeze для B1–B7. Документ не разрешает менять production; он фиксирует решения, на которые должны ссылаться последующие PR.

**Обязательное продуктовое ограничение (подтверждено владельцем 2026-11-20):** все комиксы, манга, манхва, маньхуа, вебтуны и оригинальные графические произведения в AniNova — **только на русском языке**. Подробно — ADR-012; это условие допуска контента, а не только локализация интерфейса.

---

## 1. Принципы, которые не обсуждаются на каждом PR

1. **Preserve first.** Работающие anime-каталог, player, episode sync, providers, schedule, Supabase-данные и Redis-кэш не ломаются ради нового вида.
2. **DB as structured source of truth.** Целевое состояние: каталог и пользовательские данные живут в Postgres; большие массивы не хранятся в JSON-файлах и не коммитятся каждые 6 часов.
3. **Small batches.** Один логически завершённый пакет — один PR с regression-тестом.
4. **Evidence over claims.** «Работает» = воспроизводимая команда/тест/скриншот, а не успешная сборка.
5. **Legal by design.** Метаданные, обложки, главы, страницы и embed — разные права; неизвестное право = запрет hosted/embed.
6. **Russian-first for comics.** Русский язык обязателен для контента комиксов; не-RU главы не публикуются и не открываются в reader.
7. **Progressive enhancement.** Публичный каталог без входа; аккаунт только для персональных функций.
8. **Accessible by default.** WCAG 2.2 AA как цель; клавиатура, focus, контраст, reduced motion, touch-targets.
9. **No production surprises.** Агент не делает production deploy, не меняет production schema/data, env, DNS, billing, OAuth и store settings без явного разрешения владельца.

---

## 2. ADR-001 — Modular monolith Next.js + отдельный mobile-репозиторий

**Решение:** веб остаётся одним Next.js App Router приложением (modular monolith). Мобильное приложение — отдельный репозиторий `Artem6353/aninova-mobile` на Expo + React Native + Expo Router.

**Почему:**
- Текущий репозиторий уже содержит 41 страницу, 24 API route, 22 workflow и связан с production; monorepo-миграция не даёт измеримой выгоды на B1–B5.
- React DOM/Next UI нельзя переиспользовать как native UI; общими должны быть контракты, типы, валидация и дизайн-токены, а не компоненты.
- Отдельный репозиторий упрощает EAS Build/Submit, версии и review-процесс.

**Следствия:**
- Общие типы/схемы выносятся в пакет/контрактный репозиторий **после** стабилизации API (не в B1).
- Никакого копирования бизнес-логики по файлам; mobile ходит в те же API.
- Monorepo рассматривается только при появлении измеримой необходимости (общий CI, версии, публикация пакетов).

---

## 3. ADR-002 — Anime и Comics — разные домены

**Решение:** не смешивать anime и comics в одной таблице и не хранить главы/страницы в JSON. Минимальные домены:

```text
anime      → titles, episodes, episode_sources, episode_source_urls, airing_schedule
comics     → comic_works, comic_external_ids, comic_people/credits,
             comic_relations, comic_adaptations, comic_chapters,
             comic_reading_sources, comic_rights, comic_chapter_pages
identity   → auth.users, profiles, profile_settings/privacy
activity   → profile_lists, profile_history, user_comic_library, user_comic_progress,
             notifications, achievements
ops        → comic_sync_runs, source_reports, dmca_requests
```

**Ключи связи:**
- Внутри anime — `titles.anilist_id` (`int`, unique).
- Comics ↔ anime — `anime_anilist_id int` + `confidence`, `verification_status`, `evidence_url`. Если аниме нет в `titles`, FK не ставится; связь остаётся кандидатом `needs_review`.
- Comics ↔ comics — `comic_relations` с типом, направлением/симметричностью и `source_relation_type`.

**Почему:** разные жизненные циклы, права и источники; смешивание ломает поиск, RLS и импорт.

**Запрещено:** копировать всю anime-запись в comic-запись; хранить `chapters` как JSON-массив в `comic_works`; выдавать `work_type` только из страны/языка без источника.

**Языковое правило домена:** русский — обязательный язык публикации comics-контента. `original_language`/`country_of_origin` — справочные поля происхождения, а не разрешение показать не-RU главу. Подробно — ADR-012.

---

## 4. ADR-003 — Переходный источник истины каталога

**Текущее состояние (B0):**
- `lib/data/titles.json` — де-факто источник, коммитится `sync-catalog` каждые 6 часов.
- `public.titles` — зеркало (8033 строки), наполняется `sync-titles-db.yml` и импортёрами.
- Production health читает файл (`source=file`), хотя `configured=db`; причина — таймаут/несвоевременность прайма (F-02).

**Целевое состояние:**
- `public.titles` — источник истины для runtime и синков.
- `titles.json` — **генерируемый снапшот** для офлайн-скриптов, тестов, sitemap/билда и disaster recovery; не редактируется вручную.
- Автоматизация, меняющая tracked-файлы, открывает PR; данные пишутся в БД идемпотентным upsert.
- Прямой push в `main` запрещён branch protection; force-push в `main` запрещён всегда.

**Переход без big-bang:**
1. B0: PR-flow для tracked-файлов (ветка `fix/catalog-sync-pr-flow`), branch protection не отключается.
2. B2/B3: синки пишут в БД; JSON-снапшот генерируется из БД и публикуется PR-ом (или артефактом, если перестанет быть нужен в git).
3. После доказанного DB-runtime: убрать file-fallback из горячего пути, оставить аварийный read-only снапшот.
4. Удаление `titles.json` из git — отдельный PR с backup и restore drill.

**Почему не dual-write сразу:** два источника без чёткого владельца дают расхождения и ложные «успехи». Сначала один writer (БД), затем снапшот.

---

## 5. ADR-004 — Единый auth-контур

**Решение:**
- Web: Supabase Auth + `@supabase/ssr` cookie-сессия; server-side `getUser()` валидирует JWT; proxy обновляет cookies на защищённых путях.
- Mobile: Supabase Auth + PKCE + deep links/universal links; refresh/session — только `expo-secure-store`/Keychain/Keystore.
- Legacy REST-контур (`lib/sync.ts` + `AuthModal`) выводится из эксплуатации; токены не пишутся в `localStorage`.
- Один аккаунт = `auth.users.id`; профиль — `public.profiles` с RLS.

**Обязательные flows (B4):**
email signup → confirmation → sign in → resend → forgot (anti-enumeration) → reset → change email/password → Google OAuth → linking/unlinking → sessions → export → delete. Для каждого — security-тест (redirect allowlist, state/PKCE, ownership, no token in logs).

**Правила:**
- `service_role` только на сервере/в воркере; никогда в `NEXT_PUBLIC_*`, mobile bundle, логи.
- Автоматическое объединение аккаунтов по совпадению email запрещено; только подтверждённый linking flow.
- Sign in with Apple — проверить актуальные App Review Guidelines; добавить, если применимо к iOS-релизу.
- Logout очищает cookie, legacy-зеркала, in-memory cache; гостевую библиотеку не удаляет без согласия.

**План миграции legacy-auth (B0.5, выполнять в B4; не удалять старый контур до доказанной совместимости):**

| Фаза | Действие | Критерий выхода |
|---|---|---|
| 0. Инвентаризация | Найти все чтения/записи `anistream:supa_*`, `getToken`, `saveToken`, `applyAuthTokens`, `adoptLegacySessionIntoCookieStore`; зафиксировать экраны и API | Список потребителей с file:line, тест-план |
| 1. Совместимость | `getToken()` читает cookie-сессию SDK; legacy-ключи только читаются для миграции, не пишутся; `applyAuthTokens` → единый `setSession` через SDK | Старые сессии продолжают работать; новые токены не попадают в localStorage |
| 2. Web-контур | Единый `AuthProvider` на `@supabase/ssr`; `AuthModal` вызывает SDK; server `getUser()`; proxy обновляет cookies | Вход/выход/refresh работают в web и SSR; нет токенов в localStorage |
| 3. Полные flows | confirmation/resend, reset, change email/password, Google link/unlink, sessions list/revoke, export, delete | Security-тесты: redirect allowlist, PKCE/state, anti-enumeration, ownership, no token in logs |
| 4. Guest merge | Анонимные bookmarks/history/reviews получают `owner_key`; при входе — preview + merge по детерминированным ключам, конфликт → сохранить обе версии | Нет потери гостевых данных; merge идемпотентен; есть rollback |
| 5. Вывод legacy | Удалить `saveToken`/`saveTokens` и ключи; оставить one-time cleanup | 30 дней без роста ошибок; тесты зелёные; релиз notes |

**Инварианты:** `service_role` никогда не в браузере; JWT/refresh не в localStorage, не в URL, не в логах; logout чистит cookie + in-memory + legacy-ключи; удаление аккаунта не удаляет гостевые данные без согласия; linking только подтверждённый, без auto-merge по email.

**Rollback:** feature flag `AUTH_CONTOUR=legacy|cookie`; на время B4 оба контура читают один `auth.users.id`; откат — вернуть чтение legacy-ключей, не удаляя cookie-сессию. Удаление legacy — только после 30-дневного окна и backup.

---

## 6. ADR-005 — Права на контент: fail-closed

**Решение:** для каждого источника чтения хранить `provider_name`, `source_url`, `access_mode`, `rights_status`, `territories`, `language`, `attribution_text`, `terms_url`, `reviewed_at/by`, `expires_at`.

- `rights_status=unknown` по умолчанию.
- Reader показывает только `licensed_hosted` или `permitted_embed` с действующим `approved`.
- Истёк/отозванный статус → убрать встроенное чтение, оставить карточку и официальную ссылку (если разрешена).
- Запрещено: обход DRM, scraping закрытого reader, подмена referer/cookies, прокси защищённых сканов, хранение нелицензированных глав, выдача стороннего источника за официальный.
- MangaDex/AniList/Shikimori — только через adapter с `source_name`, `external_id`, `fetched_at`, `source_url`, `license/terms review status`, `confidence`, `attribution`.
- `comic_chapter_pages` — только при `rights_id`; bucket private; signed URLs; расчёт egress до выбора Storage/R2/S3.

**Язык как часть правового условия:** для comics `language` входит в проверку допуска. Источник с не-RU главами не становится доступен только потому, что `rights_status=approved`; нужна русскоязычная версия с подтверждёнными правами (ADR-012).

**Следствие для текущего anime-домена:** `episode_source_urls` сейчас anon-readable (F-06). В B3/B7 закрыть прямой anon-доступ и отдавать проекцию через API с rate limit; это не ломает player, если API сохраняет контракт.

**F-06 — план закрытия anon-доступа (B0.5; не применять до проверки зависимостей):**

Текущее состояние: `public.episode_source_urls` (350 074) и `public.episode_sources` (30 406) имеют `for select using (true)` (`supabase/migrations/20261012_episode_sources.sql:56,61`) и читаются анонимным ключом через PostgREST. Это утечка provider/URL-метаданных и обход API rate limit.

Зависимости (проверено):
- сервер: `lib/episode-sources.ts:20`, `lib/providers/cache-db.ts:23` — используют `SUPABASE_SERVICE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- API: `app/api/providers/[slug]/[episode]/route.ts` и `/api/availability/[slug]` читают через серверный слой;
- workflows/scripts: `hydrate.yml`, `db-size.yml`, `episode-coverage-weekly.yml`, `refresh-kodik-episode-cache.yml`, `sync-titles-db.yml`;
- клиентских компонентов, читающих эти таблицы напрямую, не найдено.

План:
1. Убрать anon-fallback в `lib/episode-sources.ts` и `lib/providers/cache-db.ts`: без `SUPABASE_SERVICE_KEY` — fail-closed с логом, а не тихое чтение anon-ключом.
2. Добавить staging-тест: anon `GET /rest/v1/episode_source_urls?select=*&limit=1` → `401/403` или 0 строк; service-role — читает; player API отдаёт тот же контракт.
3. Миграция (отдельный PR, после теста):
   ```sql
   drop policy if exists episode_sources_read on public.episode_sources;
   drop policy if exists episode_source_urls_read on public.episode_source_urls;
   revoke select on public.episode_sources, public.episode_source_urls from anon, authenticated;
   ```
   Write-политики `service_role` оставить; RLS не отключать.
4. Проверить все workflows/scripts на service key; если какой-то использует anon — перевести на service key в GitHub Secrets, не в клиент.
5. Rollback: вернуть read-политику и grant в одной миграции; player не зависит от anon-доступа.

**Не делать:** не удалять таблицы/строки, не отключать RLS, не выдавать service key в браузер, не закрывать доступ до staging-проверки.

---

## 7. ADR-006 — Дизайн Nova Minimal

**Решение:** B1 создаёт токены и компоненты Nova Minimal; текущий `theme-2026.css` — **не baseline**, а сохранённый WIP.

**Направление:**
- спокойный редакционный интерфейс, графит/сине-чёрный dark, мягкий light;
- 2–3 уровня surface, сдержанный фиолетовый accent, вторичный холодный голубой — редко;
- `Nova Pulse` — точечный акцент (новый эпизод/глава, подтверждённый анонс, прогресс), не свечение на каждой карточке;
- единые tokens: color, typography, spacing, radius, elevation, focus ring, breakpoints, motion;
- без чрезмерного blur/glassmorphism, хаотичных градиентов и декоративных анимаций;
- dark/light/system, `prefers-reduced-motion`, контраст и keyboard focus.

**Следствия:** WIP-тема сохраняется в `refs/backup/b0-wip-full-20261119` и `.cache/b0-wip-20261119/`; B1 делает отдельный diff и осознанно решает, что переносится. Не мержить WIP «как есть» до B1-ревью.

---

## 8. ADR-007 — API-контракты и версионирование

**Решение:**
- Существующие `/api/*` остаются рабочими (web + текущие клиенты).
- Новые контракты для mobile и Comics вводятся под `/api/v1/*` (additive), с документированной схемой, стабильными error-кодами и backward compatibility.
- Один серверный слой бизнес-правил/валидации; UI не ходит в AniList/MangaDex/Shikimori напрямую.
- Pagination: cursor/keyset для больших наборов; `limit` ограничен сервером; сортировка — allowlist; `total` только если дёшев.
- Card projection вместо полного Work в каждой карточке.
- CORS/rate limit/auth/idempotency — на API-слое; `service_role` не покидает сервер.
- Ошибки: `{ error: string, message?: string, requestId }`; не отдавать stack traces/секреты.

**Языковой контракт:** публичные comics-эндпоинты по умолчанию возвращают только русскоязычные, опубликованные и разрешённые записи; `language` — явное поле фильтра/проекции, а не скрытая эвристика.

**Почему `/api/v1` additive:** ломать существующие маршруты в B2 нельзя; mobile должен иметь стабильный контракт с первого дня.

---

## 9. ADR-008 — Поиск и каталог

**Решение:** начать с Postgres:
- индексы по `slug`, `work_type`, `publication_status`, `is_published`, `is_adult`, `updated_at`;
- GIN по `genres`, если массивы реально используются для фильтров;
- trigram/tsvector по названиям и alternative titles после выбора единой модели;
- server-side query + EXPLAIN/ANALYZE на реальном объёме;
- Redis — только короткоживущий кэш горячих запросов после измерений.

**Запрещено:** позволять клиенту задавать произвольные SQL order fields; подключать внешний поисковый продукт без доказанного предела Postgres; отдавать весь объект Work в каждую карточку.

**Русский поиск:** `title_ru` и русские alternative titles индексируются в первую очередь; поиск по оригинальному названию — дополнительный, не заменяет RU-результат.

---

## 10. ADR-009 — Автоматизация и PR-policy

**Решение:**
- Данные — идемпотентный upsert в целевую БД с checkpoint/resume и отчётом.
- Tracked-файлы — только через PR; branch protection не отключается; force-push в `main` запрещён.
- Каждый workflow: минимальные `permissions`, `concurrency`, deadline, retry/backoff с jitter на 429/5xx, dry-run и canary, отчёт processed/inserted/updated/skipped/failed.
- Секреты не пишутся в `echo`, артефакты и debug logs.
- Production deploy — approval-gated; агент не меняет Vercel env/Supabase schema/DNS/billing/store settings.

**B0-фикс:** `fix/catalog-sync-pr-flow` — публикация каталога в bot-ветку и rolling PR, без direct push в `main`.

**Целевые workflow B3:** `comics-metadata-sync`, `comics-relations-discovery`, `comics-adaptations-monitor`, `comics-chapters-sync`, `comics-quality-check`; имена адаптируются к текущему стилю, ответственность разделяется.

**Языковой gate в импорте:** каждый comics-workflow обязан считать `ru_ready`/`needs_translation` и не публиковать не-RU главы; отчёт содержит число пропущенных по языку.

---

## 11. ADR-010 — Наблюдаемость и readiness

**Решение:**
- Структурные логи с `requestId`/`jobId`; без секретов, OAuth-кодов, токенов, приватного контента и сырых лицензированных payload-ов.
- `/api/health` различает liveness, readiness, источник каталога, DB connectivity, зависимости; `ok:true` недостаточно, если каталог в fallback.
- Метрики: API latency/error, DB latency, cache hit rate, sync lag, failed imports, reader load failures, auth conversion, app crashes.
- Алерты: stale sync, повторные provider failures, catalog mismatch, auth callback failures, RLS regression, high 5xx, quota exhaustion.
- B0-находка F-02: добавить причину прайма (`completed|timeout|http_error|min_rows`), `elapsedMs`, `rows`; не менять поведение до измерения.
- Comics-метрики дополнительно: `ru_coverage`, `translation_pending`, `rights_rejected`, `reader_language_blocks`.

---

## 12. ADR-011 — Тестирование и Definition of Done

**После каждого PR:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run smoke`;
- применимые Playwright/RLS/catalog quality/db-size;
- для UI — screenshots mobile/tablet/desktop;
- для player/reader — доказанный playback/render на разрешённом fixture, не только API 200;
- для auth — redirect cases, ownership A/B, no token in localStorage/logs;
- для comics — тест «не-RU глава не открывается и не публикуется».

**Exit criteria этапа:**
- все связанные тесты зелёные или исключения документированы;
- миграция проверена на staging/локальном Supabase, есть rollback/backup;
- нет утечек секретов и незакрытых critical/high в изменённой области;
- ключевой сценарий продемонстрирован end-to-end;
- PR содержит summary, evidence, known limitations.

---

## 13. ADR-012 — Русский язык как обязательное условие comics-контента

**Статус:** принято владельцем 2026-11-20.  
**Решение:** в AniNova допускаются к публикации и чтению только комиксы/манга/манхва/маньхуа/вебтуны/графические романы **на русском языке**. Это относится к главам/страницам, которые видит пользователь, и к reader-доступу; не только к языку интерфейса.

### 13.1. Что именно считается «на русском»

- Текст глав/страниц — русский, с подтверждённым правом на публикацию/embed.
- Название, описание, жанры, статус, предупреждения, UI-тексты — русские.
- Оригинальное название, `title_en`, `title_romaji`, авторские имена и издательские данные могут храниться как справочные поля **только для сопоставления ID/источников** и не заменяют русское название в публичном UI. Показывать их публично можно только как вторичную подпись, если русское название уже есть; публикация без русского названия запрещена.
- Оригинальное произведение, созданное не на русском, допускается к reader только после русскоязычной локализации с подтверждёнными правами. До этого — карточка без кнопки чтения.

### 13.2. Поля данных

Обязательные/рекомендуемые поля:

```text
comic_works.title_ru              text not null   -- обязательное русское название
comic_works.description_ru        text            -- русское описание
comic_works.original_language     text            -- справочно, BCP-47
comic_works.available_languages   text[]          -- какие языки реально есть у источника
comic_works.ru_ready              boolean         -- есть русский контент, разрешённый к reader
comic_works.translation_status    text            -- none | pending | in_progress | ready | rejected

comic_chapters.language           text not null   -- 'ru' обязательно для reader
comic_chapters.translation_status text
comic_reading_sources.language    text not null
comic_rights.language             text            -- язык лицензии/разрешения
```

`language` — BCP-47 (`ru`, `en`, `ja`, `ko`, `zh-Hans`…); для reader допускается только `ru` (при необходимости — `ru-*` с явным правилом).

### 13.3. Правила допуска (fail-closed)

1. `is_published=true` **и** `ru_ready=true` **и** есть `comic_chapters.language='ru'` **и** `rights_status='approved'` **и** `access_mode` разрешён.
2. Нет русского источника/перевода → `ru_ready=false`, карточка показывается, кнопка чтения отсутствует, отображается «Где читать официально» только если ссылка разрешена.
3. Не-RU глава может храниться как metadata/provenance, но **не** отдаётся reader-API и не индексируется. Автоматический fallback на `en`/`ja`/`ko`/`zh` запрещён: отсутствие RU-главы — это отказ в доступе, а не переключение языка.
4. Автоперевод/машинный перевод без прав и редактуры не считается русскоязычной публикацией и не открывается.
5. При отзыве прав или истечении срока русскоязычный доступ скрывается, даже если глава осталась в БД.
6. Публикация fail-closed: если язык главы неизвестен, пуст или не `ru`, глава не попадает в reader-выборку и не считается `ru_ready`.

### 13.4. Импорт и quality gate

- Адаптеры AniList/Shikimori/MangaDex/издателей нормализуют язык и возвращают `language`, `translation_status`, `source_url`, `rights`.
- Импортёр не создаёт `comic_chapters` для reader, пока нет RU-подтверждения; такие записи идут в `needs_translation`/`needs_review`.
- `comics-quality-check` считает:
  - долю works с `ru_ready=true`;
  - число `needs_translation`;
  - число не-RU chapters, ошибочно попавших в reader-выборку (должно быть 0);
  - число works без русского названия/описания.
- CI/PR gate: публикация comics невозможна, если quality gate нашёл не-RU reader-контент.

### 13.5. UI/UX

- В каталоге comics — бейдж «RU»/язык, если он неочевиден; не показывать не-RU как доступное к чтению.
- В карточке — «Русское издание: доступно / готовится / нет».
- В reader — выбор языка отсутствует, пока продукт явно не поддерживает мультиязычность; по умолчанию — русский.
- Ошибки: «Русскоязычная версия пока недоступна» вместо пустого экрана/битой кнопки.

### 13.6. Правовые последствия

- Русскоязычный перевод — отдельный объект прав; нельзя считать лицензию на оригинал разрешением на перевод/публикацию RU-версии.
- Fan-translation без разрешения не допускается в hosted/embed.
- Если русское издание доступно только на внешней официальной платформе — используем `external_link`, без проксирования страниц.

### 13.7. Финальное решение (утверждено 2026-11-20, без повторного согласования)

1. **Публичное произведение Comics обязано иметь русское название и проверенные русские метаданные.** `title_ru` — NOT NULL для публикации; `description_ru` — обязательное для publish-гейта. Оригинальные названия хранятся только для сопоставления ID и не являются публичным названием.
2. **Reader показывает только главы `language='ru'`.** Это правило уровня API и RLS, а не только UI. Не-RU главы не отдаются reader-эндпоинтом даже при прямом запросе.
3. **Fallback на en/ja/ko/zh запрещён.** Нет RU-главы → нет чтения; показываем «Русскоязычная версия пока недоступна» и, если разрешено, официальную ссылку.
4. **Публикация fail-closed.** Неизвестный/пустой язык, `translation_status != ready`, `ru_ready != true` или отсутствие `rights_status='approved'` блокируют публикацию и reader-доступ.
5. **RU-локализация ≠ права.** Русский перевод — отдельный объект прав; лицензия на оригинал не даёт права на перевод/публикацию RU-версии. Fan-translation без разрешения не допускается.
6. **Проверяемость.** B3 acceptance: 0 не-RU глав в reader-выборке; 0 публичных works без `title_ru`; quality gate падает при нарушении; RLS/API-тест подтверждает отказ на не-RU главу.

До выполнения этих условий B3 не создаёт публичные comics-таблицы и не включает reader.

---

## 14. Целевые слои

```text
Clients
  Web (Next.js RSC)  |  PWA (installable web)  |  Mobile (Expo/RN)  |  TV (later)
        │                     │                        │
        └─────────────── API / server-side rules ─────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
        Supabase Postgres/Auth/Storage   Workers (GitHub Actions)
                 │                         │
        Redis/Upstash (hot cache)     External adapters
                                       AniList / Shikimori / MangaDex /
                                       official publishers / partners
```

**Правила слоёв:**
- UI не знает внешние API; только нормализованный backend-контракт.
- Server Components по умолчанию; Client Components — только интерактивность.
- Mobile не импортирует web-компоненты; общие — контракты/токены.
- Внешние адаптеры не пишут в БД напрямую из UI; только server/worker.

---

## 15. Целевая модель Comics (для B3)

Имена и поля — из Master Specification §7; отличия/решения:

| Таблица | Решение |
|---|---|
| `comic_works` | `id uuid`, `slug unique`, `work_type`, `title_ru` (обязательно), оригинальные названия справочно, `description_ru`, `country_of_origin`, `original_language`, `publication_status`, `cover_url`, `banner_url`, `genres`, `content_rating`, `is_adult`, `is_published`, `ru_ready`, `translation_status`, `metadata_source/confidence`, `last_synced_at` |
| `comic_external_ids` | unique `(source, external_id, external_type)`; хранить `source_url`, `fetched_at`, `language` при наличии |
| `comic_people` / `comic_credits` | alias-модель для транслитераций; не дублировать автора из-за написания |
| `comic_relations` | CHECK на непустую цель; `verification_status` (`auto_candidate/needs_review/verified/rejected`); `source_relation_type` + нормализованный тип |
| `comic_adaptations` | `status` (`rumored/announced/in_production/released/cancelled`); для confirmed — обязательный `official_source_url`; rumours не попадают в confirmed feed |
| `comic_chapters` | `chapter_number`/`volume_number` — `numeric` или text (дробные/спецглавы); `language` (reader — только `ru`); `rights_status`; `translation_status`; не считать главу доступной только из-за metadata row |
| `comic_reading_sources` | провайдер/URL/access_mode/embed_allowed/status/`language`/territories |
| `comic_rights` | rights_holder/type/status/evidence/terms/territories/`language`/valid_from/until/approved_by/at/attribution |
| `comic_chapter_pages` | только при `rights_id` и русскоязычной главе; Storage private; width/height/format/checksum |
| `user_comic_library` | unique `(user_id, comic_id)`, статусы чтения, `is_favorite` |
| `user_comic_progress` | unique `(user_id, comic_id, chapter_id)`, `page_index`, `scroll_progress`, `completed_at` |
| `comic_sync_runs` | job/status/counts/checkpoint/error summary; без секретов и полных payload-ов; счётчики `ru_ready`/`needs_translation` |

**RLS-матрица:**
- `anon`: SELECT только `is_published=true` + `ru_ready=true`, `is_adult` по политике, подтверждённые adaptations и разрешённые metadata; никаких pages/private rights.
- `authenticated`: публичное чтение + только свои library/progress/preferences.
- `service_role`: импорт/модерация/защищённые обновления, только server/worker.
- admin/moderator: через проверенную роль, не через редактируемый `user_metadata`.
- Для user-owned: `USING (auth.uid() = user_id)` + `WITH CHECK` на UPDATE; SELECT policy для UPDATE; не полагаться только на `TO authenticated`.
- `SECURITY DEFINER` — только с отдельным threat review и закреплённым `search_path`.

---

## 16. Последовательность этапов и границы

| Этап | Что входит | Что не входит |
|---|---|---|
| B0 | аудит, карта, backup, ADR, blocking fix | redesign, новые таблицы, auth-переписывание |
| B1 | tokens/components/theme showcase/прототипы | миграция всех страниц |
| B2 | shell/nav/home, anime catalog/detail/schedule, player, auth/profile, search/settings, comics skeleton без fake data | полный comics backend |
| B3 | comics schema/RLS/adapters/import/relations/adaptations/search/admin + RU language gate | mobile |
| B4 | единый auth/profile/privacy/merge/sync | mobile |
| B5 | Expo app, deep links, secure session, player/reader, push | TV |
| B6 | tablet UX, TV feasibility | TV production |
| B7 | hardening, security/rights/perf/a11y, backup drill, release | — |

**Freeze-правила до соответствующего этапа:**
- не менять provider behavior без regression E2E;
- не добавлять блокирующие холодные запросы в SSR;
- не создавать `comic_*` таблицы до B3 (кроме утверждённых миграций);
- не менять auth-контур до B4 без отдельного security-PR;
- не мержить WIP-тему до B1-ревью;
- не отключать branch protection и не делать direct/force push в `main`;
- не публиковать не-RU comics-контент ни в каком виде.

---

## 17. Риски архитектуры и их контроль

| Риск | Контроль |
|---|---|
| Расхождение JSON и БД | один writer (БД), generated snapshot, health-сигнал, quality gate |
| Потеря гостевых данных | merge-контракт, backup, rollback, A/B-тесты |
| Утечка прав/контента | fail-closed rights, RLS, signed URLs, review queue |
| Не-RU контент попал в reader | language gate в адаптере, БД, API, RLS и quality check |
| Дубликаты произведений | external IDs, aliases, dedupe queue, без fuzzy auto-merge |
| Тяжёлый UI | RSC, lazy loading, budgets, virtualized reader |
| Сложный auth web/mobile | PKCE, deep links, secure storage, identity-linking tests |
| Automation ломает main | PR-only, least privilege, dry-run, checkpoint, no force |
| Переусложнение | modular monolith first; split only with evidence |

---

## 18. Что этот документ НЕ разрешает

- Создавать production-таблицы/политики без миграции, backup и rollback.
- Менять Vercel env, Supabase production schema/data, DNS, billing, OAuth providers, store settings.
- Удалять таблицы/кэши/storage objects.
- Делать `git push` в `main` или force-push в shared-ветки.
- Публиковать comics-контент не на русском языке.
- Объявлять B0/B1/… завершённым без evidence из §12.
