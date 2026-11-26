# B3-D — review operations и quality monitoring

Статус: **DONE для local/read-only слоя, unit-тестов и сборки**.

Production Supabase / PostgREST / JWT / RLS: **NOT TESTED**. B3-D не применяет SQL,
не меняет production-данные и не включает публичный Comics API/reader.

## 1. Границы

B3-D — слой наблюдения, а не редактирования. Все операции каталога read-only:

- `comic_works`, `comic_people`, `comic_external_ids`, `comic_aliases`,
  `comic_credits`, `comic_adaptations` только читаются;
- `comic_source_observations` append-only и в B3-D не изменяются;
- `comic_review_queue` только читается; статусы/reason/priority не меняются;
- `comic_rights` только читаются, approved rights не создаются;
- `comic_chapters`, `comic_reading_sources`, `comic_public_works`,
  `comic_public_chapters` только читаются;
- migration для B3-D не нужна и не добавлялась.

Ни один конфликт не разрешается автоматически: canonical value не выбирается,
наблюдения не удаляются, review item не закрывается, дубликаты не сливаются.

## 2. Архитектура

```text
app/admin/comics/review/page.tsx       server component, admin-only UI
        │
        ├─ lib/aninova3/comics/operations/repository.ts   read-only PostgREST GET
        │       ├─ loadCatalogSnapshot()   дашборд
        │       ├─ loadReviewWorkspace()   очередь + detail
        │       ├─ loadConflictWorkspace() инспектор конфликтов
        │       └─ loadRelationWorkspace() инспектор связей
        │
        ├─ dashboard.ts     счётчики и разделение слоёв
        ├─ review.ts        фильтры, пагинация, группировка, detail
        ├─ conflicts.ts     source values без выбора победителя
        ├─ relations.ts     evidence и policy warnings без promotion
        └─ report.ts        детерминированный JSON-отчёт
```

`repository.ts` использует только `GET`. Запросы идут с `Prefer: count=exact`,
`Range` и таймаутом 15 секунд; POST/PATCH/DELETE в модуле отсутствуют.

`fetchAll()` имеет жёсткий предел `MAX_ROWS = 60 000` и проверяет полноту
выборки отдельной функцией `assertCompleteSelection()`:

- известный total больше лимита → `CatalogReadIncompleteError`;
- известный total не равен фактически полученному → ошибка;
- известный total ровно 60 000 и получен полностью → успех;
- total неизвестен и достигнут лимит → ошибка;
- total неизвестен, но последняя страница короткая и лимит не достигнут → успех.

Неполная выборка никогда не возвращается как полная: dashboard, queue,
conflicts и relations получают ошибку, а не частичные счётчики.

### Источники данных

| Режим | Источник | Назначение |
|---|---|---|
| UI | Supabase REST (server-side, service key) | актуальное read-only состояние БД |
| Report | deterministic B3-C dry-run plan из committed artifacts | воспроизводимый снимок без БД |
| Tests | fixtures + PGlite | контракты и отсутствие мутаций |

Артефакт отчёта и UI могут отличаться по `generated_at`: отчёт — снимок плана,
UI — снимок БД на момент запроса. Это не взаимозаменяемые источники.

## 3. Доступ и безопасность

Маршрут `/admin/comics/review` — server component. До любых чтений он проверяет
существующую admin-cookie:

```text
cookies() → adminCookieName() → verifyAdminCookie(value)
неверно/просрочено → redirect('/admin/login')
```

Это тот же HMAC-механизм на `ADMIN_TOKEN`, что и у `/admin`; новый role-системы
нет, `user_metadata.role` не используется. Cookie httpOnly и проверяется
`timingSafeEqual`-сравнением; пустой `ADMIN_TOKEN` означает fail-closed.

Серверный read использует `SUPABASE_SERVICE_KEY` или
`SUPABASE_SERVICE_ROLE_KEY`. Anon-ключ намеренно не принимается: без
service-доступа admin-read не деградирует до публичного чтения. Секреты не
рендерятся и не попадают в отчёт.

Ограничение: service key имеет широкие права на уровне БД; read-only гарантия
B3-D — кодовая (только GET), а не отдельная read-only DB-role. Для production
следует отдельно рассмотреть read-only role/RLS-политику для операционного
чтения; это изменение вне B3-D и не выполнялось.

## 4. Дашборд: определения метрик

Дашборд разделяет пять независимых слоёв. **Метаданные не равны доступности
для чтения.**

### 4.1 Metadata

| Метрика | Определение |
|---|---|
| `works_total` | число `comic_works` |
| `works_by_status` / `by_kind` | распределение по `publication_status` / `kind` |
| `unknown_kind` | работы с `kind='unknown'` |
| `ru_titles_present` | непустой `title_ru` после `trim()` |
| `ru_titles_verified` | `ru_titles_present` и `title_ru_status in (source_verified, editorially_verified)` |
| `ru_titles_unverified` | `ru_titles_present` и статус не входит в verified-набор |
| `ru_titles_missing` | `title_ru IS NULL` или пустая строка после `trim()` |
| `ru_titles_name_mismatch` | работы с `title_ru_status='name_mismatch'`; диагностический счётчик, может относиться и к missing, и к present |
| `external_ids`, `aliases`, `people`, `credits`, `adaptations`, `source_observations` | фактические счётчики таблиц; observations — все строки, включая конфликтные |

Классификация RU title:

```text
ru_titles_present = ru_titles_verified + ru_titles_unverified
ru_titles_present + ru_titles_missing = works_total
```

