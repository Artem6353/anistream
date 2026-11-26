# ADR-0001: канонический фундамент данных Comics

- Статус: **Accepted** для B3-A (local schema + PGlite validation).
- Production apply: **не выполнялся**, **NOT TESTED**.
- Дата: 2026-11-23.
- Ветка: `data/aninova-3-b3-a-schema-contract-2026-11`.
- База: `03579f388fb9d674dee442d365c8b3f9ad128831`.

## 1. Контекст

До B3-A Comics существовал как файловый preview-слой:

- `source-graph.json` (4 100 работ, 5 748 связей);
- `metadata-verified.json` (2 265 фактических записей);
- `metadata-candidates.json` (2 170 кандидатов);
- `source-data.ts` (одна editorial-запись, без прав и глав);
- `store.ts`/`publication.ts` — in-memory индексы и файловые гейты.

В БД не было ни одной `comic_*` таблицы. При этом существовали два
неприменённых предложения схемы:

- `docs/ANINOVA_3_B1C_RELATION_MODEL.md`: `comic_works`, `comic_sources`,
  `comic_chapters`, `comic_publication`;
- `docs/ANINOVA_3_B1E_REPORT.md` §7: `comic_work`, `comic_work_title`,
  `comic_work_genre`, `comic_work_anime`, `comic_chapter`, `comic_chapter_page`,
  `comic_chapter_log`.

Ни одно из них не было миграцией. Оба конфликтуют по именам и не покрывают
пять независимых прав, alias-типы, provenance, очередь и B4-прогресс.

Дополнительные ограничения:

- В audited-схеме нет роли `admin`/`moderator`; `user_metadata` редактируется
  пользователем и не является authority.
- Нет legal review для hosted-страниц; нет `comic_chapter_pages`.
- AniList `ADAPTATION` — сырой тип, не подтверждение направления адаптации.
- 195 лицензионных названий не равны правам; approved rights = 0.
- Production/Storage/Redis/Vercel менять нельзя без owner approval.

## 2. Решение

Принята **additive** схема из 14 таблиц:

1. `comic_works`
2. `comic_external_ids`
3. `comic_aliases`
4. `comic_people`
5. `comic_credits`
6. `comic_relations`
7. `comic_adaptations`
8. `comic_chapters`
9. `comic_reading_sources`
10. `comic_rights`
11. `comic_sync_runs`
12. `comic_review_queue`
13. `user_comic_library`
14. `user_comic_progress`

Плюс два public view: `comic_public_works`, `comic_public_chapters`.

Ключевые решения:

- UUID PK для работ; внешние id — отдельные строки, не PK.
- Один canonical work, много source ids (AniList/MAL/Shikimori/издатель).
- Alias-типы: `alternative_title`, `transliteration`, `official_russian`,
  `search_alias`, `original_title`, `native_title`.
- 7 нормализованных relation types + сохранённый `source_relation_type`.
- `comic_adaptations` связывает `public.titles(id)` с работой; AniList-ребро
  не считается confirmed без basis/confidence.
- Пять независимых прав: `metadata`, `cover`, `chapter_link`, `embed`, `hosting`.
- Reading modes: `external_link`, `permitted_embed`, `licensed_hosted`; hosted
  не проецируется публично.
- `comic_chapters.chapter_number_text` — авторитетное значение; numeric —
  удобный индекс, допускает дроби и special-главы.
- Нет `comic_chapter_pages` и Storage-политики.
- Public surface — только views; base tables server-only.
- Нет модераторской политики: роли нет, `service_role` — единственный
  административный путь.

## 3. Что superseded

### 3.1 B1C relation model

`docs/ANINOVA_3_B1C_RELATION_MODEL.md` — historical proposal. Заменено:

| B1C | B3-A |
|---|---|
| `comic_works` | `comic_works` (другие поля/контракт) |
| `comic_sources` | `comic_reading_sources` + `comic_external_ids` + `comic_rights` |
| `comic_chapters` | `comic_chapters` (text number, source FK) |
| `comic_publication` | `publication_status` + rights + views |

### 3.2 B1E §7

`docs/ANINOVA_3_B1E_REPORT.md` §7 — historical proposal, **не применять**:

| B1E §7 | B3-A |
|---|---|
| `comic_work` | `comic_works` |
| `comic_work_title` | `comic_aliases` + `title_ru` |
| `comic_work_genre` | `comic_works.genres` |
| `comic_work_anime` | `comic_adaptations` |
| `comic_chapter` | `comic_chapters` |
| `comic_chapter_page` | **не создаётся** |
| `comic_chapter_log` | `comic_sync_runs` + `comic_review_queue` |

