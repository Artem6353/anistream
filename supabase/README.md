# Supabase schema and migrations

The repository's canonical bootstrap is the numbered sequence in `supabase/migrations/`
(the previous standalone `schema.sql` was consolidated into `001_schema.sql` to avoid
two diverging setup paths).

The connected production project has an existing social schema, but its reported
migration history is empty. That is migration-metadata drift, not an empty database.
Do not blindly replay the full bootstrap or mark every old migration as applied without
comparing each migration's effects to the live schema.

- `migrations/20261010215216_harden_social_rls.sql` records the social RLS access-control fix.
- `migrations/20261010215240_fix_review_function_search_path.sql` pins review-trigger function search paths.
- `migrations/20261010215346_optimize_rls_policy_checks_and_fk_indexes.sql` indexes missing foreign keys, optimizes auth checks, and removes duplicate owner policies.
- Apply the new incremental SQL only after reviewing the current schema and checking
  the migration state.
- The current production security change was applied directly through the Supabase
  database connection and verified against policy and column-privilege metadata.
