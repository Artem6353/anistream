# Supabase schema and migrations

The repository's canonical bootstrap is the numbered sequence in `supabase/migrations/`
(the previous standalone `schema.sql` was consolidated into `001_schema.sql` to avoid
two diverging setup paths).

The connected production project has an existing social schema. Its migration history
was initially empty; the three incremental fixes below are now recorded, but older
baseline migrations are still not reconciled in production history. This is migration-
metadata drift, not an empty database. Do not blindly replay the full bootstrap or mark
older migrations as applied without comparing each migration's effects to the live schema.

- `migrations/20261010215216_harden_social_rls.sql` records the social RLS access-control fix.
- `migrations/20261010215240_fix_review_function_search_path.sql` pins review-trigger function search paths.
- `migrations/20261010215346_optimize_rls_policy_checks_and_fk_indexes.sql` indexes missing foreign keys, optimizes auth checks, and removes duplicate owner policies.
- Apply the new incremental SQL only after reviewing the current schema and checking
  the migration state.
- The current production security change was applied directly through the Supabase
  database connection and verified against policy and column-privilege metadata.

## Миграции аудита 2026-10 (данные каталога)

Четыре идемпотентные миграции добавляют таблицы, которые заменяют git-файлы как
источник производных данных (`create table if not exists`, `drop policy if exists`,
никаких `drop table`/`truncate`/массовых `delete`):

- `20261012_titles.sql` — `titles`, `title_relations`, `title_characters` (ТЗ 2.1).
  Наполнение: `node scripts/import-titles-to-db.mjs` (upsert пачками по `id`, идемпотентно).
- `20261012_airing_schedule.sql` — сетка выхода серий (ТЗ 1.1). Наполнение:
  `scripts/sync-airing.mjs`, cron `.github/workflows/sync-airing.yml` каждые 30 минут.
- `20261012_episodes.sql` — номера, даты и названия серий (ТЗ 1.3). Наполнение:
  `scripts/sync-episodes.mjs`, cron 6 часов (онгоинги) + сутки (полный проход).
- `20261012_episode_sources.sql` — озвучки и ссылки серий (ТЗ 1.6). Наполнение:
  `scripts/sync-sources.mjs` **вне Vercel** (нужен `KODIK_TOKEN`).

RLS у всех четырёх одинаковый: `select using (true)` для чтения и `for all to service_role`
для записи — то есть прямой REST от анонима/аутентифицированного пользователя запись не пройдёт.

Порядок применения на прод-проекте (история миграций в нём не свернута с baseline —
см. примечание выше, поэтому применяем только новые файлы, не прогоняя старые):

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20261012_titles.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20261012_airing_schedule.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20261012_episodes.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20261012_episode_sources.sql
node scripts/import-titles-to-db.mjs --dry-run --limit 50   # проверка формы строк
node scripts/import-titles-to-db.mjs                        # перенос каталога
node scripts/import-titles-to-db.mjs --verify               # сверка числа строк
```

Размер: 8017 тайтлов ≈ 40–60 МБ с описаниями; `episode_source_urls` ограничен
`MAX_EPISODE_URLS=1200` последних серий на озвучку, чтобы не выйти за 500 МБ Free.

## Remaining Auth setting

Supabase Auth currently reports that leaked-password protection is disabled. Enable
this in the project's Auth password-security settings:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

This dashboard-level Auth setting is separate from Postgres migrations.
