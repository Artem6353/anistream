# B3-C/B3-C.1 — import report

Статус: B3-C — **DONE**; B3-C.1 integrity hardening — **DONE** для
dry-run, local SQL contracts и PGlite canary.

**Не production-ready.** Production/Supabase apply, PostgREST, live JWT/RLS:
**NOT TESTED**. PR/merge/deploy не выполнялись.

- Ветка B3-C.1: `data/aninova-3-b3-c1-integrity-hardening-2026-11`
- База B3-C.1: `d4407bc4bae44e05399503b9611a4556f070137a`
- Режим: dry-run only; canary применяется только в disposable PGlite.
- B3-C.1 не меняет план, counts или сущности; это schema/integrity hardening.

## 1. Артефакты

| Артефакт | Путь |
|---|---|
| Dry-run report | `docs/data/aninova3-b3c-dry-run-report.json` |
| Source checksums | `docs/data/aninova3-b3c-source-checksums.json` |
| Migration | `supabase/migrations/20261125_comics_b3c_quality_relations.sql` |
| Rollback | `supabase/rollback/20261125_comics_b3c_rollback.sql` |
| SQL contract | `supabase/tests/b3c_comics_quality.sql` |
| PGlite canary | `scripts/comics-b3c-canary.mjs` |
| Unit tests | `tests/aninova3-comics-b3c.test.ts` |
| ADR B3-C | `docs/comics/adr/0003-b3c-quality-policy.md` |
| B3-C.1 migration | `supabase/migrations/20261126_comics_b3c1_integrity_hardening.sql` |
| B3-C.1 rollback | `supabase/rollback/20261126_comics_b3c1_rollback.sql` |
| B3-C.1 SQL contract | `supabase/tests/b3c1_integrity_hardening.sql` |
| B3-C.1 ADR | `docs/comics/adr/0004-b3c1-integrity-hardening.md` |

`planHash`: `bc97255db9c212bbb4d5af409eb8c211097329509ab069491ac5415b8e2e1fd3`

`canaryHash`: `fbea2f08207b7d080423807fe2a6eae9ecb534c3ec28f9bba6732e23697a0079`

`report SHA-256`: `9AA8CC15E3AE206D7046AA80AB12DADE5B8CBE8A6F206967302394B6923B437D`

`checksums SHA-256`: `0A5BE8297DA1843C7B8F2C5DAC74554636188E3CA68CDB48EBEA02B49AC60CC9`

## 2. План и canary

| Сущность | Полный план | Canary 20 |
|---|---:|---:|
| Works | 4 100 | 20 |
| Source observations | 45 188 | 273 |
| External ids | 9 917 (8 SKIP) | 47 (8 SKIP) |
| Aliases | 10 519 | 56 |
| People | 9 007 | 53 |
| Credits | 9 007 | 53 |
| Adaptations | 5 748 | 36 |
| Review items | 6 462 | 177 |
| Rights | 0 | 0 |
| Chapters | 0 | 0 |
| Reading sources | 0 | 0 |

Canary first apply: 715 inserted; second apply: 0 inserted;
`idempotent=true`. Public works/chapters: 0. Non-draft works: 0. Rights: 0.

## 2.1. B3-C.1 integrity hardening

B3-C.1 — аддитивная миграция поверх B3-C, без переписывания B3-A/B/B3-C.

- `comic_source_observations` append-only: `service_role` имеет только
  `SELECT`/`INSERT`; триггеры блокируют `UPDATE`/`DELETE`/`TRUNCATE`
  даже для owner; FK заменён на `ON DELETE RESTRICT`.
- `unidentified_name_bucket`: обязательный непустой `name_bucket_key`,
  `source_person_id=NULL`, `is_public=false`, `name_status='unverified'`;
  trigger сверяет ключ с work `internal_key` + нормализованным именем.
- `source_identified`: обязательные `source_person_id`, HTTPS URL,
  `source_verified` name/record и `checked_at`.