Старые документы не перезаписываются: они остаются историей и должны читаться
с этой пометкой. Никаких `DROP`/`RENAME` существующих объектов не делалось.

## 4. Альтернативы

### 4.1 Отдельная таблица работ на каждый источник

Отклонено: дубли, рассинхронизация прав/глав, невозможность alias-поиска и
единой публикации. Source-specific данные живут в external ids/provenance.

### 4.2 Один JSONB-документ на работу

Отклонено: нет FK/уникальности/CHECK/RLS по строкам, сложно индексировать
alias/главы/права, невозможно безопасно выдавать public projection.

### 4.3 Использовать `public.titles` как Comics

Отклонено: `titles` — аниме-каталог с `id int = AniList id`, своими FK и
плеером. Смешение сломало бы Anime. Связь — только `comic_adaptations`.

### 4.4 Один boolean `rights_verified`

Отклонено: metadata/cover/chapter/embed/hosting — разные permission и разные
scope; boolean теряет expiry и review evidence.

### 4.5 Сразу `comic_chapter_pages`

Отклонено: нет legally reviewed hosted-сценария, Storage-политики и owner
approval. Таблица поощряла бы mirroring. `licensed_hosted` существует в
модели, но публично не проецируется.

### 4.6 PostgreSQL enum

Отклонено: additive-изменения enum дороже и хуже переносимы; `text + CHECK`
достаточно.

### 4.7 Модератор через `user_metadata.role`

Отклонено: пользователь может редактировать metadata; это privilege
escalation. Политика не создана; отсутствие роли зафиксировано.

## 5. Последствия

Положительные:

- единая source-independent модель;
- alias/FTS-поиск и duplicate protection;
- раздельные права и честная публикация;
- additive-миграции и безопасный rollback;
- B4 может добавить UI/интеграцию без переделки канона.

Отрицательные/ограничения:

- Нет модераторского UI/роли; очередь только service role.
- Нет hosted-страниц и reader.
- Нет public view авторов/издателей.
- Нет автоматического merge дублей.
- Production/Supabase behavior не проверен.

## 6. Security threat review public views

`comic_public_works` и `comic_public_chapters` — `security_invoker=false`
(definer semantics), owner — migration role. Это осознанная поверхность;
риски и меры:

| Риск | Мера |
|---|---|
| Обход RLS base tables | Views читают только фиксированный набор колонок; base tables не имеют anon/authenticated grants |
| Утечка provenance/прав | В view нет source ids/URLs/confidence/review/rights |
| Adult-контент | `is_adult=false` в обоих view |
| Неподтверждённая работа | `publication_status='approved'`, `published_at<=now()`, verified RU title |
| Нет metadata-права | approved `metadata` + validity |
| Обложка без права | cover проецируется только при approved `cover` |
| Внешняя глава без права | approved `chapter_link` + active source + approved terms |
| Embed без права | approved `embed` + active source + approved terms |
| Hosted без legal basis | `licensed_hosted` не входит в view |
| Истёкшее право | проверка `valid_from/valid_until` |
| SQL-инъекция | нет dynamic SQL, только фиксированные predicates |
| Privilege escalation | нет definer-функций; views не принимают параметры |

`comic_review_queue`, `comic_rights`, `comic_sync_runs` и provenance не имеют
public grants. `authenticated` не может читать очередь; это проверено.

## 7. Migration / rollback

Порядок:

1. `20261123_comics_foundation.sql`
2. `20261123_comics_rls.sql`

Rollback: `supabase/rollback/20261123_comics_rollback.sql` — только local/
disposable DB, drops новые объекты в безопасном порядке, не трогает `titles`
и `auth.users`. Детали — `B3A_MIGRATIONS_ROLLBACK.md`.

## 8. Compliance

- Production changes: **нет**.
- Push/import/Storage/Redis/Vercel: **нет**.
- MangaDex mass import/mirroring: **нет**.
- Секреты/токены/service keys в docs/tests/logs: **нет**.
- `main` и B2-D не изменялись.
- PR/merge/deploy: **нет**.

## 9. Открытые вопросы

- Появится ли verified moderator/admin role? Тогда — отдельная additive
  policy-миграция и тест; сейчас `BLOCKED` по отсутствию роли.
- Будет ли legal approved hosted-сценарий? Тогда — отдельный ADR, Storage
  policy, `comic_chapter_pages`, тесты; сейчас **вне scope**.
- Нужен ли public authors view? Отдельный контракт после проверки прав
  на имена/атрибуцию.
