# B3-A — аудит существующей схемы и данных Comics

Статус: **DONE** для аудита репозитория и файловых артефактов; **NOT TESTED** для production-схемы и Supabase/PostgREST (доступа к production в B3-A не было).

Ветка: `data/aninova-3-b3-a-schema-contract-2026-11`.
База: `design/aninova-3-b2-d-search-utilities-2026-11`, SHA `03579f388fb9d674dee442d365c8b3f9ad128831`.

## 1. Что проверено

- Все SQL-миграции в `supabase/migrations/` (17 файлов до B3-A).
- Существующие таблицы, представления, функции, RLS-политики и grants в миграциях.
- Файловый слой Comics: `lib/aninova3/comics/*`, JSON-граф, verified/candidates, editorial record.
- Отчёты и очереди B1C/B1D/B1E в `docs/` и `docs/data/`.
- Связь Anime ↔ Comics через `public.titles`, `title_relations`, `episodes`.
- Отсутствие admin/moderator-роли и отсутствие DB-таблиц Comics.

Production-база, Supabase CLI, PostgREST и Storage в B3-A **не изменялись и не проверялись**. Числа строк production-каталога ниже не перепроверялись; для Comics использованы измерения файловых артефактов.

## 2. Инвентаризация public-схемы до B3-A

В миграциях до B3-A было 24 public-таблицы. Они не конфликтуют с новыми именами `comic_*` и `user_comic_*`.

### Anime-каталог и плеер

| Объект | Назначение |
|---|---|
| `public.titles` | Каталог аниме; `id int` = AniList id, `slug`, `anilist_id`, `mal_id`, `shikimori_id`, `source`, `is_adult`, `hidden` |
| `public.title_relations` | Связи франшизы (`anime_id`, `related_id`, `relation_type`) |
| `public.title_characters` | Персонажи тайтла |
| `public.episodes` | Эпизоды, PK `(anime_id, number)` |
| `public.episode_sources` | Провайдеры/переводы эпизодов |
| `public.episode_source_urls` | URL/embed-ы источников |
| `public.airing_schedule` | Расписание выхода |
| `public.episode_progress` (view) | Прогресс эпизодов |
| `public.airing_progress` (view) | Прогресс просмотра |

### Пользователи и социальный слой

`profiles`, `profile_lists`, `profile_history`, `follows`, `clubs`, `club_members`, `club_posts`, `dm_threads`, `dm_messages`, `forum_categories`, `forum_threads`, `forum_posts`, `reviews`, `review_reactions`, `push_subs`, `dmca_requests`, `source_reports`.

Ключевые существующие паттерны:

- `titles`, `episodes`, `episode_sources` и социальные read-таблицы имеют public read; запись — `service_role`.
- `profile_lists`/`profile_history` ограничены `auth.uid() = user_id`.
- `follows`, `clubs`, `club_posts`, `dm_*`, `forum_*`, `reviews` используют own-row/participant/author политики.
- `dmca_requests` и `source_reports` принимают insert только через `service_role`.
- `db_storage_report()` — `SECURITY DEFINER`, execute только `service_role`.
- Роли `anon`, `authenticated`, `service_role` есть. **Роли `admin`/`moderator` в аудированной схеме нет**; выдавать модераторский доступ через `user_metadata` нельзя.

### Чего не было

- Нет ни одной таблицы `comic_*`.
- Нет `comic_works`, `comic_external_ids`, `comic_aliases`, `comic_chapters`, `comic_rights`.
- Нет `comic_chapter_pages` и Storage-структуры страниц.
- Нет пользовательских таблиц Comics (`user_comic_library`, `user_comic_progress`).
- Нет очереди Comics, отдельной от `source_reports`/`dmca_requests`.

## 3. Comics сейчас — файловый слой, не БД

