# B3-A — канонический контракт данных Comics

Статус контракта: **DONE**. Реализация в SQL: **DONE** (PGlite). Supabase/PostgREST/production: **NOT TESTED**.

Документ описывает source-independent модель, которая лежит в основе
`20261123_comics_foundation.sql` и `20261123_comics_rls.sql`. Он не является
разрешением на импорт, публикацию, reader, embed или Storage-страницы.

## 1. Принципы

1. **Источник не является моделью.** AniList, MAL, Shikimori, издатель и ручная
   редакция — это provenance, а не отдельные копии работы.
2. **Русское публичное название отдельно от всех остальных.** Original/native/
   romaji/transliteration/search alias никогда не подставляются как русское
   публичное название.
3. **Права отдельно от метаданных и отдельно от глав.** Пять независимых
   permissions: `metadata`, `cover`, `chapter_link`, `embed`, `hosting`.
4. **Доступность API ≠ разрешение.** Наличие ссылки/API/лицензионного названия
   не создаёт approved-право.
5. **Нет выдуманных сущностей.** Нет авторов, издателей, лицензий, глав, страниц,
   rightsholders или «популярности», которых нет в проверяемом источнике.
6. **Additive only.** Существующие `titles`, `episodes`, social-таблицы и их
   политики не переименовываются и не удаляются.
7. **Public surface — только views.** Базовые таблицы Comics не имеют grants
   для `anon`/`authenticated`.

## 2. Именование и типы

- Префикс канонических таблиц: `comic_`.
- Пользовательские B4-таблицы: `user_comic_library`, `user_comic_progress`.
- Первичный ключ работ — `uuid` (`gen_random_uuid()`), а не AniList/MAL id.
- Внешние id — только в `comic_external_ids`; они не являются PK.
- Все timestamps — `timestamptz` в UTC. Даты публикации — `date` + precision.
- Confidence — `numeric(3,2)` в диапазоне `0..1`; `NULL` = неизвестно.
- Перечисления — `text` + `CHECK`, без PostgreSQL enum (проще additive-миграции).

## 3. Таблицы

