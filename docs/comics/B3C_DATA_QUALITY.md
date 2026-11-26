# B3-C — качество данных, конфликты и adult-gate

Статус: **DONE** для local/disposable dry-run и PGlite-проверок.

Production/Supabase apply, PostgREST и live JWT/RLS: **NOT TESTED**.

Ветка: `data/aninova-3-b3-c-quality-relations-2026-11`.
База: `d89674fe28dacbdfd090c96189e63b2d36bbc32b`.

## 1. Что исправлено после B3-B

| Проблема B3-B | Решение B3-C |
|---|---|
| `MANGA` превращался в manga по умолчанию | без verified specific kind канонический `kind='unknown'` |
| `ONE_SHOT` терялся | сохраняется как `one_shot`; raw `ONE_SHOT` отдельно |
| страна/язык могли влиять на kind | kind никогда не выводится из страны/языка |
| конфликт MAL молча выбирал значение | оба значения сохраняются; при различии MAL не назначается |
| Shikimori id мог смешиваться с AniList join key | `external_id` принадлежит своему source, `join_key` — AniList |
| конфликты year/chapters/volumes затирались | observations + conflict review; каноническое значение `NULL` |
| name-only автор считался личностью | per-work name bucket, `source_person_id=NULL`, `is_public=false` |
| отсутствие adult-флага означало non-adult | `content_rating_status='unknown'`, public view закрыт |
| B1D hints не были видны в review | 120 hints перенесены с original payload и per-edge evidence |

## 2. Kind

Приоритет:

1. verified specific source kind (`manhwa`, `manhua`, `webtoon`, `comic`,
   `one_shot`);
2. AniList `ONE_SHOT` → `one_shot`;
3. AniList `MANGA` без specific kind → `unknown`;
4. нет данных → `unknown`.

`country_code` и язык не используются. Сырой формат хранится в
`comic_works.source_kind_raw`.

| Канонический kind | Кол-во |
|---|---:|
| `unknown` | 3 980 |
| `one_shot` | 74 |
| `comic` | 20 |
| `manhua` | 16 |
| `manhwa` | 10 |
| **Итого** | **4 100** |

Сырые форматы: `MANGA` — 4 014, `ONE_SHOT` — 86. Specific kind получен для
120 работ; 12 конфликтов `ONE_SHOT` против verified specific kind сохранены и
попали в review. 3 980 работ честно остаются `unknown`, потому что источник
не различает manga/manhwa/manhua.

## 3. Source observations

Таблица `comic_source_observations` хранит отдельное значение каждого
источника:

- `work_id`, `field_name`, `source_name`;
- `external_id` и отдельный `join_key`;
- `source_url`, `observed_at`, `confidence`;
- `verification_status`, `source_payload_hash`;
- `value_json`, `is_conflict`, `conflict_group`.

Поля: `kind`, `publication_year`, `chapters`, `volumes`, `mal_id`,
`shikimori_id`, `title_ru`, `title_original`, `content_rating`,
`adult_status`.

Всего ready observations: **45 188** (включая `title_original` из graph). Уникальность:
`(work_id, field_name, source_name, source_payload_hash)`. Повторный прогон
не создаёт дублей.

### 3.1. Политика конфликтов

- оба значения сохраняются;
- оба помечаются `is_conflict=true` и общим `conflict_group`;
- создаётся `source_metadata_conflict` review с
  `canonical_action='no_winner_no_overwrite'`;
- year/chapters/volumes/MAL при конфликте канонически `NULL`;
- title сохраняет verified metadata title для отображения, альтернативы
  остаются в observations/aliases;
- kind выбирается по правилу раздела 2, конфликт сохраняется.

Измерено:

| Поле | Конфликтных review items |
|---|---:|
| chapters | 455 |
| publication_year | 171 |
| volumes | 52 |
| kind | 12 |
| **Итого** | **690** |

690 items относятся к **617** работам (у части работ несколько полей).
Конфликтов title_ru и MAL graph↔metadata в текущем корпусе — 0; логика
покрыта синтетическими тестами.

## 4. MAL и внешние идентификаторы

| Source | Ready external ids | Комментарий |
|---|---:|---|
| AniList | 4 100 | primary, join key |
| MAL | 3 556 | 4 работы группы `124776` не получили MAL id |
| Shikimori | 2 261 | те же 4 работы не получили Shikimori id |
| **Итого** | **9 917** | 8 SKIP |