`ru_titles_name_mismatch` — не отдельная bucket и не слагаемое: это счётчик
статуса `name_mismatch`, который может пересекаться с `missing` или
`unverified`. Поэтому `present + mismatch` не является осмысленной суммой.
Отсутствующее название никогда не считается неподтверждённым названием.

### 4.2 Quality sources / identity

| Метрика | Определение |
|---|---|
| `source_conflict_works` | union работ из source-conflict review items и работ с `is_conflict=true` observations |
| `source_conflict_items` | review items с source-conflict reason |
| `observation_conflicts` | строки observations с `is_conflict=true` |
| `ambiguous_external_ids` | review items с `ambiguous_external_id` / source-ambiguous reason (не число уникальных external ID) |
| `unidentified_author_buckets` | distinct `name_bucket_key` у people с `identity_status='unidentified_name_bucket'` |
| `identified_authors` | people с `source_person_id` или status `source_identified`/`manually_verified` |
| `ambiguous_people_identities` | review items reason `ambiguous_people_identity` |
| `missing_provenance_items` | review items reason `missing_provenance` |
| `observations_missing_url` | observations с `source_url is null` |
| `unknown_adult` | работы с `content_rating_status='unknown'` |
| `contradictory_relations` | anime id с одновременно `comicAdaptsAnime` и `adaptationAfterAnime` B1D hints |
| `duplicate_candidates` | review items duplicate reason (`duplicate_external_id` и duplicate-title) |

`contradictory_anime_ids` — только evidence-конфликт. Направление не выбирается,
`direction`/`confidence` остаются unknown, `is_primary`/`is_public` — false.

### 4.3 Publication / rights / chapters

| Метрика | Определение |
|---|---|
| `draft`, `approved`, `published` | `publication_status`; `published` дополнительно требует `published_at <= generated_at` |
| `adult` | `content_rating_status='adult'` |
| `verified_non_adult` | `content_rating_status='verified_non_adult'`; выставляется только при evidence |
| `adult_unknown` | `content_rating_status='unknown'` |
| `approved_rights` | строки `comic_rights` со `status='approved'` |
| `approved_rights_works` | distinct work id среди approved rights |
| `chapters` / `chapters_with_pages` | все главы / главы с `page_count > 0` |
| `public_chapters` | строки `comic_public_chapters` |
| `reading_sources` / `active` | все / `is_active=true` reading sources |
| `public_works` | строки `comic_public_works` |
| `publishable_works` | работы, прошедшие publication gates; вычисляется из тех же gate-условий |

`publishable_works` не выводится из наличия title/external ID. Нужны approved
metadata rights с evidence/reviewer/сроком действия, подтверждённый non-adult
статус, verified RU title и выполненные publication-условия. Это готовность
**метаданных к публикации**, а не доступность глав для чтения: chapters,
reading sources и public chapters считаются отдельно. Текущий результат — 0.

## 5. UI

`/admin/comics/review` — четыре вкладки:

1. `dashboard` — metadata/quality/publication/review counters;
2. `queue` — фильтры, группировка по work, пагинация, detail;
3. `conflicts` — выбор work и все source values по field;
4. `relations` — summary, четыре contradictory anime id, фильтр по anime id.

Ссылка на раздел добавлена в `/admin`. UI использует существующие AniNova
tokens/classes (`.panel`, `.badge`, `.section-title`, `.page-head`) и локальный
CSS module для сеток/таблиц; отдельной визуальной системы нет. На мобильном
таблицы превращаются в карточки `data-label`, фильтры — в grid.

В UI нет кнопок approve/reject/resolve/delete/publish. Формы только GET;
внешние source URL открываются как ссылки с `noreferrer noopener`.

## 6. Производительность и границы

Дашборд загружает ~4 100 works, ~9 007 people, ~6 462 review items, ~5 748
adaptations, approved rights и 1 558 conflict observations, остальные счётчики —
через exact counts. Очередь/конфликты дополнительно загружают works/review items;
detail — observations/external IDs/aliases/adaptations выбранной работы.

Фильтрация очереди выполняется в памяти после безопасного чтения: это
операционный admin-инструмент, не публичный API. Для роста каталога на порядки
понадобится серверная фильтрация/keyset pagination; это не входило в B3-D.

## 7. Отчёт

```bash
# SHA обязателен и должен указывать на уже закоммиченную версию B3-D кода
npm run comics:b3d:report -- --commit=<FULL_SHA>

# сравнение с предыдущим снимком:
npm run comics:b3d:report -- --commit=<FULL_SHA> --previous=docs/data/aninova3-b3d-quality-report.json
```

Генератор не подставляет `HEAD` по умолчанию. Он разрешает указанный SHA,
проверяет наличие всех B3-D модулей в этом commit tree и требует, чтобы
рабочая копия этих модулей совпадала с указанным коммитом. JSON отчёта
коммитится отдельно и не становится `source_code_commit_sha` самого себя.

Подробности и текущие значения — `B3D_QUALITY_REPORT.md`.

## 8. Ограничения

- Production Supabase/PostgREST/RLS не тестировались; PGlite — не production.
- UI-авторизация проверена на уровне общей admin-cookie-функции, без E2E
  браузерной сессии с реальным `ADMIN_TOKEN`.
- Нет audit-log просмотров и нет read-only DB role (см. §3).
- Дашборд — счётчики, не доказательство качества конкретной записи.
- Отчёт из plan и UI из БД не гарантируют одинаковый `generated_at`.
