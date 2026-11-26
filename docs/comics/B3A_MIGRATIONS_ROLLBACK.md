# B3-A — миграции, применение и rollback

Статус: **DONE** для local/disposable PGlite 0.6.0.

**NOT TESTED** для Supabase CLI/PostgREST/Storage и production.

## 1. Файлы

| Файл | Назначение | Строк (на момент проверки) |
|---|---|---:|
| `supabase/migrations/20261123_comics_foundation.sql` | 14 таблиц, индексы, CHECK/FK, trigger | 605 |
| `supabase/migrations/20261123_comics_rls.sql` | RLS, grants, политики, public views | 279 |
| `supabase/tests/b3a_comics_rls.sql` | транзакционные SQL-тесты | 501 |
| `supabase/rollback/20261123_comics_rollback.sql` | local-only rollback | 28 |

Rollback намеренно лежит **вне** `supabase/migrations/`, чтобы Supabase CLI не
применил его как миграцию.

## 2. Предусловия

- База: `03579f388fb9d674dee442d365c8b3f9ad128831` (B2-D final).
- В audited-схеме нет объектов `comic_*`/`user_comic_*`.
- Есть `public.titles` с PK `id int` (FK-цель `comic_adaptations`).
- Есть `auth.users` (FK-цель user-таблиц).
- Есть роли `anon`, `authenticated`, `service_role`.
- PostgreSQL 15+ (используются `gen_random_uuid()`, generated columns,
  `NULLS NOT DISTINCT`, `ON DELETE SET NULL (column_list)`).
- Для Supabase: стандартные grants/схемы; отдельных extensions не требуется.
- Production apply требует owner approval и backup/PITR. В B3-A **не выполнялся**.

## 3. Порядок применения

Строго по порядку, каждый файл — отдельной транзакцией:

1. `20261123_comics_foundation.sql`
2. `20261123_comics_rls.sql`

Зависимости:

```text
`titles` ──> `comic_adaptations`
`auth.users` ──> `user_comic_library` / `user_comic_progress`
`comic_works` ──> external_ids / aliases / credits / relations / adaptations /
chapters / reading_sources / rights / user library
`comic_people` ──> `comic_credits`
`comic_reading_sources (work_id,id)` ──> `comic_rights` / `comic_chapters`
`comic_chapters` ──> `user_comic_progress`
```

RLS-файл зависит от всех таблиц foundation и создаёт public views.

## 4. Backup / preflight

Перед любым будущим применением (не в B3-A):

1. Снять managed snapshot/PITR-точку и проверить, что restore доступен.
2. Сохранить `pg_dump` схем `public` и `auth` (без секретов в логах).
3. Зафиксировать counts `public.titles`, `auth.users`, существующих social-таблиц.
4. Проверить, что нет объектов `comic_*`/`user_comic_*`.
5. Применить в staging/disposable копии; прогнать `b3a_comics_rls.sql`.
6. Только после успеха — production, с окном maintenance и планом rollback.

Для пустых новых таблиц backup нужен прежде всего из-за user-таблиц и на случай
последующих B4-данных. Rollback удаляет новые данные; без backup они теряются.

## 5. Rollback

Файл: `supabase/rollback/20261123_comics_rollback.sql`.

Порядок:

1. Остановить импорт/sync/запись в Comics.
2. Снять snapshot или выгрузить `comic_*`/`user_comic_*`, если данные нужно
   сохранить.
3. Выполнить rollback одной транзакцией.
4. Проверить: 0 таблиц `comic_*`/`user_comic_*`, 0 views, 0 функции
   `comic_touch_updated_at`; `public.titles` не изменилась.
5. Если нужен откат к предыдущей версии схемы — restore из backup, а не
   частичные `DROP` вручную.
6. Повторное применение forward-миграций допустимо только после устранения
   причины; цикл проверен.

Rollback **разрушителен** для новых таблиц и намеренно не входит в production
migration path. Он не трогает `public.titles`, `auth.users`, social- и
Anime-таблицы.

## 6. Фактические результаты (PGlite 0.6.0)

Свежий прогон:

```
APPLIED 20261123_comics_foundation.sql
APPLIED 20261123_comics_rls.sql
RLS_TEST_OK
AFTER_ROLLBACK {"works":0,"queue":0}
```

Rollback-прогон:

```
APPLIED 20261123_comics_foundation.sql
APPLIED 20261123_comics_rls.sql
ROLLBACK_OK
AFTER {"tables":0,"views":0,"funcs":0,"titles":1}
REAPPLY_TABLES 12
```

`REAPPLY_TABLES 12` — это количество таблиц с префиксом `comic_*`; ещё две
user-таблицы начинаются с `user_comic_*` и в этот счётчик не входят. Всего 14.

Метаданные после применения:

- 14 таблиц, у всех `rowsecurity=true`.
- 12 канонических + 2 user-таблицы.
- 2 public view.
- 18 FK.
- 124 CHECK.
- `comic_public_works`/`comic_public_chapters`: `security_invoker=false`,
  `security_barrier=true`, owner `postgres`.
- `comic_works.search_ru` — generated `tsvector` с `russian` config.
- Среди `comic%`-функций нет `SECURITY DEFINER`; только invoker-триггер.
- Base tables: CRUD только `service_role`; у `anon`/`authenticated`/`PUBLIC`
  нет table grants.
- User tables: CRUD `authenticated` + `service_role`, own-row policies.
- Views: `SELECT` для `anon`, `authenticated`, `service_role`.

## 7. Что покрывают SQL-тесты

`supabase/tests/b3a_comics_rls.sql` выполняется в `begin; ... rollback;` и
создаёт только фикстуры.

Проверено:

- duplicate slug / external id / source id / alias / person / credit / relation /
  adaptation / chapter / right / library / progress;
- self-relation, cross-work reading source FK, cascade delete;
- CHECK: title_ru_status, publication approved требует published_at, rights
  approved требует reviewer/time, expired требует valid_until, chapter regular
  требует number, adaptation primary требует confirmed;
- `anon`: 2 public works, 2 public chapters, правильная форма view, отсутствие
  adult, отсутствие работы без metadata-права, отсутствие обложки без
  cover-права, отсутствие hosted;
- прямой доступ `anon` к base/rights/queue/user-таблицам запрещён;
  `authenticated` не имеет доступа к base/rights/queue, а user-таблицы
  доступны только в пределах own rows;
- Alice/Bob: собственные library/progress, невозможность читать/менять чужие
  строки, `WITH CHECK` не даёт подменить `user_id`;
- `service_role`: чтение queue/rights/works, insert sync run;
- `authenticated` не читает `comic_review_queue` (модераторской роли нет);
- `comic_public_chapters` не отдаёт `licensed_hosted`.

Это **PGlite**, не Supabase. `auth.uid()` в тесте замокан через
`current_setting('request.jwt.claim.sub')`; реальный PostgREST JWT не проверялся.

## 8. Post-apply smoke SQL (read-only)

```sql
select count(*) from public.comic_works;
select count(*) from public.comic_public_works;
select count(*) from public.comic_public_chapters;
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
  and (relname like 'comic_%' or relname like 'user_comic_%')
order by relname;
```

Ожидаемо на пустой БД: 0 работ, 0 public works, 0 public chapters, 14 таблиц
с `relrowsecurity=true`.

## 9. NOT TESTED / ограничения

- `supabase db push`/CLI: **NOT TESTED** (CLI отсутствует).
- PostgREST/RLS behavior с реальным JWT: **NOT TESTED**.
- Supabase Storage policies: **NOT TESTED** (Storage не используется).
- Production schema/apply/rollback: **NOT TESTED**, не выполнялись.
- Поведение под конкурентной нагрузкой/большими объёмами: **NOT TESTED**.
- `pg_dump`/restore: **NOT TESTED** (нет `pg_dump`/`psql`).
- MangaDex/внешние API: не вызывались.

## 10. Откат и повторное применение

Цикл «apply → rollback → reapply» проверен на PGlite: после rollback не осталось
таблиц/views/функции, `titles` сохранилась; повторное применение создало 12
`comic_*` таблиц (плюс 2 `user_comic_*`). Это подтверждает повторяемость
цикла apply → rollback → reapply, но не заменяет production backup/restore.
