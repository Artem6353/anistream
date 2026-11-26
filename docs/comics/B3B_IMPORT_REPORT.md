# B3-B — отчёт о dry-run импорте Comics

Дата: 2026-11-26.

Ветка: `data/aninova-3-b3-b-adapters-dryrun-2026-11`.

База: `b61403e65daeeecd3287db2ca525856372fef407`.

Итоговый commit SHA фиксируется в ответе после push; документ описывает
содержимое ветки, а не production-состояние.

## 1. Краткий итог

**DONE** для локального dry-run, нормализации, dedup и canary на disposable
PGlite. **PARTIAL** для импортного контура: DB apply в B3-B отсутствует по
условию задачи. **NOT TESTED** для Supabase/PostgREST/live JWT/production.

Импорт не создаёт публичных работ, прав, глав, reading sources, reader/embed,
hosted pages. 4 100 работ остаются `draft`, `published_at=NULL`.

## 2. Реальные счётчики

| Метрика | Значение |
|---|---:|
| Source graph comics | 4 100 |
| Source graph edges | 5 748 |
| Verified metadata records (измерено) | 2 265 |
| Verified metadata declared `meta.total` | 2 444 |
| Metadata candidates | 2 170 |
| Normalized works | 4 100 |
| Ready dry-run INSERT works | 4 100 |
| Ready external ids | 9 917 |
| Ready aliases | 10 519 |
| Ready people | 5 115 |
| Ready credits | 9 007 |
| Ready anime↔comic links | 5 748 |
| Skipped external-id operations | 8 |
| Works requiring review | 709 |
| Review queue rows | 831 |
| Duplicate candidate groups | 2 |
| Rejected works | 0 |
| Approved rights | 0 |
| Public chapters | 0 |
| Warnings | 583 |
| Errors | 0 |

`verifiedMetaDeclaredTotal=2444` сохранён как audit-факт, но **не** используется
для counts. Авторитетны измеренные `records=2265`.

## 3. План операций

| Table | INSERT | UPDATE | SKIP | REJECT |
|---|---:|---:|---:|---:|
| `comic_works` | 4 100 | 0 | 0 | 0 |
| `comic_external_ids` | 9 917 | 0 | 8 | 0 |
| `comic_aliases` | 10 519 | 0 | 0 | 0 |
| `comic_people` | 5 115 | 0 | 0 | 0 |
| `comic_credits` | 9 007 | 0 | 0 | 0 |
| `comic_adaptations` | 5 748 | 0 | 0 | 0 |
| `comic_relations` | 0 | 0 | 0 | 0 |
| `comic_review_queue` | 831 | 0 | 0 | 0 |
| `comic_reading_sources` | 0 | 0 | 0 | 0 |
| `comic_chapters` | 0 | 0 | 0 | 0 |
| `comic_rights` | 0 | 0 | 0 | 0 |

Plan hash: `41135f99cce0ca4543ac169cc8ea420c03edac5a61037fc3568f51e7a69915ff`.

Canary hash: `35dec4ac0c80f6eecf19990799dacb3dd6d6a3136e6459ba884227a47a53412b`.

## 4. Review queue

| Reason | Row count |
|---|---:|
| `source_conflict` | 695 |
| `name_mismatch` | 67 |
| `manual` (pending review) | 33 |
| `missing_ru_title` | 28 |
| `ambiguous_external_id` | 8 |

695 `source_conflict` — это конфликты полей AniList vs Shikimori (year,
chapters, volumes, kind) и title-not-Cyrillic, а не подтверждённые ошибки
канона. 583 warning-строк включают 581 work-level conflict warning и 2
meta-total mismatch; queue rows могут быть больше, потому что один work может
дать несколько conflict annotations.

## 5. Дубликаты и ambiguous ids

Единственная external-группа: MAL и Shikimori `124776` у четырёх AniList
работ:

- `131323`;
- `131433`;
- `131454`;
- `131637`.

Все четыре — `PENDING_REVIEW`, русское название не публикуется. План:

- MAL `124776` и Shikimori `124776` не присвоены ни одной из четырёх;
- 8 SKIP-операций с уникальными ключами;
- каждая работа получает review item;
- работы не сливаются, external id не overwrite-ится.

`titleGroups=0`: среди 2 137 `SOURCE_VERIFIED` русских названий нет двух
одинаковых после нормализации. Это измеренный ноль, а не отключённая
проверка; synthetic test покрывает duplicate public title.

## 6. Source review / legal