### 3.1 `comic_works` — каноническая работа

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` | Внутренний id |
| `internal_key` | text | NOT NULL, unique | Стабильный ключ вида `comic:anilist:30011` |
| `slug` | text | NOT NULL, unique | Публичный URL-slug, lower/kebab |
| `title_ru` | text | NULL | Русское публичное название |
| `title_ru_status` | text | NOT NULL, `unverified` | `unverified/candidate/source_verified/editorially_verified/name_mismatch/no_ru_title/rejected` |
| `kind` | text | NOT NULL, `manga` | `manga/manhwa/manhua/webtoon/comic/one_shot` |
| `country_code` | char(2) | NULL | ISO-подобный `JP/KR/CN` |
| `publication_year` | int | NULL | 1900–2100 |
| `release_date` | date | NULL | Дата начала |
| `release_date_precision` | text | NOT NULL, `unknown` | `day/month/year/unknown` |
| `publishing_status` | text | NOT NULL, `unknown` | `ongoing/completed/hiatus/cancelled/unknown` |
| `description_ru` | text | NULL | Русское описание ≤ 8000 |
| `cover_url` | text | NULL | HTTPS-обложка |
| `total_chapters_known` | int | NULL | Только если известно; не заглушка |
| `volumes_known` | int | NULL | Только если известно |
| `genres` | text[] | NOT NULL, `{}` | ≤ 32 |
| `is_adult` | boolean | NOT NULL, false | Adult-флаг; public view исключает |
| `publication_status` | text | NOT NULL, `draft` | `draft/pending_verification/approved/rejected/expired` |
| `published_at` | timestamptz | NULL | Только при `approved`; public view требует `<= now()` |
| `origin_source_name` | text | NOT NULL, `aninova` | `anilist/mal/shikimori/manual/...` |
| `origin_source_url` | text | NULL | HTTPS provenance |
| `origin_fetched_at` | timestamptz | NOT NULL, now | Когда получено |
| `metadata_checked_at` | timestamptz | NULL | Когда проверено |
| `metadata_confidence` | numeric(3,2) | NULL | 0..1 |
| `search_ru` | tsvector | generated stored | Russian FTS по `title_ru` + `description_ru` |
| `created_at/updated_at` | timestamptz | NOT NULL, now | `updated_at` — trigger |

Правила:

- `title_ru_status in ('source_verified','editorially_verified')` требует
  непустой `title_ru` и хотя бы одну кириллическую букву.
- `published_at` может быть заполнен только при `publication_status='approved'`.
- `release_date` и precision согласованы: нет даты — `unknown`; есть дата —
  `day/month/year`.
- `internal_key` неизменяем; `slug` считается стабильным (renaming — отдельная
  редакционная операция с редиректом, не автоматическая).

### 3.2 `comic_external_ids` — внешние идентификаторы

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `work_id` | uuid | NOT NULL, FK → works, cascade | Работа |
| `source_name` | text | NOT NULL | `anilist/mal/shikimori/...` |
| `external_id` | text | NOT NULL | id в источнике, не URL |
| `source_url` | text | NULL | HTTPS |
| `is_primary` | boolean | NOT NULL, false | Один primary на работу |
| `fetched_at` | timestamptz | NOT NULL, now | |
| `last_verified_at` | timestamptz | NULL | ≥ `fetched_at` |
| `verification_status` | text | NOT NULL, `recorded` | `recorded/source_verified/disputed/rejected` |
| `confidence` | numeric(3,2) | NULL | 0..1 |
| `source_payload_hash` | text | NULL | SHA-256 hex; не raw payload |
| `created_at/updated_at` | timestamptz | NOT NULL | |

Уникальность:

- `(source_name, external_id)` — один id принадлежит одной работе.
- `(work_id, source_name)` — одна работа имеет один id данного источника.
- partial unique `(work_id) where is_primary` — один primary.

Конфликт (например, duplicate MAL) не разрешается перезаписью: создаётся
`comic_review_queue` с `duplicate_external_id`/`ambiguous_external_id`.

### 3.3 `comic_aliases` — все названия и поисковые алиасы

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `work_id` | uuid | NOT NULL, FK cascade | |
| `alias` | text | NOT NULL, 1..300 | Исходное название |
| `alias_type` | text | NOT NULL | см. ниже |
| `language` | text | NOT NULL, `und` | `ru/ja/en/...` |
| `is_public` | boolean | NOT NULL, false | Разрешение на публичный alias |
| `source_name` | text | NOT NULL | |
| `source_url` | text | NULL | HTTPS |
| `fetched_at` | timestamptz | NOT NULL | |
| `checked_at` | timestamptz | NULL | ≥ fetched |
| `confidence` | numeric(3,2) | NULL | |
| `verification_status` | text | NOT NULL, `candidate` | `candidate/source_verified/editorially_verified/conflict/rejected` |
| `normalized_alias` | text | generated | lower + trim + collapse spaces |
| `created_at/updated_at` | timestamptz | NOT NULL | |

Типы alias:

- `alternative_title` — альтернативное название.
- `transliteration` — транслитерация/ромадзи.
- `official_russian` — официальное русское название.
- `search_alias` — внутренний поисковый алиас.
- `original_title` — оригинальное название (не публичный fallback).
- `native_title` — native script (не публичный fallback).

Уникальность: `(work_id, source_name, alias_type, normalized_alias)`.
Поиск: GIN `to_tsvector('simple', normalized_alias)` + btree `normalized_alias`.

### 3.4 `comic_people` — люди/авторы

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `canonical_name` | text | NOT NULL | Исходное имя |
| `normalized_name` | text | generated | lower/trim |
| `display_name_ru` | text | NULL | Русское отображаемое имя |
| `name_status` | text | NOT NULL, `unverified` | `unverified/source_verified/editorially_verified/rejected` |
| `source_name` | text | NOT NULL | |
| `source_person_id` | text | NULL | id в источнике |
| `source_url` | text | NULL | HTTPS |
| `fetched_at` | timestamptz | NOT NULL | |
| `checked_at` | timestamptz | NULL | |
| `confidence` | numeric(3,2) | NULL | |
| `verification_status` | text | NOT NULL, `recorded` | `recorded/source_verified/editorially_verified/disputed/rejected` |
| `is_public` | boolean | NOT NULL, false | |
| `created_at/updated_at` | timestamptz | NOT NULL | |

`display_name_ru`, если задан, содержит кириллицу. Один source person id — один
человек в рамках источника. Люди не создаются «по шаблону».

### 3.5 `comic_credits` — роли авторов

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `work_id` | uuid | NOT NULL, FK cascade | |
| `person_id` | uuid | NOT NULL, FK people cascade | |
| `role` | text | NOT NULL | `author/writer/artist/illustrator/editor/original_creator/other` |
| `billing_order` | int | NOT NULL, 0, ≥0 | |
| `source_name` | text | NOT NULL | |
| `source_url` | text | NULL | |
| `fetched_at` | timestamptz | NOT NULL | |
| `checked_at` | timestamptz | NULL | |
| `confidence` | numeric(3,2) | NULL | |
| `verification_status` | text | NOT NULL, `recorded` | |
| `is_public` | boolean | NOT NULL, false | |
| `created_at/updated_at` | timestamptz | NOT NULL | |

Уникальность: `(work_id, person_id, role, source_name)`.

### 3.6 `comic_relations` — связи комикс↔комикс

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `from_work_id` | uuid | NOT NULL, FK cascade | |
| `to_work_id` | uuid | NOT NULL, FK cascade | |
| `relation_type` | text | NOT NULL | 7 нормализованных типов |
| `source_relation_type` | text | NOT NULL | Сырой тип источника, 1..64 |
| `source_name` | text | NOT NULL | |
| `source_url` | text | NULL | |
| `observed_at` | timestamptz | NOT NULL, now | |
| `checked_at` | timestamptz | NULL | |
| `confidence` | numeric(3,2) | NULL | |
| `verification_status` | text | NOT NULL, `recorded` | |
| `is_public` | boolean | NOT NULL, false | |
| `created_at/updated_at` | timestamptz | NOT NULL | |

Нормализованные типы: `ADAPTED_FROM`, `SEQUEL`, `PREQUEL`, `SPIN_OFF`,
`ALTERNATIVE`, `SAME_FRANCHISE`, `RELATED`.

Правила:

- `from_work_id <> to_work_id`.
- Для симметричных `ALTERNATIVE/SAME_FRANCHISE/RELATED` требуется
  `from_work_id < to_work_id`.
- `source_relation_type` сохраняется отдельно и никогда не подменяется
  нормализованным значением.
- `SIDE_STORY`, `PARENT`, `CHARACTER`, `OTHER`, `ADAPTATION` не превращаются
  молча в «подтверждённую адаптацию».
- Уникальность: `(from_work_id, to_work_id, relation_type, source_name)`.

### 3.7 `comic_adaptations` — Anime ↔ Comics

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `anime_id` | int | NOT NULL, FK `titles(id)` cascade | AniList id аниме |
| `comic_work_id` | uuid | NOT NULL, FK cascade | |
| `raw_relation_type` | text | NOT NULL, `ADAPTATION` | Сырой тип |
| `direction` | text | NOT NULL, `unknown` | `comic_is_source/anime_is_source/unknown` |
| `confidence_level` | text | NOT NULL, `unknown` | `confirmed/inferred/unknown` |
| `basis` | text | NOT NULL, `unknown` | Почему так решено |
| `is_primary` | boolean | NOT NULL, false | Один primary на аниме |
| `source_name` | text | NOT NULL | |
| `source_url` | text | NULL | |
| `observed_at` | timestamptz | NOT NULL, now | |
| `checked_at` | timestamptz | NULL | |
| `verification_status` | text | NOT NULL, `recorded` | |
| `is_public` | boolean | NOT NULL, false | |
| `created_at/updated_at` | timestamptz | NOT NULL | |

Правила:

- `unique (anime_id, comic_work_id)`.
- partial unique `(anime_id) where is_primary`.
- `is_primary` разрешён только при `confidence_level='confirmed'`.
- `confirmed` требует `basis <> 'unknown'`.
- Сырой `ADAPTATION` сам по себе не делает связь confirmed.

### 3.8 `comic_reading_sources` — источник чтения

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `work_id` | uuid | NOT NULL, FK cascade | |
| `source_name` | text | NOT NULL, 1..120 | Человекочитаемое имя/attribution |
| `reading_mode` | text | NOT NULL | `external_link/permitted_embed/licensed_hosted` |
| `language` | text | NOT NULL, `ru` | |
| `source_url` | text | NULL | HTTPS; work-level landing/metadata, **не** URL главы |
| `embed_url` | text | NULL | HTTPS; work-level landing/metadata, **не** URL главы |
| `attribution_text` | text | NULL | Требуемая атрибуция |
| `terms_url` | text | NULL | HTTPS; обязателен при approved |
| `terms_review_status` | text | NOT NULL, `unknown` | `unknown/pending_review/approved/rejected/expired` |
| `terms_checked_at` | timestamptz | NULL | Обязателен при approved |
| `terms_reviewed_by` | text | NULL | Именованный reviewer; обязателен при approved (B3-B) |
| `is_active` | boolean | NOT NULL, false | По умолчанию выключен |
| `notes_internal` | text | NULL | ≤4000; без секретов |
| `created_at/updated_at` | timestamptz | NOT NULL | |

Уникальность: `(work_id, source_name, reading_mode, language)` +
`(work_id, id)` для composite FK.

С B3-B work-level `source_url`/`embed_url` не обязательны: destination главы
хранится в `comic_chapters.source_url`/`embed_url`. Approved terms требуют
`terms_url`, `terms_checked_at` и непустой `terms_reviewed_by`.

### 3.9 `comic_rights` — пять независимых прав

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `work_id` | uuid | NOT NULL, FK cascade | |
| `reading_source_id` | uuid | NULL, composite FK | Обязателен для chapter_link/embed/hosting |
| `permission` | text | NOT NULL | `metadata/cover/chapter_link/embed/hosting` |
| `status` | text | NOT NULL, `unknown` | `unknown/pending_review/approved/rejected/expired` |
| `valid_from` | date | NULL | |
| `valid_until` | date | NULL | |
| `evidence_ref` | text | NULL | Ссылка/идентификатор доказательства, ≤500; не секрет |
| `reviewed_by` | text | NULL | Кто проверил |
| `reviewed_at` | timestamptz | NULL | Когда |
| `notes_internal` | text | NULL | ≤4000 |
| `created_at/updated_at` | timestamptz | NOT NULL | |

Правила:

- `metadata`/`cover` — work-level (`reading_source_id IS NULL`).
- `chapter_link`/`embed`/`hosting` — source-level (`reading_source_id NOT NULL`).
- `approved` требует `reviewed_by`, `reviewed_at` и непустой `evidence_ref`
  (B3-B); `rejected` требует reviewer/time, evidence не обязателен.
- `expired` требует `valid_until`.
- Public views защитно повторяют проверку evidence/reviewer/time, даже если
  строка попала в БД в обход CHECK.
- `valid_until >= valid_from`.
- Один ряд на scope (история не ведётся отдельными строками): partial unique
  `(work_id, permission)` для work-level и
  `(work_id, reading_source_id, permission)` для source-level. Смена статуса —
  UPDATE существующего ряда с новым `reviewed_by`/`reviewed_at`.
- `unknown` — дефолт. `approved` с истёкшей датой не считается действующим.

### 3.10 `comic_chapters` — метаданные глав

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `work_id` | uuid | NOT NULL, FK cascade | |
| `reading_source_id` | uuid | NULL, composite FK | |
| `chapter_number` | numeric(10,3) | NULL | Для regular >0; special = NULL |
| `chapter_number_text` | text | NOT NULL, 1..32 | Авторитетное отображение (`1.5`, `SP1`) |
| `chapter_kind` | text | NOT NULL, `regular` | `regular/bonus/special/extra/one_shot` |
| `volume_number` | numeric(6,2) | NULL | >0 |
| `volume_text` | text | NULL | |
| `title_ru` | text | NULL | 1..300 |
| `language` | text | NOT NULL, `ru` | |
| `page_count` | int | NOT NULL, 0 | ≥0; public требует >0 |
| `published_at` | date | NULL | |
| `date_precision` | text | NOT NULL, `unknown` | `day/month/year/unknown` |
| `availability` | text | NOT NULL, `hidden` | `public/hidden` |
| `source_chapter_ref` | text | NULL | ≤200 |
| `source_url` | text | NULL | HTTPS; URL **этой** главы (B3-B) |
| `embed_url` | text | NULL | HTTPS; embed **этой** главы (B3-B) |
| `first_seen_at` | timestamptz | NOT NULL, now | |
| `last_checked_at` | timestamptz | NULL | |
| `created_at/updated_at` | timestamptz | NOT NULL | |

Правила:

- `regular` требует numeric number >0; special/bonus/extra/one_shot — NULL.
- `unique nulls not distinct (work_id, language, chapter_number_text, reading_source_id)`.
- `chapter_number_text` — источник истины для дробных/спецглав.
- `page_count` не является доказательством наличия страниц; pages table нет.
- `reading_url` public view берётся только из `comic_chapters.source_url`
  (external_link) или `comic_chapters.embed_url` (permitted_embed). Work-level
  URL источника не подставляется и не конкатенируется.

### 3.11 `comic_sync_runs` — аудит импорта

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `source_name` | text | NOT NULL | |
| `run_kind` | text | NOT NULL | `graph_snapshot/metadata_verify/metadata_import/rights_review/reconciliation/manual` |
| `adapter_version` | text | NOT NULL, `unknown` | |
| `status` | text | NOT NULL, `running` | `running/success/partial/failed/cancelled` |
| `started_at/finished_at` | timestamptz | | `finished_at >= started_at` |
| `source_snapshot_at` | timestamptz | NULL | |
| `terms_review_status` | text | NOT NULL, `unknown` | |
| `records_seen/inserted/updated/skipped/failed` | int | NOT NULL, 0 | ≥0 |
| `details` | jsonb | NOT NULL, `{}` | object ≤16 KB; без токенов/payload |
| `error_summary` | text | NULL | ≤4000 |
| `created_at` | timestamptz | NOT NULL | |

### 3.12 `comic_review_queue` — внутренняя очередь

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `id` | uuid | PK | |
| `work_id` | uuid | NULL, FK cascade | |
| `item_type` | text | NOT NULL | `work/external_id/alias/person/credit/relation/adaptation/chapter/rights/reading_source/sync_run` |
| `item_ref` | text | NULL | ≤300 |
| `reason` | text | NOT NULL | `missing_ru_title/name_mismatch/duplicate_alias/duplicate_external_id/ambiguous_external_id/rights_unknown/rights_expired/source_conflict/unsupported_relation/unsupported_reading_mode/manual` |
| `severity` | text | NOT NULL, `medium` | `low/medium/high` |
| `status` | text | NOT NULL, `open` | `open/in_review/resolved/dismissed` |
| `priority` | smallint | NOT NULL, 50 | 0..100 |
| `details` | jsonb | NOT NULL, `{}` | object ≤16 KB |
| `created_at/updated_at` | timestamptz | NOT NULL | |
| `resolved_at` | timestamptz | NULL | Обязателен для resolved/dismissed |
| `resolved_by` | text | NULL | |

Один открытый item на `(work, item_type, reason, item_ref)`. Очередь не имеет
public grants; `anon`/`authenticated` получают `insufficient_privilege`.

### 3.13 `user_comic_library` (B4-совместимость)

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `user_id` | uuid | PK part, FK `auth.users` cascade | |
| `comic_work_id` | uuid | PK part, FK works cascade | |
| `status` | text | NOT NULL, `planned` | `planned/reading/completed/on_hold/dropped` |
| `score` | numeric(3,1) | NULL | 1..10 |
| `started_at/finished_at` | timestamptz | NULL | `finished_at >= started_at` |
| `created_at/updated_at` | timestamptz | NOT NULL | |

### 3.14 `user_comic_progress` (B4-совместимость)

| Поле | Тип | Null/default | Смысл |
|---|---|---|---|
| `user_id` | uuid | PK part, FK `auth.users` cascade | |
| `chapter_id` | uuid | PK part, FK chapters cascade | |
| `page` | int | NOT NULL, 0 | ≥0 |
| `completed` | boolean | NOT NULL, false | |
| `last_read_at` | timestamptz | NOT NULL, now | |
| `created_at/updated_at` | timestamptz | NOT NULL | |

## 4. Нормализация и provenance

- `source_name` — lower snake case `^[a-z][a-z0-9_]{1,31}$`.
- `alias.normalized_alias` — lower, trim, collapse whitespace; ё/кириллица не
  выкидываются.
- `slug` — только `[a-z0-9-]`, не начинается/не заканчивается дефисом, без `--`.
- Внешние id — текст, не URL; URL хранится отдельно и только `https://`.
- `source_payload_hash` — SHA-256 hex, не raw JSON. Секреты, токены, заголовки
  и приватные payloads не хранятся.
