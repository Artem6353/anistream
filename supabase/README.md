# Supabase schema and migrations

The social tables in the current production project predate tracked migrations. Do not
assume an empty `supabase/migrations` directory means the database has no schema.

- `migrations/20261011000000_harden_social_rls.sql` records the latest incremental
  production security fix.
- `tests/social_rls_regression.sql` is reserved for read-only post-deployment assertions.
- Apply incremental migrations only after the baseline social tables exist. A clean
  project still needs a reviewed baseline snapshot before it can be provisioned solely
  from this repository.

The production change was applied directly through the Supabase database connection and
verified against policy and column-privilege metadata. Do not re-run baseline DDL on the
existing production project.
