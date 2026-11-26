# B3-D — review queue, conflicts и relations inspector

Статус: **DONE для read-only операций; production Supabase не тестировался**.

Маршрут: `/admin/comics/review`, вкладки `queue`, `conflicts`, `relations`.
Все действия — только просмотр. В интерфейсе нет approve/reject/resolve/delete.

## 1. Очередь: фильтры

`parseReviewQuery()` принимает:

| Параметр | Поведение |
|---|---|
| `reason` | точный reason code; неизвестный игнорируется |
| `work_id` | UUID работы |
| `status` | `open`, `in_review`, `resolved`, `dismissed` |
| `priority` | минимальный priority (`>=`) |
| `source` | имя источника, извлечённое из `details` |
| `source_conflict=1` | source-conflict reasons |
| `ambiguous_external_id=1` | ambiguous external ID reasons |
| `relation_evidence_conflict=1` | relation evidence reasons |
| `author_identity_conflict=1` | author identity reasons |
| `created_from` / `created_to` | дата; date-only разворачивается в UTC-день |
| `q` | поиск по internal key и RU title |
| `group_by_work=1` | группировка по work; работы без work — отдельная группа |
| `sort` | `priority`, `created_at`, `status` |
| `dir` | `asc` / `desc` |
| `page` | с 1 |
| `page_size` | 10..100, default 25 |

Поиск источников рекурсивно обходит `details`, но пропускает
`source_payload`; поддерживаются `source`, `source_name`, `sourceName`,
`sources`, `values`, `linked_edges`. Имена валидируются как
`^[a-z][a-z0-9_]{1,31}$`, чтобы не подставлять произвольные строки в фильтр.

Сводка очереди возвращает `total`, `by_status`, `by_reason`, `by_severity`,
`by_source`; `by_reason` содержит все reason-ключи, включая нули. Пагинация
считает `pageCount` от отфильтрованного набора, а не от исходной таблицы.

## 2. Очередь: detail

`buildReviewDetail()` показывает:

- точный `work_id` и флаг `exactWorkLink`; работа не подменяется похожей;
- reason/status/priority/severity, `details` как JSON;
- связанные review items той же работы;
- provenance из observations, external IDs, aliases и adaptations:
  `sourceName`, `externalId`, `joinKey`, `fetchedAt`, `verificationStatus`,
  `sourceUrl`;
- warnings, если работа не найдена или связь неточная.

Ничего не скрывается: `undefined`/`null` отображаются как «—»/`null`,
конфликтующие значения не схлопываются.

### Пример detail

Карточка показывает `reason`, `status`, `priority`, `severity`, полный
`details`, точный `work_id`, связанные review items и provenance. Конкретные
значения полей не подставляются из шаблона: они берутся из выбранного item.
Реальные source values — в §3.

## 3. Source conflict inspector

`buildSourceConflicts()` собирает **все** observations работы по полю, а не
только строки, помеченные conflict. Поэтому в группе видны и conflict, и
non-conflict observations; это нужно, чтобы не потерять контекст.

Инспектор поддерживает поля `kind`, `publication_year`, `chapters`, `volumes`,
`mal_id`, `shikimori_id`, `title_ru`, `title_original`, `content_rating`,
`adult_status`. На каждый group выводится:

- source name, external ID, join key;
- исходное `value_json`;
- `observed_at`, verification status, source URL;
- review item ids и warning, если URL/verification отсутствуют;
- `canonicalValue: null`, `resolution: 'unresolved'`, `winnerSelected: false`,
- `nonCanonicalReason` из `canonical_action`/`action`.

### Реальный пример: work `0744658a…`, field `kind`

| Источник | External ID | Join key | Значение | Получено | Verification | URL |
|---|---|---|---|---|---|---|
| anilist | 35114 | 35114 | `ONE_SHOT` | 2026-11-22T00:00:00Z | recorded | https://anilist.co/manga/35114 |
| shikimori | 5114 | 35114 | `comic` | 2026-11-22T21:57:40.468Z | source_verified | https://shikimori.one/mangas/5114 |
| shikimori_candidates | — | 35114 | `comic` | 2026-11-22T19:11:27.784Z | candidate | https://shikimori.one/mangas/5114-romance-dawn |

`canonicalValue = null`, `winnerSelected = false`. Система **не** выбирает
`SOURCE_VERIFIED` как победителя, не перезаписывает `kind` и не удаляет
`ONE_SHOT`. Review item остаётся открытым.

## 4. Relation inspector

`buildRelationInspection()` показывает для каждой adaptation row:

- anime ID, comic work ID/internal key/title;
- raw и normalized type без переименования;
- direction, confidence, verification;
- `is_primary`, `is_public`;
- source name/URL и observed/checked timestamps;
- B1D hints с category/action/priority;
- `policyWarnings`. 

Правила:

| Правило | Поведение |
|---|---|
| `CHARACTER`, `PARENT`, `SIDE_STORY`, `SPIN_OFF` | остаются собой; никогда не `RELATED` |
| `RELATED` raw type | не поддерживается; warning, не нормализация |
| `ADAPTATION` | не означает первоисточник; direction = `unknown` |
| unconfirmed | `recorded`, `direction=unknown`, `confidence=unknown`, `is_primary=false`, `is_public=false` |
| B1D hint | review-only; не создаёт/не подтверждает связь |
| contradictory hints | показываются; direction не выбирается |

### Четыре contradictory anime ID

| Anime ID | Links | Hints | Статус |
|---|---:|---:|---|
| 85 | 9 | 4 | evidence conflict, direction unknown |
| 2291 | 2 | 3 | evidence conflict, direction unknown |
| 9963 | 2 | 3 | evidence conflict, direction unknown |
| 164212 | 2 | 3 | evidence conflict, direction unknown |

Всего 15 links затронуты. У каждого anime есть одновременно
`comicAdaptsAnime` и `adaptationAfterAnime`; это не доказательство ни одного
направления.

Пример строки anime 85:

| Поле | Значение |
|---|---|
| raw / normalized | `CHARACTER` / `CHARACTER` |
| direction / confidence | `unknown` / `unknown` |
| verification | `recorded` |
| is_primary / is_public | `false` / `false` |
| source | `anilist`, https://anilist.co/anime/85 |
| contradictory | `true` |

`ADAPTATION` для anime 85 также остаётся `direction=unknown`, `is_primary=false`.

## 5. UI и границы

- `/admin/comics/review` проверяет admin-cookie до чтения; при ошибке —
  redirect на `/admin/login`.
- Формы используют только GET. Мутирующих server actions/API нет.
- Внешние URL не загружаются сервером и не проксируются; это обычные ссылки.
- `loadReviewWorkspace`/`loadConflictWorkspace`/`loadRelationWorkspace`
  используют только `fetchAll`/`fetchCount` (GET).
- `fetchAll()` не возвращает частичную выборку: превышение `MAX_ROWS`,
  несовпадение known total или неизвестный total на лимите дают
  `CatalogReadIncompleteError`, а не пустой/усечённый экран.
- Нет изменения `comic_review_queue`, observations, adaptations, rights.
- Нет автоматического dedupe, canonical selection или закрытия review.

## 6. Ограничения

- Фильтрация/группировка очереди в памяти; при росте каталога нужна серверная
  пагинация.
- Relation inspector показывает до 100 связей без `anime_id`; с `anime_id` —
  все связи выбранного anime.
- Production RLS/PostgREST не тестировались; service key имеет write-права на
  уровне БД, поэтому read-only гарантия — кодовая.
- Source conflict группируется по work+field; одинаковые значения от разных
  источников всё равно остаются отдельными observations.