- У каждого импортируемого факта есть `source_name`, `fetched_at`, confidence,
  `verification_status`; у проверки — `checked_at`/`last_verified_at`.
- `comic_sync_runs` фиксирует snapshot/время/счётчики, но не заменяет provenance
  конкретной строки.

## 5. Конфликты и обновления

| Ситуация | Правило |
|---|---|
| Один external id у двух работ | `unique`; импорт не перезаписывает; queue `duplicate_external_id` |
| Два id одного источника у работы | `unique (work_id, source_name)`; выбрать primary вручную, queue |
| Дубликат MAL | queue `duplicate_external_id`/`ambiguous_external_id`; не авто-merge |
| Alias совпал | `unique` по normalized; queue `duplicate_alias`; не удалять чужой alias |
| Сырой тип связи неизвестен | сохранить `raw_relation_type`; не превращать молча в `RELATED` |
| Любое AniList anime↔comic ребро | B3-B пишет unconfirmed link в `comic_adaptations` с raw type, `direction='unknown'`, `confidence_level='unknown'`, `is_primary=false`, `is_public=false`; `ADAPTATION` не подтверждает первоисточник |
| Два primary adaptation | partial unique; вручную выбрать один |
| Права изменились | обновить существующий scope; `reviewed_by/at`; не плодить дубли |
| Право истекло | `status='expired'` + `valid_until`; views и так отсекают по дате |
| Источник удалён | `reading_sources` лучше деактивировать; chapters получают NULL source, rights cascade |
| Работа удалена | cascade детей; только service role, после backup |
| Publication approved → rejected | сначала снять `published_at`, затем изменить `publication_status` (CHECK не разрешает `published_at` при не-approved); view сразу скрывает |

