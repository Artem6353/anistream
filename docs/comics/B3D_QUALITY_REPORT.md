# B3-D — quality report и publication gates

Статус артефакта: **сгенерирован локально, production Supabase не читался**.

Production Supabase / PostgREST / JWT / RLS: **NOT TESTED**. Цифры ниже —
проекция детерминированного B3-C dry-run plan из committed source artifacts,
а не live-снимок production.

## 1. Артефакт

| Поле | Значение |
|---|---|
| Файл | `docs/data/aninova3-b3d-quality-report.json` |
| Schema | `b3d.1` |
| Catalog schema | `b3c.1` |
| Сгенерирован | `2026-11-26T22:51:03.315Z` |
| Commit SHA при генерации | `e1f752490a761aa1c86d4cf608b687591ae3042b` |
| Plan hash | `bc97255db9c212bbb4d5af409eb8c211097329509ab069491ac5415b8e2e1fd3` |
| Report checksum | `51e1a2073b99c576445e4b44e4891f1f132f8757cbf6ae0c7f18bd9a533a9070` |
| Errors / warnings | `0` / `3` |

`commit_sha` — `HEAD` на момент генерации. Файл отчёта коммитится следующим
коммитом, поэтому его собственный SHA в отчёте не указан (иначе поле было бы
невозможно заполнить детерминированно).

### Input checksums

| Artifact | SHA-256 |
|---|---|
| `lib/aninova3/comics/source-graph.json` | `e7e98f865478cff0ef3489761b37adc3b8d0dd51987526580136afaff953fb35` |
| `lib/aninova3/comics/metadata-verified.json` | `a23de510d751e34aeaf6e70caaf6a5f08abb39eba1e2dd7d866a7eec558d1188` |
| `lib/aninova3/comics/metadata-candidates.json` | `61b78f9291a135edfa75b98d478d1732443e969cb6d7f1ef850e44b5cf0f13be` |
| `docs/data/aninova3-b1d-review-queue.json` | `6c9a0d1b9ec4d1af8ec5a2749ddfea85c7cecc717bbcafe5d37c4e173a6dc87e` |
| `lib/data/titles.json` | `1b002163278627192bfa7bd0d80ff39b9264ac7aaa42d7fd9ab23ce729938d1f` |
| `plan_hash` | `bc97255db9c212bbb4d5af409eb8c211097329509ab069491ac5415b8e2e1fd3` |

## 2. Metadata

| Метрика | Значение |
|---|---:|
| Работ всего | 4 100 |
| draft | 4 100 |
| approved | 0 |
| published | 0 |
| kind unknown | 3 980 |
| one_shot | 74 |
| comic | 20 |
| manhua | 16 |
| manhwa | 10 |
| RU title подтверждён | 2 137 |
| RU title не подтверждён | 1 963 |
| name mismatch | 67 |
| external IDs | 9 917 |
| aliases | 10 519 |
| people | 9 007 |
| credits | 9 007 |
| adaptations | 5 748 |
| source observations | 45 188 |

## 3. Quality / identity

| Метрика | Значение |
|---|---:|
| works с source conflict | 617 |
| source-conflict review items | 690 |
| observation conflict rows | 1 558 |
| ambiguous external ID review items | 9 |
| name mismatch works | 67 |
| unidentified author buckets | 9 007 |
| identified authors | 0 |
| ambiguous people identities | 1 536 |
| missing provenance items | 0 |
| observations без URL | 0 |
| unknown adult status | 4 100 |
| contradictory relations | 4 |
| duplicate candidates | 1 |

Контрадикторные anime ID: `85`, `2291`, `9963`, `164212`. Это только
наличие обоих direction hints; направление не выбрано, связи не подтверждены.

> Терминология: B3-D `ambiguous_external_ids` и `duplicate_candidates` — это
> **review items** (очередь действий), а не число dedup-групп. B3-C canary
> отдельно измеряет `ambiguousExternalIds=2` (уникальные source/external-ID
> группы) и `duplicateCandidates=2` (dedup-группы). Эти числа не взаимозаменяемы
> и в отчёте не смешиваются.

## 4. Review queue

| Метрика | Значение |
|---|---:|
| Всего | 6 462 |
| open | 6 462 |
| in_review | 0 |
| resolved | 0 |
| dismissed | 0 |
| low / medium / high severity | 61 / 6 325 / 76 |