| Артефакт | Размер | Фактическое содержимое |
|---|---:|---|
| `lib/aninova3/comics/source-graph.json` | 2 795 928 B | 4 100 комиксов, 5 748 связей |
| `lib/aninova3/comics/metadata-verified.json` | 1 080 180 B | 2 265 записей в `records` |
| `lib/aninova3/comics/metadata-candidates.json` | 1 062 473 B | 2 170 кандидатов |
| `docs/data/aninova3-b1d-review-queue.json` | — | 120 строк очереди |

`lib/aninova3/comics/store.ts` строит registry в памяти из графа, editorial-записи и verified/candidates. Индексы по slug/AniList/MAL существуют только в памяти процесса. Публикация и права проверяются файловыми функциями `publication.ts`; в БД прав нет.

Единственная editorial-запись: AniList `30011` («Наруто»), `rightsVerified: false`, глав `[]`, статус `PENDING_VERIFICATION`.

## 4. Измеренные данные (не отчётные заголовки)

### 4.1 Граф

- 8 033 аниме запрошено, 8 031 получено.
- 4 100 комиксов, 5 748 рёбер.
- 3 560 комиксов с MAL id, 4 091 с авторами, 4 100 с обложкой, 4 089 с годом, 3 011 с числом глав.
- Страны: 3 922 JP, 42 KR, 136 CN.
- Форматы: 4 014 MANGA, 86 ONE_SHOT.
- 2 444 комикса имеют хотя бы одно ребро `ADAPTATION`.
- Дубликат MAL: 1.

Сырые типы связей AniList (до нормализации):

| raw type | Кол-во |
|---|---:|
| `ADAPTATION` | 3 711 |
| `ALTERNATIVE` | 1 271 |
| `CHARACTER` | 247 |
| `SPIN_OFF` | 190 |
| `SIDE_STORY` | 110 |
| `OTHER` | 106 |
| `PREQUEL` | 54 |
| `SEQUEL` | 36 |
| `PARENT` | 23 |

`ADAPTATION` — сырой тип источника, а не подтверждение, что комикс является первоисточником аниме. Направление и уверенность должны храниться отдельно (`comic_adaptations.direction/confidence_level/basis`).

### 4.2 Verified metadata

Фактически в `records`: **2 265**, хотя `meta.total` говорит **2 444**. Это расхождение самого артефакта; в B3-A используются измеренные 2 265.

| Статус | Кол-во |
|---|---:|
| `SOURCE_VERIFIED` | 2 137 |
| `NAME_MISMATCH` | 67 |
| `PENDING_REVIEW` | 33 |
| `NO_RU_TITLE` | 28 |

Прочее:

- 2 237 записей с непустым `titleRu` в runtime-файле (измерено), а не только по счётчику отчёта.
- 195 заявленных лицензионных названий (`licenseNameRu`) — это **не** подтверждение прав.
- 0 полей `descriptionRu` в фактическом runtime-файле, хотя B1E-отчёт упоминает 1 496 описаний.
- 2 170 кандидатов в `metadata-candidates.json`.

Расхождение «2 444 / 1 496 описаний / 2 439 авторов» в отчётах versus фактические 2 265 / 0 описаний означает: **нельзя использовать заголовки отчётов как данные**. Импорт в БД должен идти только из проверяемого runtime-файла и фиксировать `source_snapshot_at`/`metadata_checked_at`.

### 4.3 Очередь проверки B1D

`docs/data/aninova3-b1d-review-queue.json`: 120 строк.

| Категория | Строк |
|---|---:|
| `multiSourceNeedsReview` | 30 |
| `comicAdaptsAnime` | 4 |
| `adaptationAfterAnime` | 85 (74 уникальных аниме) |
| `duplicateMal` | 1 |

Уникальных рёбер — 85, уникальных аниме — 101. Это очередь на проверку, не набор подтверждённых связей.

### 4.4 Готовность к публикации

| Показатель | Значение |
|---|---:|
| Подтверждённые права (approved) | 0 |
| Русские главы с реальными страницами | 0 |
| Reading sources | 0 |
| Публично читаемые работы | 0 |
| Работы, допущенные в информационный каталог B1E | 2 137 |