`updated_at` обновляется trigger `comic_touch_updated_at()` (invoker, не definer).

## 6. Права: матрица

| Permission | Scope | Что разрешает |
|---|---|---|
| `metadata` | work | Публичные title/description/genres/year и т. п. |
| `cover` | work | Публичный `cover_url` |
| `chapter_link` | work + reading source | Внешняя ссылка на главу |
| `embed` | work + reading source | Embed-плеер источника |
| `hosting` | work + reading source | Собственный Storage/CDN; **не реализовано** |

Статусы: `unknown` (default), `pending_review`, `approved`, `rejected`, `expired`.

Для `comic_public_works` нужны пункты 1–3; `cover_url` выдаётся только при 4.
Для `comic_public_chapters` нужны 1–3 и 5–8; пункт 4 не требуется.

1. `comic_works.publication_status='approved'` и `published_at <= now()`;
2. verified русское название и `is_adult=false`;
3. `metadata` approved, действует, с непустым evidence/reviewer/time;
4. для обложки — `cover` approved и действует, с evidence/reviewer/time;
5. для главы — `availability='public'`, `language='ru'`, `page_count>0`;
6. source active + terms approved + `terms_url` + `terms_checked_at` +
   `terms_reviewed_by`;
7. `chapter_link` или `embed` approved и действует, с evidence/reviewer/time;
8. у главы есть собственный `source_url`/`embed_url`; иначе глава не публична.

