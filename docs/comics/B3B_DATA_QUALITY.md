# B3-B — качество данных и ограничения

Статус: **DONE** для измеренного аудита локальных артефактов.

Production/Supabase данные: **NOT TESTED**.

## 1. Что измерено

| Артефакт | Факт | Declared |
|---|---:|---:|
| `source-graph.json` comics | 4 100 | `meta.comicsKept=4100` |
| `source-graph.json` edges | 5 748 | `meta.edgesKept=5748` |
| `metadata-verified.json` records | 2 265 | `meta.counts.total=2444` |
| `metadata-candidates.json` candidates | 2 170 | `meta.counts.total=2444` |
| `titles.json` anime ids | 8 033 | — |
| B1D queue `duplicateMal` | 1 | — |
| B1D queue всего строк | 120 | — |

`metadata-verified.json` содержит 2 265 фактических записей, хотя заявляет
2 444. Разница 179 не восстанавливается и не добивается пустыми записями.
Импорт использует только измеренные records; declared total остаётся в
audit/warning.

## 2. Статусы verified metadata

| Status | Кол-во | Что означает |
|---|---:|---|
| `SOURCE_VERIFIED` | 2 137 | русское название подтверждено источником; public title разрешён |
| `NAME_MISMATCH` | 67 | название не совпало; public title запрещён |
| `PENDING_REVIEW` | 33 | ручная проверка; public title запрещён |
| `NO_RU_TITLE` | 28 | нет русского названия; public title запрещён |

Всего 2 265. Публичных русских названий — 2 137, не 2 265 и не 2 444.

## 3. Внешние идентификаторы

| Source | Ready rows | Комментарий |
|---|---:|---|
| AniList | 4 100 | primary, по одной на работу |
| MAL | 3 556 | 4 ambiguous MAL rows не присвоены |
| Shikimori | 2 261 | 4 ambiguous Shikimori rows не присвоены |
| **Итого** | **9 917** | 8 SKIP |

Граф содержит 3 560 comics с MAL id; 4 из них входят в группу `124776` и
поэтому не получают MAL external id в плане. Это не потеря: id сохранён в
review/raw source, но не назначен канонической работе.

## 4. Aliases

| Alias type | Кол-во | Public |
|---|---:|---|
| `original_title` | 4 100 | нет |
| `native_title` | 4 092 | нет |
| `official_russian` | 2 137 | да, source verified |
| `alternative_title` | 190 | нет |

190 alternative — кандидаты/`licenseNameRu`, не official. Original/native не
используются как русский fallback. Одноимённые работы сохраняют свои aliases:
ключ включает `work_id`.

## 5. People / credits

- 5 115 people, 9 007 credits.
- Источник — exact `authors` из AniList graph.
- `source_person_id=NULL`, `name_status='unverified'`, `is_public=false`.
- Нет source staff id, нет cross-source merge, нет approximate matching.

Это пригодно только для внутренней атрибуции/кредитов. Публичный authors view
потребует отдельного контракта и подтверждения identity.

## 6. Anime↔comic links

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

Все строки unconfirmed: `direction=unknown`, `confidence_level=unknown`,
`is_primary=false`, `is_public=false`, `verification_status=recorded`.
Нет нормализации в `RELATED`; `ADAPTATION` — raw source type, не
доказательство первоисточника.

## 7. Конфликты AniList vs Shikimori

581 work-level warning по `SOURCE_VERIFIED` работам:

| Поля | Кол-во warning |
|---|---:|
| chapters | 372 |
| year | 126 |
| year + chapters | 28 |
| chapters + volumes | 22 |
| kind | 14 |
| volumes | 12 |
| year + chapters + volumes | 4 |
| year + volumes | 3 |

Всего 581 conflict warning + 2 meta-total warning = 583 warnings.

В review queue 695 `source_conflict` rows: conflict annotation строится для
всех работ, включая `NAME_MISMATCH`/`PENDING_REVIEW`, поэтому строк больше,
чем warning-строк. Ни один конфликт не разрешён автоматически.

Пример известного расхождения: MAL `124776` сообщает 2010/26 vols/67 chapters
для всех четырёх работ, тогда как graph years/chapters/volumes различаются
(2010/2011/2013/2014; chapters 14/16/21/16; volumes 7/8/7/4). Работы не
сливаются; значения не перезаписываются.

## 8. Review queue

| Reason | Rows |
|---|---:|
| `source_conflict` | 695 |
| `name_mismatch` | 67 |
| `manual` | 33 |
| `missing_ru_title` | 28 |
| `ambiguous_external_id` | 8 |
| **Итого** | **831** |

709 уникальных работ требуют review. Это очередь, а не блокировка импорта
черновиков: работы всё равно `draft`/non-public.

## 9. Дубликаты

- external groups: 2 (MAL `124776`, Shikimori `124776`; 4 AniList works);
- public title groups: 0;
- duplicate internal key/slug: 0;
- duplicate alias в пределах работы: 0 после scoped key;
- conflicting kind: 14 warnings;
- same work/different external ids: покрыто external-group проверкой.
- B1D: только `duplicateMal` даёт external-id hint; 119 anime-side hints не
  копируются как comic review rows (см. §12).

Ничего не удалено/слито. 4 работы остаются отдельными; ambiguous external ids
не назначены.

## 10. Publication / rights quality

| Показатель | Значение |
|---|---:|
| Approved rights | 0 |
| Reading sources | 0 |
| Chapters | 0 |
| Public works | 0 |
| Public chapters | 0 |
| Licensed title claims | 195 (не права) |

`is_adult=false` — schema default, не подтверждённый source fact. Даже при
появлении approved rights публикация требует published_at, verified RU title,
chapter URL и действующих прав.

## 11. Quality gates

- `meta.total` не используется для counts;
- public title только `SOURCE_VERIFIED` + Cyrillic;
- candidates/mismatch/no-title — internal aliases;
- original/native — never public fallback;
- ambiguous ids — SKIP + review;
- conflicts — review, no auto-merge;
- all works draft; no rights/chapters/sources created;
- checksums фиксируют входные артефакты;
- canary применяется только к disposable PGlite.

## 12. Ограничения и рекомендации

1. Supabase/Postgres/PostgREST/live JWT: **NOT TESTED**; нужен staging apply.
2. Нет source staff id для people; публичный authors view отложить.
3. 581 source conflict требует ручного разрешения; нельзя выбирать поле
   эвристикой.
4. Metadata total расхождение должно быть исправлено upstream; импорт не
   должен маскировать его.
5. MAL `124776` требует отдельного manual review; текущий SKIP — безопасное
   состояние.
6. При изменении артефактов пересчитать checksums/plan hash и повторить
   canary.
7. 119 anime-side B1D hints не импортированы как review rows; если нужен
   полный anime-side review, это отдельный контракт/таблица.
