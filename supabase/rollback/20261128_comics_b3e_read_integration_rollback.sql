-- B3-E rollback: remove the public read projections and search indexes.
-- Base tables, gates and public.comic_public_works/chapters are untouched.
drop view if exists public.comic_public_genre_counts;
drop view if exists public.comic_public_kind_counts;
drop view if exists public.comic_public_adaptations;
drop view if exists public.comic_public_catalog;
drop index if exists public.comic_aliases_public_work_idx;
drop index if exists public.comic_aliases_alias_trgm_idx;
drop index if exists public.comic_works_title_ru_trgm_idx;