- `manually_verified`: обязательные HTTPS evidence URL,
  `editorially_verified` name/record и `checked_at`.
- 9 007 buckets не повышены; identified authors — 0; public authors — 0.
- Rollback B3-C.1 не удаляет observations, но возвращает старые права/CASCADE
  и явно это предупреждает.

Проверено: C.1 apply → contracts → rollback → reapply → повторное применение
на заполненной canary-базе; `service_role` update/delete/truncate получают
`permission denied`, owner — `append-only`; FK RESTRICT не даёт удалить
работу с observations.

## 3. Что исправлено после B3-B

- `kind`: verified specific kind имеет приоритет; `ONE_SHOT` сохранён;
  `MANGA` без specific kind → `unknown`; country/language не используются.
- Добавлен `source_kind_raw`; B3-A/B3-B migrations не переписаны.
- MAL/Shikimori: при разных graph/metadata значениях id не назначается;
  duplicate id у разных работ не сливается.
- `SourceEnvelope.external_id` отделён от AniList `join_key`; Shikimori id не
  выдаётся за AniList.
- Конфликты year/chapters/volumes/kind/title/ID сохраняются в
  `comic_source_observations` и review; канонические числа при конфликте NULL.
- Авторы: per-work name buckets, `source_person_id=NULL`, `is_public=false`,
  `identity_status='unidentified_name_bucket'`.
- Adult: `unknown | verified_non_adult | adult`; public только
  `verified_non_adult`; `is_adult` сохранён.
- B1D: 120 hints перенесены с original payload и edge evidence; ни одна связь
  не подтверждена.

## 4. Работы и конфликты

| Метрика | Значение |
|---|---:|
| Works | 4 100 |
| `kind='unknown'` | 3 980 |
| Specific kind | 120 |
| Works with source conflicts | 617 |
| Conflict review items | 690 |
| Unknown kinds | 3 980 |
| Verified Russian titles | 2 137 |
| Ready external ids | 9 917 |
| Ambiguous external groups | 2 |
| Ambiguous external rows | 8 |

Raw source formats: `MANGA` 4 014, `ONE_SHOT` 86. Canonical kind:
`unknown` 3 980, `one_shot` 74, `comic` 20, `manhua` 16, `manhwa` 10.

Конфликтные поля: chapters 455, publication_year 171, volumes 52, kind 12.
Title/MAL graph↔metadata конфликтов в корпусе 0; обе ветки покрыты тестами.

Известная группа `124776`: AniList `131323`, `131433`, `131454`, `131637`.
Она даёт 2 external groups (MAL и Shikimori) и 8 SKIP. Работы не слиты.

## 5. Авторы

| Метрика | Значение |
|---|---:|
| Уникальные нормализованные имена | 5 115 |
| Повторяющиеся имена | 1 536 |
| Name buckets (work+name) | 9 007 |
| Идентифицированные авторы | 0 |
| Публичные авторы | 0 |

`authorNameRecords=5 115` — это имена, а не личности.
`authorNameBuckets=9 007` — наблюдения, а не профили. 1 536 review items
`ambiguous_people_identity` требуют ручной проверки; слияние по имени
запрещено.

## 6. Adult-gate

| Статус | Работ | Публично |
|---|---:|---|
| `unknown` | 4 100 | нет |
| `verified_non_adult` | 0 | только при остальных gates |
| `adult` | 0 | нет |

Все реальные работы — `unknown`; ни одна не опубликована. `is_adult=false`
не считается доказательством non-adult. SQL CHECK требует source+checked_at
для non-unknown и согласованность с `is_adult`.

Канарейка дополнительно вставляет три synthetic works (`unknown`,
`verified_non_adult`, `adult`) и проверяет, что public view содержит только
`verified_non_adult`; unknown/adult скрыты (`ADULT_GATE`).

## 7. B1D

| Категория | Полный план | Покрытие canary |
|---|---:|---|
| `adaptationAfterAnime` | 85 | 7 works |
| `multiSourceNeedsReview` | 30 | 1 work |
| `comicAdaptsAnime` | 4 | 1 work |
| `duplicateMal` | 1 | 4 works (вся группа) |
| **Итого** | **120** | **4/4 категории** |

