# B3-B — source adapters, normalization и dry-run import

Статус: **DONE** для локального dry-run на сохранённых артефактах.

Apply в БД: **не выполнялся**; Supabase/PostgREST/live JWT: **NOT TESTED**.

Ветка: `data/aninova-3-b3-b-adapters-dryrun-2026-11`.

База: `b61403e65daeeecd3287db2ca525856372fef407`.

## 1. Границы

B3-B читает только уже сохранённые локальные артефакты. Он **не** делает сетевых
запросов, **не** открывает БД, **не** применяет SQL и **не** создаёт публичные
данные. По умолчанию и единственный режим CLI — `dry-run`.

Запрещены и отклоняются:

- `--apply`, `--execute`, `--mode=apply`;
- `SUPABASE_URL`, production service-role key, remote connection strings;
- массовые запросы к MangaDex/AniList/Shikimori;
- скачивание страниц, mirroring, reader/embed/hosted;
- создание прав, глав, reading sources или публикация работ.

Guard: `lib/aninova3/comics/import/safety.ts` (`assertLocalDatabaseUrl`,
`assertNoRemoteDatabaseEnvironment`, `assertApplyMode`).

## 2. Входы и checksums

| Артефакт | Что читается | Checksum |
|---|---|---|
| `lib/aninova3/comics/source-graph.json` | 4 100 comics, 5 748 anime↔comic edges | `e7e98f865478cff0ef3489761b37adc3b8d0dd51987526580136afaff953fb35` |
| `lib/aninova3/comics/metadata-verified.json` | 2 265 records (не `meta.total=2444`) | `a23de510d751e34aeaf6e70caaf6a5f08abb39eba1e2dd7d866a7eec558d1188` |
| `lib/aninova3/comics/metadata-candidates.json` | 2 170 candidates | `61b78f9291a135edfa75b98d478d1732443e969cb6d7f1ef850e44b5cf0f13be` |
| `docs/data/aninova3-b1d-review-queue.json` | 1 `duplicateMal` hint | `6c9a0d1b9ec4d1af8ec5a2749ddfea85c7cecc717bbcafe5d37c4e173a6dc87e` |
| `lib/data/titles.json` | 8 033 anime id для FK-проверки | `1b002163278627192bfa7bd0d80ff39b9264ac7aaa42d7fd9ab23ce729938d1f` |

Checksums и plan/canary hashes сохранены в
`docs/data/aninova3-b3b-source-checksums.json`.

B1D-файл содержит 120 строк в четырёх категориях, но adapter нормализует
только `duplicateMal` (1). Остальные 119 — anime-side review hints
(`multiSourceNeedsReview`, `comicAdaptsAnime`, `adaptationAfterAnime`); они не
являются canonical comic records и не копируются как отдельные review rows.
Все соответствующие graph edges всё равно остаются unconfirmed. Это явное
ограничение, а не полный импорт B1D.

## 3. Контракт adapter

`SourceAdapter` (`lib/aninova3/comics/import/adapters.ts`):

```ts
read(raw: unknown): unknown
validate(value: unknown): ValidationIssue[]
normalize(value: unknown, context: AdapterContext): AdapterBatch
```

Каждый нормализованный факт несёт `SourceEnvelope`:

- `source_name`;
- `external_id`;
- `source_url`;
- `fetched_at`;
- `source_snapshot_at`;
- `terms_review_status`;
- `attribution_requirements`;
- `confidence`;
- `verification_status`;
- `source_payload_hash` (SHA-256 канонического JSON);
- `raw_relation_type` для рёбер.

Все четыре адаптера выставляют `terms_review_status='unknown'` и пустой
`attribution_requirements`. Это честное «не проверено», а не разрешение.

## 4. Состав адаптеров

| Adapter | Источник | Выход |
|---|---|---|
| `AniListGraphAdapter` | `source-graph.json` | comics, raw edges, declared `meta.comicsKept` |
| `ShikimoriMetadataAdapter` | `metadata-verified.json` | verified/mismatch/pending/no-title records |
| `MetadataCandidatesAdapter` | `metadata-candidates.json` | candidates, без публикации |
| `B1DReviewQueueAdapter` | B1D queue | `duplicateMal` hints; остальные anime-side hints не копируются |

Adapter не ходит в сеть. `source_url` формируется только из известного id
(`https://anilist.co/manga/<id>`, `https://myanimelist.net/manga/<id>`,
`https://shikimori.one/mangas/<id>`) или берётся из artifact, если это HTTPS.

## 5. Стадии pipeline

