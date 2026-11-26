-- B3-A Comics rollback (DESTRUCTIVE). Disposable/local or owner-approved only.
-- This reverses only 20261123_comics_foundation.sql and 20261123_comics_rls.sql.
-- It does not touch public.titles, auth.users, anime library, or any prior migration.
-- Preconditions: backup/snapshot taken; no external object depends on these tables.
-- Order: views -> user/private children -> source/rights/chapters -> works.
begin;

drop view if exists public.comic_public_chapters;
drop view if exists public.comic_public_works;

drop table if exists public.user_comic_progress;
drop table if exists public.user_comic_library;
drop table if exists public.comic_review_queue;
drop table if exists public.comic_sync_runs;
drop table if exists public.comic_chapters;
drop table if exists public.comic_rights;
drop table if exists public.comic_reading_sources;
drop table if exists public.comic_adaptations;
drop table if exists public.comic_relations;
drop table if exists public.comic_credits;
drop table if exists public.comic_people;
drop table if exists public.comic_aliases;
drop table if exists public.comic_external_ids;
drop table if exists public.comic_works;

drop function if exists public.comic_touch_updated_at();

commit;