`licensed_hosted` никогда не попадает в `comic_public_chapters` в B3-A/B3-B: нет
`comic_chapter_pages`, нет Storage-политики, нет legal review.

## 7. Public projections

### `comic_public_works`

Колонки: `id, slug, title_ru, kind, publication_year, publishing_status,
description_ru, cover_url, total_chapters_known, volumes_known, genres,
release_date, release_date_precision, published_at, updated_at`.

Не отдаёт: original/native title, provenance URL/source, confidence, rights,
review queue, adult-флаг, external ids, авторов (до отдельного public contract).

### `comic_public_chapters`

Колонки: `id, work_id, chapter_number, chapter_number_text, chapter_kind,
volume_number, volume_text, title_ru, language, page_count, published_at,
reading_source_id, source_name, attribution_text, reading_mode, reading_url`.

`reading_mode` — только `external_link` или `permitted_embed`; `reading_url` —
`comic_chapters.source_url` для external_link или `comic_chapters.embed_url`
для permitted_embed. Work-level `comic_reading_sources.source_url`/`embed_url`
в `reading_url` не попадают. Hosted не отдаётся.

Оба view: `security_invoker=false`, `security_barrier=true`, owner — migration
role (`postgres`). Это осознанный definer-surface; threat review — в ADR.

## 8. RLS и grants

