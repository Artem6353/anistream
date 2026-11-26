# ADR-0004 — B3-C.1: append-only observations and evidence-gated author identity

- Статус: Accepted для local/disposable слоя; production apply **NOT TESTED**
- Дата: 2026-11-25
- База: B3-C `d4407bc4bae44e05399503b9611a4556f070137a`
- Ветка: `data/aninova-3-b3-c1-integrity-hardening-2026-11`
- Связанные документы: ADR-0003, `B3C_DATA_QUALITY.md`, `B3C_IMPORT_REPORT.md`

## 1. Контекст

B3-C сохранил конфликты источников в `comic_source_observations`, но таблица
оставалась изменяемой: `service_role` имел `UPDATE`/`DELETE`, а FK на работу
использовал `ON DELETE CASCADE`. Это позволяло перезаписать или потерять
историю доказательств. Одновременно CHECK для
`unidentified_name_bucket` проверял только `source_person_id IS NULL` и
`is_public=false`: name bucket мог остаться без ключа, а
`source_identified`/`manually_verified` могли быть выставлены без
проверяемого provenance.

## 2. Решение

### 2.1. Source observations — append-only

1. `service_role` получает только `SELECT` и `INSERT` на
   `comic_source_observations`; `UPDATE`, `DELETE` и `TRUNCATE` отозваны.
2. `BEFORE UPDATE OR DELETE` row trigger и `BEFORE TRUNCATE` statement
   trigger отклоняют мутацию даже для владельца таблицы.
3. FK `work_id` использует `ON DELETE RESTRICT`: удаление работы с
   observations невозможно; история не каскадируется.
4. RLS-политика `FOR ALL` заменена отдельными `SELECT`/`INSERT` policies
   для `service_role`.
5. Новое значение источника — новая строка. Импорт и повторный dry-run
   формируют только `INSERT ... ON CONFLICT DO NOTHING`; обновление старых
   observations не требуется.

### 2.2. Author identity gates

`unidentified_name_bucket`:

- `source_person_id IS NULL`;
- `is_public=false`;
- `name_status='unverified'`;
- непустой `name_bucket_key`, равный `btrim(...)`, без ведущего/хвостового
  двоеточия;
- trigger проверяет, что ключ равен
  `comic_works.internal_key || ':' || normalized_name` существующей работы.

`source_identified`:

- непустой `source_person_id`;
- HTTPS `source_url`;
- `name_status='source_verified'`;
- `verification_status='source_verified'`;
- непустой `checked_at`.

`manually_verified`:

- HTTPS `source_url` как evidence basis;
- `name_status='editorially_verified'`;
- `verification_status='editorially_verified'`;
- непустой `checked_at`.

Публичность не является отдельным исключением: для публичного
`source_identified`/`manually_verified` все перечисленные условия всё равно
обязательны, а name bucket всегда приватный.

### 2.3. Данные и rollback

- Существующие 9 007 name buckets не переклассифицируются, не получают
  вымышленные `source_person_id` и не становятся публичными.
- 0 authors identified; 1 536 повторяющихся имён остаются review-only.
- B3-C.1 rollback возвращает старые права/CASCADE и старый CHECK, но не
  удаляет и не перезаписывает observations; в файле есть явное предупреждение.
- B3-C rollback остаётся разрушительным и не является частью B3-C.1
  production-процедуры.

## 3. Последствия

Плюсы:

- конфликтующие значения нельзя затереть `UPDATE`;
- удаление работы не уничтожает доказательства;
- статус автора нельзя выставить без обязательных полей;
- name bucket нельзя отвязать от работы и имени.

Ограничения:

- SQL CHECK проверяет наличие и форму evidence, но не подлинность внешнего
  `source_person_id` и не факт, что URL подтверждает личность;
- trigger name bucket требует, чтобы work уже существовала; planner вставляет
  works раньше people, это соблюдено;
- `ON DELETE RESTRICT` требует явной archival/retention-процедуры перед
  удалением работ в будущем;
- Supabase/PostgREST/live JWT/RLS не проверялись.

## 4. Проверка

- `supabase/tests/b3c1_integrity_hardening.sql` — positive/negative identity
  cases, append-only, FK RESTRICT.
- `scripts/comics-b3c-canary.mjs` — C.1 apply/rollback/reapply, повторное
  применение на данных, `service_role` privileges, owner trigger, canary.
- `tests/aninova3-comics-b3c.test.ts` — observations только `INSERT`, bucket
  key привязан к работе и имени.