| Source | Records | Terms review | Attribution |
|---|---:|---|---|
| AniList graph | 4 100 comics / 5 748 edges | `unknown` | не заявлена |
| Shikimori verified | 2 265 | `unknown` | не заявлена |
| AniList candidates | 2 170 | `unknown` | не заявлена |
| B1D queue | 1 `duplicateMal` hint (из 120 строк) | `unknown` | не заявлена |

`licenseNameRu` (195 claim) — **не** permission. Approved rights = 0.
B1D `multiSourceNeedsReview`/`comicAdaptsAnime`/`adaptationAfterAnime` (119
anime-side hints) не копируются в comic review rows; их graph edges остаются
unconfirmed.

Публикационные гейты:

- work: approved + published_at + verified RU title + metadata right с
  evidence/reviewer/time;
- cover: отдельный approved cover right;
- chapter: public/ru/page_count>0 + active source + approved terms с
  `terms_url`/`terms_checked_at`/`terms_reviewed_by` + approved chapter_link/embed
  с evidence/reviewer/time + **собственный URL главы**;
- work-level source URL не подставляется;
- expired/unknown/pending/rejected никогда не открывают чтение;
- `licensed_hosted` не проецируется.

## 7. Canary (disposable PGlite)

20 работ: `30001`, `30002`, `30004`, `30007`–`30017`, `30025`, `41203`,
`131323`, `131433`, `131454`, `131637`.

| Проверка | Результат |
|---|---|
| Works | 20 |
| External ids | 52 |
| Aliases | 64 |
| People / credits | 47 / 59 |
| Anime↔comic links | 65 |
| Review rows | 31 |
| Non-draft / published | 0 |
| Public works / chapters | 0 / 0 |
| Rights / chapters / sources | 0 / 0 / 0 |
| Ambiguous MAL/Shikimori rows | 0 |
| Promoted adaptations | 0 |
| Public original/native aliases | 0 |
| Rerun inserts | 0 |
| Idempotent counts | да |

Canary SQL применялся внешним harness на disposable PGlite. Это доказывает
форму плана и гейты, но не заменяет staging Supabase.

## 8. Проверки

| Проверка | Статус |
|---|---|
| `npm run typecheck` | DONE |
| `npm run lint` | DONE (0 errors; pre-existing warnings) |
| `npx vitest run tests/aninova3-comics-b3b*.test.ts` | DONE (16 tests) |
| `npm run build` | DONE |
| PGlite B3-A foundation + RLS | DONE |
| PGlite B3-B migration + `b3a_comics_rls.sql` + `b3b_comics_gates.sql` | DONE |
| B3-B rollback/reapply | DONE (PGlite) |
| Dry-run CLI | DONE |
| Canary apply/idempotency | DONE (PGlite) |
| Supabase CLI/PostgREST/live JWT | NOT TESTED |
| Real local Postgres | NOT TESTED (нет psql/pg_ctl) |
| Production apply | NOT TESTED / не выполнялся |
| MangaDex mass requests/page mirroring | не выполнялись |

## 9. Риски

1. **Artifact drift**: checksums фиксируют входы; при изменении source-graph
   или metadata нужен новый dry-run, иначе plan hash не совпадёт.
2. **Meta mismatch**: 2 444 vs 2 265; нельзя использовать declared total.
3. **Source conflicts**: 695 queue rows требуют ручного review;
   автоматический выбор значения запрещён.
4. **Ambiguous MAL/Shikimori**: четыре работы не имеют этих ids; это
   осознанно, не потеря данных.
5. **Name-only people**: нет source staff id; нельзя публиковать/мержить
   личности без отдельного контракта.
6. **No DB apply**: план не проверен на реальном Postgres/Supabase.
7. **Schema migration**: approved rights/terms без evidence остановят B3-B
   preflight; это защита, не баг.

## 10. Rollback

- B3-B schema rollback:
  `supabase/rollback/20261124_comics_b3b_rollback.sql`;
- возвращает B3-A views/constraint, удаляет B3-B columns;
- требует остановки записи и архивации данных, если они уже используют
  chapter `embed_url`/`terms_reviewed_by`;
- цикл apply → rollback → reapply проверен на disposable PGlite;
- production restore из backup/PITR — **NOT TESTED**.

## 11. Что не сделано намеренно

- Нет PR/merge/deploy.
- Нет production DB connection.
- Нет создания прав/глав/reading sources.
- Нет reader/embed/hosted/pages.
- Нет автоматического merge дублей.
- Нет объявления production-ready: для этого нужны staging Supabase, real
  JWT/PostgREST, owner approval и отдельный apply.