| Роль | Base comics tables | Public views | User tables |
|---|---|---|---|
| `anon` | нет grants | SELECT | нет |
| `authenticated` | нет grants | SELECT | SELECT/INSERT/UPDATE/DELETE только `auth.uid()=user_id` |
| `service_role` | SELECT/INSERT/UPDATE/DELETE | SELECT | SELECT/INSERT/UPDATE/DELETE |
| moderator/admin | **роли нет** | — | — |

Политики user-таблиц используют `(select auth.uid()) = user_id` и в `USING`, и
в `WITH CHECK` для insert/update. `auth.uid()` не заменяется на редактируемый
`user_metadata`.

`comic_review_queue`, `comic_rights`, `comic_sync_runs`, `comic_external_ids`,
`comic_aliases` и provenance не имеют public grants. Очередь недоступна
модератору, потому что модераторской роли в схеме нет; это ограничение, а не
скрытая политика.

## 9. Интерфейс source adapter

B3-B реализует `SourceAdapter` (`lib/aninova3/comics/import/adapters.ts`):
`read(raw)` → `validate(value)` → `normalize(value, context)`.

Adapter обязан возвращать/фиксировать:

- `source_name` (стабильный lower snake case);
- `external_id`;
- `source_url`;
- `fetched_at`;
- `source_snapshot_at` (снимок артефакта);
- `terms_review_status`;
- `attribution_requirements` (текст/URL);
- `confidence` (0..1 или NULL);
- `verification_status`;
- `raw_relation_type` для связей;
- `source_payload_hash` (SHA-256) для provenance.

