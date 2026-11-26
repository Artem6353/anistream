# B3-C — anime↔comics relations, evidence и B1D review

Статус: **DONE** для local/disposable dry-run и PGlite-проверок.

Production/Supabase apply: **NOT TESTED**.

## 1. Границы

- `comic_adaptations` — только Anime↔Comics связи (anime id + comic work id).
- `comic_relations` — только Comics↔Comics; B3-C его не заполняет и не меняет.
- Все 5 748 graph edges остаются **recorded**, не confirmed.
- B1D — очередь evidence, а не решение: ни один hint не создаёт новую связь
  и не меняет `is_primary`/`is_public`/`verification_status`.

## 2. Нормализация relation type

Поддерживаются ровно девять raw types:

| Raw | Normalized |
|---|---|
| `ADAPTATION` | `ADAPTATION` |
| `ALTERNATIVE` | `ALTERNATIVE` |
| `CHARACTER` | `CHARACTER` |
| `PARENT` | `PARENT` |
| `PREQUEL` | `PREQUEL` |
| `SEQUEL` | `SEQUEL` |
| `SIDE_STORY` | `SIDE_STORY` |
| `SPIN_OFF` | `SPIN_OFF` |
| `OTHER` | `OTHER` |

Любой другой raw type → `unknown`; `RELATED` не синтезируется. `CHARACTER`,
`PARENT`, `SIDE_STORY`, `SPIN_OFF` не маппятся в `RELATED`.

Измерено:

| Raw type | Кол-во |
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
| **Итого** | **5 748** |

Все 5 748 нормализованы точным совпадением; `unknown` в текущем корпусе — 0.
Политика unknown проверена синтетическим `RELATED`/неизвестным типом.

## 3. Поля связи

`comic_adaptations` хранит: anime id, comic work id, raw type, normalized type,
direction, confidence, basis, source name/URL, observed/checked timestamps,
verification status, `is_primary`, `is_public`.

Для всех 5 748 строк:

| Поле | Значение |
|---|---|
| `direction` | `unknown` |
| `confidence_level` | `unknown` |
| `basis` | `anilist_relation_only` |
| `verification_status` | `recorded` |
| `is_primary` | `false` |
| `is_public` | `false` |

`ADAPTATION` не означает «комикс — первоисточник»: направление не доказано и
остаётся `unknown`.

## 4. Quality checks

| Проверка | Результат |
|---|---:|
| Всего graph edges | 5 748 |
| Вставлено adaptations | 5 748 |
| Missing anime | 0 |
| Missing comic | 0 |
| Duplicate edge | 0 |
| Contradictory direction | 4 anime id |
| Multiple primary | 0 |
| Unknown raw types | 0 |
| Missing evidence URL | 0 |

Контрадикторные направления: anime `85`, `2291`, `9963`, `164212` имеют
одновременно hints `comicAdaptsAnime` и `adaptationAfterAnime`. Это именно
конфликт evidence, а не доказательство направления; direction остаётся
`unknown`, hints сохранены отдельно.

Дубликаты определяются ключом `(anime_id, comic_work_id)`. При повторе
остаётся первое наблюдение, дубль попадает в `relationQuality.issues`,
повторный прогон не создаёт новую строку. В текущем корпусе дублей 0.

Один primary adaptation на anime обеспечивается partial unique index
`comic_adaptations_one_primary_idx (anime_id) where is_primary`; в B3-C
`is_primary` всегда false, поэтому multiple primary = 0.

## 5. B1D: 120 hints

Вход: `docs/data/aninova3-b1d-review-queue.json`.

| Категория | Строк | Что означает |
|---|---:|---|
| `adaptationAfterAnime` | 85 | комикс-адаптация началась после аниме; не доказательство |
| `multiSourceNeedsReview` | 30 | несколько источников/рёбер требуют проверки |
| `comicAdaptsAnime` | 4 | возможная обратная адаптация; comic edges идут позже |
| `duplicateMal` | 1 | MAL `124776` у четырёх AniList работ |
| **Итого** | **120** | **120 matched, 0 unmatched** |

Все 120 hints сохранены в `comic_review_queue` с original payload. 119 имеют
reason `relation_evidence_conflict`, 1 (`duplicateMal`) —
`duplicate_external_id`. Ни один hint не меняет `comic_adaptations`.

Каждый hint содержит:

- `b1d_category`, `b1d_external_id`, `b1d_link_status`;
- `anime_ids`, `comic_anilist_ids`;
- `linked_edges`: comic id, anime id, `matched`, `adaptation_id`,
  `raw_relation_type`, `normalized_relation_type`, `evidence_url`;
- `linked_adaptation_ids`;
- `source_name`, `source_url`, `source_payload_hash`, полный `source_payload`;
- `catalog_domain='comics'`, `comics_relevance='graph_candidate_unconfirmed'`;
- `action='review_only_no_adaptation_change'`.

Ключ hint включает категорию, anime ids, comic ids и первые 12 символов
payload hash. Это не позволяет двум разным строкам одной категории/anime
молча схлопнуться в один review item. Проверка: 120 входных строк → 120
review items.

### 5.1. duplicateMal `124776`

| AniList work | MAL | Shikimori |
|---|---:|---:|
| `131323` | 124776 | 124776 |
| `131433` | 124776 | 124776 |
| `131454` | 124776 | 124776 |
| `131637` | 124776 | 124776 |

Работы не слиты, MAL/Shikimori external ids не назначены (8 SKIP),
`ambiguous_external_id` review содержит все четыре work id. B1D duplicateMal
остаётся evidence-only.

### 5.2. Unmatched

В текущем корпусе unmatched hints — 0. Логика сохранения unmatched (отдельный
`missing_provenance` review с `unmatched_reason`) покрыта unit test, чтобы
будущие hint-и не терялись.

## 6. Review queue, связанная с relations

- `unsupported_relation` — неизвестный raw type; сохраняется raw + unknown.
- `missing_provenance` — нет anime/comic/evidence URL.
- `relation_evidence_conflict` — B1D hints и конфликтующие evidence.
- `source_conflict` — duplicate edge.
- `ambiguous_external_id` — MAL/Shikimori группа.
- `missing_provenance` для B1D unmatched.

Стабильные ключи review:
`work_id|item_type|reason|item_ref`; ID — UUID из этого ключа. Сортировка
review и operations детерминирована.

## 7. Canary

20 работ, 36 adaptations, 177 review items. B1D в canary представлен минимум
одной работой каждой категории:

| Категория | Работ в canary |
|---|---:|
| `adaptationAfterAnime` | 7 |
| `multiSourceNeedsReview` | 1 |
| `comicAdaptsAnime` | 1 |
| `duplicateMal` | 4 (вся группа) |

Canary проверяет: 36 canary adaptations, все B1D категории, `duplicate_mal=0`,
`promoted_adaptations=0`, `unknown_normalized=0`, `direction=unknown`.
Полные 5 748 edges проверяются dry-run quality counters, а не 20-work canary.

## 8. Ограничения

- Направление всех связей неизвестно; ручное подтверждение не выполнялось.
- B1D hints не являются подтверждёнными связями.
- `comic_relations` (Comics↔Comics) не заполнялся.
- В реальном корпусе нет unknown raw types, missing evidence, duplicate edges;
  эти ветки проверены синтетическими тестами.
- Supabase/PostgREST/live JWT/RLS: **NOT TESTED**.

## 9. Команды

```powershell
npm run comics:b3c:dry-run -- --now=2026-11-25T00:00:00.000Z --canary-size=20
node scripts/comics-b3c-canary.mjs
npx vitest run tests/aninova3-comics-b3c.test.ts
```