То есть 2 137 работ могут быть только кандидатами на информационную карточку; **ни одна** не может иметь reader/embed/hosted до появления подтверждённых прав и реальных глав.

## 5. Конфликты и расхождения

1. **Старые предложения схемы.** `docs/ANINOVA_3_B1C_RELATION_MODEL.md` предлагает `comic_works`, `comic_sources`, `comic_chapters`, `comic_publication`; `docs/ANINOVA_3_B1E_REPORT.md` §7 — `comic_work`, `comic_work_title`, `comic_work_genre`, `comic_work_anime`, `comic_chapter`, `comic_chapter_page`, `comic_chapter_log`. Это не применённые миграции и конфликтующие имена. B3-A вводит канонические имена и фиксирует решение в ADR; старые документы не переписываются задним числом.
2. **Нет `comic_chapter_pages`.** Страницы не создаются: нет legally reviewed hosted-сценария и Storage-политики.
3. **Права не равны доступности API.** 195 лицензионных названий и наличие внешнего API не являются разрешением на metadata/cover/chapter/embed/hosting.
4. **Нет модераторской роли.** В B3-A нет политики «moderator can read queue», потому что такой роли нет. Очередь доступна только `service_role`; это надо явно указать как ограничение, а не изобретать `user_metadata.role`.
5. **`ComicWork` в TypeScript — preview-модель.** Она не совпадает один-в-один с БД: например, `ComicExternalIds` — плоский объект, а в БД отдельные строки; `WorkRelationKind` — нормализованный тип, а `source_relation_type` хранится отдельно.
6. **Файловые гейты публикации** (`publication.ts`) не являются RLS. После появления БД публичный доступ должен идти только через views, которые повторяют гейты в SQL.
7. **`meta.total` ≠ `records.length`.** Это дефект артефакта; при импорте нельзя доверять `meta.total`.
8. **Отчёты B1E завышают описания/авторов** относительно runtime-файла. Импорт должен быть основан на измеренных полях, а не на суммарных числах отчёта.

## 6. Существующая security-модель

- `anon`: публичное чтение каталога/социальных read-таблиц; записи нет.
- `authenticated`: публичное чтение + собственные строки в profile/club/DM/forum/review слое.
- `service_role`: импорт/защищённые операции; в существующих миграциях используется для write-политик.
- `admin`/`moderator`: **отсутствует**. `user_metadata` редактируется пользователем и не может быть источником полномочий.
- `SECURITY DEFINER` в существующей схеме: `db_storage_report()` (execute только `service_role`). Новые definer-функции в B3-A не создаются.

## 7. Что изменено в B3-A

- Добавлены 12 канонических таблиц Comics и 2 пользовательские таблицы B4-совместимости.
- Добавлены public views `comic_public_works` и `comic_public_chapters` — единственный public surface.
- Добавлены RLS, grants, FTS/alias-индексы, CHECK/UNIQUE/FK, updated-at trigger.
- Существующие таблицы, колонки, политики и данные не изменялись.
- Production, Storage, Redis, Vercel, MangaDex и массовый импорт не затрагивались.

## 8. Ограничения аудита

- Production-схема не перепроверялась: **NOT TESTED**.
- Supabase CLI/PostgREST/Storage: **NOT TESTED** (в окружении нет `supabase`, Docker, `psql`).
- Локальная проверка SQL/RLS выполнена на PGlite 0.6.0; это не Supabase и не доказывает поведение PostgREST.
- Числа 8 033/2 137 и т. п. — из файловых артефактов и отчётов, не из production SQL-запроса.

## 9. Ссылки

- `docs/comics/B3A_DATA_CONTRACT.md`
- `docs/comics/adr/0001-comics-data-foundation.md`
- `docs/comics/B3A_MIGRATIONS_ROLLBACK.md`
- `supabase/migrations/20261123_comics_foundation.sql`
- `supabase/migrations/20261123_comics_rls.sql`