| Reason | Кол-во |
|---|---:|
| `kind_unknown` | 3 980 |
| `ambiguous_people_identity` | 1 536 |
| `source_metadata_conflict` | 690 |
| `relation_evidence_conflict` | 119 |
| `name_mismatch` | 67 |
| `manual` | 33 |
| `missing_ru_title` | 28 |
| `ambiguous_external_id` | 8 |
| `duplicate_external_id` | 1 |
| остальные reason | 0 |

`source_conflict` reason отдельно = 0; source-conflict metadata использует
`source_metadata_conflict` (690). `source_conflict_items` в дашборде — сумма
source-conflict reason, а не только `source_conflict`.

## 5. Source conflicts

| Метрика | Значение |
|---|---:|
| Работ с конфликтом | 617 |
| Review items | 690 |
| Conflict observation rows | 1 558 |
| Групп (work + field) | 690 |
| `kind` groups | 12 |
| `publication_year` groups | 171 |
| `chapters` groups | 455 |
| `volumes` groups | 52 |

Каждая группа имеет `canonicalValue=null`, `resolution='unresolved'`,
`winnerSelected=false`. Observations не удаляются; все source values, external
ID, join keys, fetched time и URL сохраняются. Пример — в
`B3D_REVIEW_QUEUE.md`.

## 6. Relations

| Метрика | Значение |
|---|---:|
| Всего | 5 748 |
| recorded | 5 748 |
| source_verified | 0 |
| editorially_verified | 0 |
| disputed | 0 |
| primary | 0 |
| public | 0 |
| missing evidence URL | 0 |
| policy violations | 0 |
| contradictory links | 15 |
| contradictory anime IDs | 4 |

Raw/normalized распределение: `ADAPTATION` 3 711, `ALTERNATIVE` 1 271,
`CHARACTER` 247, `SPIN_OFF` 190, `SIDE_STORY` 110, `OTHER` 106, `PREQUEL` 54,
`SEQUEL` 36, `PARENT` 23. `RELATED` не синтезируется; CHARACTER/PARENT/SIDE_STORY/
SPIN_OFF не превращаются в RELATED; ADAPTATION не объявляется первоисточником.

## 7. Publication gates

| Gate | Факт | Статус |
|---|---:|---|
| Все работы draft | 4 100 | PASS |
| public works | 0 | PASS |
| public chapters | 0 | PASS |
| approved rights | 0 | PASS |
| approved works | 0 | PASS |
| verified_non_adult | 0 | PASS |
| adult | 0 | PASS |
| relation primary | 0 | PASS |
| relation public | 0 | PASS |
| identified authors | 0 | PASS |

`publishable_works = 0`, `public_works = 0`, `chapters = 0`,
`reading_sources = 0`. Метаданные есть у 4 100 работ, но ни одна не является
публикуемой для чтения. Это ожидаемое безопасное состояние, а не ошибка
дашборда.

## 8. Comparison

Сравнение с предыдущим снимком **недоступно**:

```json
{
  "available": false,
  "reason": "previous_report_not_provided",
  "review_queue_delta": null,
  "new_conflict_keys": null,
  "resolved_conflict_keys": null,
  "eligibility_changes": null
}
```

История не выдумывается. Для следующего запуска:

```bash
npm run comics:b3d:report -- --previous=docs/data/aninova3-b3d-quality-report.json
```

При наличии previous отчёт добавляет review-queue delta, new/resolved conflict
keys и eligibility changes.

## 9. Детерминизм и проверка

- `generated_at` — единственное намеренно изменяемое поле; run metadata отделена.
- `report_checksum` — SHA-256 канонического JSON без самого поля checksum.
- Одинаковые source artifacts + `--now` + `--commit` дают одинаковый checksum.
- `errors=0`; warnings: несовпадение `meta.total` (2 444 vs 2 265), то же
  предупреждение из pipeline и 4 contradictory anime ids.
- Отчёт не делает внешних запросов и не применяет SQL.

## 10. Ограничения

- Это plan-derived отчёт, не production snapshot. Live Supabase counters не
  проверялись.
- `ambiguous external ID` измеряется в review items, не в уникальных группах.
- `published` в projection равен 0; формула учитывает approved + published_at,
  но фактических approved записей нет.
- PGlite проверяет SQL-контракты и read-only поведение, но не заменяет
  production PostgREST/RLS.