120 matched, 0 unmatched, 0 новых adaptations. 119 review items имеют
`relation_evidence_conflict`, 1 — `duplicate_external_id`. Полный original
payload, source hash, per-edge adaptation id, raw/normalized type и evidence
URL сохранены.

## 8. Review queue

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

Затронуто 4 005 работ. Это review-only; импорт остаётся draft.

## 9. Публикационные gates

- Все works: `publication_status='draft'`, `published_at=NULL`.
- `published_at` не выставлялся; public views возвращают 0.
- Rights: 0; chapters: 0; reading sources: 0; hosted/embed pages: 0.
- Нет публичного Comics API/маршрутов.
- B3-B chapter-specific URL/evidence gates сохранены.
- Public views дополнительно требуют `verified_non_adult`.

## 10. Проверки

| Проверка | Статус |
|---|---|
| `npm run typecheck` | DONE |
| `npm run lint` | DONE: 0 errors, 3 pre-existing warnings |
| `npm test` | DONE: 542 passed, 6 skipped |
| `npm run build` | DONE: 804 static pages |
| B3-C/B3-C.1 unit tests (11) | DONE |
| `supabase/tests/b3a_comics_rls.sql` | DONE в PGlite canary |
| `supabase/tests/b3b_comics_gates.sql` | DONE в PGlite canary |
| `supabase/tests/b3c_comics_quality.sql` | DONE в PGlite canary |
| `supabase/tests/b3c1_integrity_hardening.sql` | DONE: identity gates + append-only + FK RESTRICT |
| B3-C.1 apply → rollback → reapply | DONE (`C1_ROLLBACK_REAPPLY_OK`) |
| B3-C.1 reapply on populated canary | DONE (`C1_REAPPLY_WITH_DATA_OK`) |
| B3-C.1 rollback on populated canary | DONE (`C1_ROLLBACK_WITH_DATA_OK`): observations unchanged |
| `service_role` append-only / owner trigger | DONE: update/delete/truncate rejected |
| Migration → rollback → reapply | DONE (`ROLLBACK_REAPPLY_OK`) |
| Canary idempotency | DONE (`B3C_CANARY_OK`) |
| Deterministic rerun | DONE: report/checksums byte-for-byte, hashes unchanged |
| `SQL_CONTRACTS_OK` / `C1_ROLLBACK_REAPPLY_OK` / `ROLLBACK_REAPPLY_OK` / `B3C_CANARY_OK` | DONE |
| Supabase/PostgREST/live JWT/RLS | **NOT TESTED** |

`metadata-verified.json` warning: declared 2 444, measured 2 265;
используется measured.

## 11. Rollback

`supabase/rollback/20261126_comics_b3c1_rollback.sql` возвращает B3-C
поведение (права, `FOR ALL` policy, CASCADE, старый identity CHECK), но
**не удаляет и не перезаписывает** observations. Он предназначен только для
disposable/local базы и содержит явное предупреждение: после отката удаление
работы снова сможет каскадировать историю.

`supabase/rollback/20261125_comics_b3c_rollback.sql` **разрушителен**:

- unknown kind превращается в `manga`;
- новые review reasons превращаются в `manual`;
- удаляются observations/conflict evidence;
- удаляются B3-C columns/table;
- восстанавливаются B3-B public views без adult-gate.

Rollback проверен только на disposable PGlite. На production data не
применялся и не должен применяться без отдельного плана.

## 12. Решение

B3-C/B3-C.1 готовы как локальный проверенный слой данных и review evidence.
Импорт **не является production-ready**: нет Supabase apply, live RLS/JWT,
прав, глав, adult classification и идентифицированных авторов. B3-C.1
усиливает append-only и identity gates, но не доказывает подлинность внешних
person ID/evidence URL. Остановиться после push ветки; PR/merge/deploy не
выполнять.