1. **fetch** — отсутствует; читаются только сохранённые файлы.
2. **validate** — shape, ids, duplicate keys, URL/date, declared/measured total.
3. **normalize** — `ComicWork`, external ids, aliases, people/credits,
   unconfirmed anime links, review hints.
4. **external-ID matching** — AniList/MAL/Shikimori; ambiguous ids не
   присваиваются.
5. **dedup** — external id/title/internal key/slug groups; ничего не удаляется.
6. **review queue** — конфликты, missing RU title, mismatch, ambiguous ids.
7. **import plan** — `INSERT/UPDATE/SKIP/REJECT`, deterministic hash.
8. **verify** — counts, checksums, rerun determinism; DB apply не входит.

## 6. Нормализация

### 6.1 Работа

- `id = stableUuid('work:<anilist_id>')`, `internal_key = comic:anilist:<id>`.
- `publication_status='draft'`, `published_at=NULL`, `is_adult=false`.
- `description_ru=NULL`, `release_date=NULL` — не выдумываются.
- `title_ru` только при `SOURCE_VERIFIED` + Cyrillic; original/native никогда
  не fallback для русского.
- `cover_url` только HTTPS из source; genres только verified.

### 6.2 External IDs

- 4 100 AniList (primary);
- 3 556 MAL;
- 2 261 Shikimori;
- 8 ambiguous MAL/Shikimori (`124776`) пропущены и отправлены в review.

### 6.3 Aliases

| Тип | Кол-во | Public |
|---|---:|---|
| `original_title` | 4 100 | нет |
| `native_title` | 4 092 | нет |
| `official_russian` | 2 137 | только source verified |
| `alternative_title` | 190 | нет (license claim/candidate) |

Alias uniqueness scoped by `work_id + source + type + normalized title`;
одноимённые работы не теряют alias.

### 6.4 People/credits

- 5 115 people, 9 007 credits;
- только exact source author names, `source_person_id=NULL`,
  `name_status='unverified'`, `is_public=false`;
- approximate/cross-source merge отсутствует. Это ограничение данных, не
  подтверждённая личность.

### 6.5 Anime↔comic links

Все 5 748 рёбер пишутся как unconfirmed `comic_adaptations`-строки:

- `raw_relation_type` сохранён (`ADAPTATION` 3 711, `ALTERNATIVE` 1 271,
  `CHARACTER` 247, `SPIN_OFF` 190, `SIDE_STORY` 110, `OTHER` 106, `PREQUEL` 54,
  `SEQUEL` 36, `PARENT` 23);
- `direction='unknown'`, `confidence_level='unknown'`,
  `basis='anilist_relation_only'`;
- `is_primary=false`, `is_public=false`, `verification_status='recorded'`.

`RELATED` не создаётся; `ADAPTATION` не подтверждает первоисточник.

## 7. Dedup

Проверяются:

- duplicate internal key/slug;
- duplicate AniList/MAL/Shikimori;
- duplicate public Russian title;
- conflicting AniList vs Shikimori fields (year/chapters/volumes/kind);
- ambiguous external id;
- same work with different external ids.

Ничего не auto-delete/auto-merge/auto-overwrite. Конфликт →
`comic_review_queue` + annotation, provenance сохраняется.

Фактический результат: 2 external groups (MAL/Shikimori `124776`, 4 работы),
0 public title groups, 8 SKIP для ambiguous ids. Известный MAL-дубль
`124776` не слит; все четыре работы остаются отдельными.

## 8. Dry-run и canary

CLI:

```powershell
npm run comics:b3b:dry-run
```

Defaults: 20 canary works (допустимо 10–50), compact report + checksums.
Full operations не пишутся в коммит: report содержит summaries и work ids.

Canary: 20 работ, включая `131323`, `131433`, `131454`, `131637`, `30025`,
`41203`, `30001`. Disposable PGlite apply подтвердил:

- 20 works, 52 external ids, 64 aliases, 47 people, 59 credits, 65 links,
  31 review rows;
- 0 non-draft/published, 0 public works/chapters, 0 rights/chapters/sources;
- 0 ambiguous MAL/Shikimori rows, 0 promoted adaptations, 0 public
  original/native aliases;
- повторный apply: 0 новых строк, counts не изменились.

Canary apply — **только local/disposable test harness**, не CLI и не
production path.

## 9. Ограничения

- Нет DB apply в коде B3-B; canary SQL применялся внешним test harness.
- Postgres/Supabase/PostgREST/live JWT: **NOT TESTED**.
- 583 warnings — source conflicts и meta mismatch; 709 работ в review.
- People — name-only, без source staff id.
- `is_adult=false` — schema default, а не подтверждённый source fact.
- Нет прав/глав/reading sources; публикация невозможна.