Правила:

- graph MAL == metadata MAL → назначить с provenance;
- присутствует только один → назначить с provenance;
- разные значения → **ни один** id не назначается, review содержит оба id,
  оба source name и AniList work id;
- один MAL id у разных работ → работы не сливаются, external id пропускается.

Текущий корпус: graph↔metadata MAL-конфликтов 0; известная группа `124776`
объединяет AniList работы `131323`, `131433`, `131454`, `131637` и для MAL,
и для Shikimori. Это 2 группы (`ambiguousExternalIds=2`) и 8 пропущенных
external rows. Ни одна работа не слита, ни один id не выбран автоматически.

`SourceEnvelope.external_id` всегда принадлежит указанному `source_name`:

| Источник | external_id | join_key |
|---|---|---|
| AniList graph | AniList manga id | тот же AniList id |
| Shikimori metadata | Shikimori id | AniList id |
| Shikimori candidate | `null` | AniList id |
| B1D hint | стабильный hint key | anime id, если он один |

AniList id не подписывается как Shikimori id.

## 5. Авторы: имя ≠ личность

- `comic_people` для name-only автора: `source_person_id=NULL`,
  `name_status='unverified'`,
  `identity_status='unidentified_name_bucket'`, `is_public=false`.
- Bucket key: `work_id + нормализованное имя`; одинаковые имена в разных
  работах не сливаются.
- `source_identified`/`manually_verified` требуют реального source person id
  или ручного подтверждения.

| Метрика | Значение |
|---|---:|
| Уникальные нормализованные имена | 5 115 |
| Из них повторяются в разных работах | 1 536 |
| Name buckets (work+name) | 9 007 |
| Идентифицированные авторы | **0** |
| Публичные авторы | **0** |

1 536 review items `ambiguous_people_identity` требуют ручной проверки, а не
слияния по имени. `authorNameRecords=5 115` — это имена, не люди;
`authorNameBuckets=9 007` — наблюдения, не профили.

## 6. Adult-статус

Статусы:

| Статус | Публично | Условие |
|---|---|---|
| `unknown` | нет | дефолт; данных недостаточно |
| `verified_non_adult` | да, при остальных gates | source + checked_at |
| `adult` | нет | source + checked_at; `is_adult=true` |

`is_adult` сохранён. SQL CHECK не допускает `verified_non_adult` с
`is_adult=true` и `adult` с `is_adult=false`.

Измерено: `unknown` — 4 100, `verified_non_adult` — 0, `adult` — 0.
Публичных works/chapters — 0. Отсутствие adult-флага не трактуется как
non-adult; название, страна и жанр не используются как эвристика.

Public views дополнительно к B3-B требуют `content_rating_status`,
`verified_non_adult` и `is_adult=false`. `unknown` и `adult` не попадают в
`comic_public_works`/`comic_public_chapters`.

## 7. Review queue

Всего 6 462 items; затронуто 4 005 работ.

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
| **Итого** | **6 462** |

B3-C добавил reason-коды `source_metadata_conflict`, `kind_unknown`,
`duplicate_public_title`, `relation_evidence_conflict`,
`ambiguous_people_identity`, `missing_provenance` и расширил CHECK аддитивно.

## 8. Ограничения

- Specific kind известен только для 120 работ; 3 980 остаются `unknown`.
- 617 работ имеют конфликты; они не разрешены автоматически.
- 0 adult classifications; adult-gate проверен синтетическими SQL/canary
  fixtures, а не реальными данными.
- 0 identified authors; 1 536 имён требуют ручной identity-проверки.
- `metadata-verified.json` заявляет 2 444 records, фактически 2 265;
  используется измеренное значение, warning сохранён.
- Supabase/PostgREST/live JWT/RLS не проверялись: **NOT TESTED**.

## 9. Проверки

- `tests/aninova3-comics-b3c.test.ts` — 10 tests.
- `supabase/tests/b3c_comics_quality.sql` — schema/RLS/public-gate contract.
- `scripts/comics-b3c-canary.mjs` — B3-A/B3-B/B3-C SQL, rollback/reapply,
  canary, idempotency, adult gate.
- Dry-run: `npm run comics:b3c:dry-run -- --now=2026-11-25T00:00:00.000Z`.