Adapter читает только уже сохранённые JSON-артефакты; сетевых вызовов нет.

Запрещено:

- вызывать внешний API из UI/клиента;
- массово импортировать без owner approval;
- сохранять токены, OAuth secrets, service keys, приватные payloads;
- считать `API 200` разрешением на metadata/cover/chapter/embed/hosting;
- зеркалировать страницы MangaDex или иного источника без legal review.

MangaDex можно рассматривать только после проверки актуальных ToS, attribution
и API-сценариев. Наличие API не разрешает mirroring страниц.

## 10. B4-границы

- `user_comic_library`/`user_comic_progress` созданы, но UI/routes в B3-A нет.
- `profile_lists`/`profile_history` (аниме) не изменяются; Comics-прогресс не
  пишется в аниме-таблицы.
- Интеграция с `profiles`/username/аватарами — отдельная additive-миграция B4.
- Публичный каталог Comics, поиск, reader, embed, hosted pages — вне B3-A.

## 11. Проверки и статусы

| Проверка | Статус |
|---|---|
| DDL applies on PGlite 0.6.0 | DONE |
| FK/unique/check/partial unique | DONE (PGlite) |
| RLS anon/authenticated/service_role | DONE (PGlite) |
| Alice/Bob isolation | DONE (PGlite) |
| Private queue denial | DONE (PGlite) |
| Rights unknown/expired/hosted exclusion | DONE (PGlite) |
| B3-B chapter-specific URL + evidence gates | DONE (PGlite, transactional tests) |
| B3-B adapters/normalization/dedup/dry-run | DONE (Vitest) |
| B3-B canary apply/idempotency | DONE (disposable PGlite) |
| Supabase CLI/PostgREST/Storage | NOT TESTED |
| Production apply | NOT TESTED / not performed |
| Public UI/routes | NOT TESTED / out of scope |

## 12. Открытые ограничения

- Нет модераторской роли; очередь только service role.
- Нет `comic_chapter_pages` и hosted-сценария.
- Нет public view авторов/издателей: контракт для них ещё не утверждён.
- Нет автоматического merge дублей; только очередь.
- `metadata-verified.json` содержит расхождение `meta.total`/`records`; импорт
  должен доверять измеренным records.
- B3-B персоны — name-only из `authors` AniList, `source_person_id=NULL`,
  `name_status='unverified'`; это не подтверждённые личности и не public.
- B3-B не применяет план к БД и не создаёт права/главы/reading sources.
