-- B3-E: read-only public integration layer for the DB-backed Comics catalog.
--
-- Scope: public projections only. No new base tables, no writes, no changed gates:
-- every view is built ON TOP of public.comic_public_works / comic_public_chapters,
-- so the B3-B/B3-C publication, rights, adult and title gates stay the single
-- source of truth for what may be shown. A work that the existing public view
-- hides cannot leak through these views.
--
-- Exposed additions:
--   comic_public_catalog      - public cards + confirmed Russian search aliases
--   comic_public_adaptations  - public, verified anime <-> comic relations
--   (role is a column of comic_public_catalog, not a separate view)
--   comic_public_kind_counts  - facet counts for kind
--   comic_public_genre_counts - facet counts for genre
--
-- No original-language titles, no provenance URLs, no service data.
--
-- Access: revoke all from public; select for anon, authenticated, service_role.
-- The app reads these with the anon key; the service key is never used here.
create or replace view public.comic_public_catalog
with (security_invoker = false, security_barrier = true)
as
select
  w.id, w.slug, w.title_ru, w.kind, w.publication_year, w.publishing_status,
  w.description_ru, w.cover_url, w.total_chapters_known, w.volumes_known, w.genres,
  w.release_date, w.release_date_precision, w.published_at, w.updated_at,
  cw.country_code,
  (
    select string_agg(a.alias, ' ' order by a.alias)
    from public.comic_aliases a
    where a.work_id = w.id
      and a.is_public
      and a.language = 'ru'
      and a.alias_type in ('alternative_title', 'official_russian', 'search_alias', 'transliteration')
      and a.verification_status in ('source_verified', 'editorially_verified')
  ) as search_aliases,
  (
    select count(*)::int
    from public.comic_adaptations ad
    where ad.comic_work_id = w.id
      and ad.is_public
      and ad.direction = 'comic_is_source'
      and ad.confidence_level = 'confirmed'
      and ad.verification_status in ('source_verified', 'editorially_verified')
      and exists (select 1 from public.titles t where t.anilist_id = ad.anime_id)
  ) as source_anime_count,
  case
    when exists (
      select 1 from public.comic_adaptations ad
      where ad.comic_work_id = w.id
        and ad.is_public
        and ad.direction = 'comic_is_source'
        and ad.confidence_level <> 'unknown'
        and ad.verification_status in ('source_verified', 'editorially_verified')
        and exists (select 1 from public.titles t where t.anilist_id = ad.anime_id)
    ) then 'source'
    when exists (
      select 1 from public.comic_adaptations ad
      where ad.comic_work_id = w.id
        and ad.is_public
        and ad.direction = 'anime_is_source'
        and ad.confidence_level <> 'unknown'
        and ad.verification_status in ('source_verified', 'editorially_verified')
        and exists (select 1 from public.titles t where t.anilist_id = ad.anime_id)
    ) then 'comic-by-anime'
    else 'related'
  end as role
from public.comic_public_works w
/* Join only to read a non-public column of an already-gated row. */
join public.comic_works cw on cw.id = w.id;
revoke all on table public.comic_public_catalog from public;
grant select on table public.comic_public_catalog to anon, authenticated;
grant select on table public.comic_public_catalog to service_role;
comment on view public.comic_public_catalog is
  'B3-E public catalog projection: comic_public_works plus confirmed Russian search aliases and confirmed public source-anime count. Inherits all B3-B/B3-C gates from comic_public_works.';
create or replace view public.comic_public_adaptations
with (security_invoker = false, security_barrier = true)
as
select
  ad.anime_id,
  ad.comic_work_id,
  ad.raw_relation_type,
  ad.normalized_relation_type,
  ad.direction,
  ad.confidence_level,
  ad.basis,
  ad.is_primary,
  ad.source_name,
  ad.observed_at,
  ad.checked_at
from public.comic_adaptations ad
join public.comic_public_works w on w.id = ad.comic_work_id
join public.titles t on t.anilist_id = ad.anime_id
where ad.is_public
  and ad.verification_status in ('source_verified', 'editorially_verified');
revoke all on table public.comic_public_adaptations from public;
grant select on table public.comic_public_adaptations to anon, authenticated;
grant select on table public.comic_public_adaptations to service_role;
comment on view public.comic_public_adaptations is
  'B3-E public relation projection. Requires is_public, source/editorial verification, a public work and an existing anime title. Never returns disputed/rejected relations.';
create or replace view public.comic_public_kind_counts
with (security_invoker = false, security_barrier = true)
as
select w.kind, count(*)::int as work_count
from public.comic_public_works w
group by w.kind;
revoke all on table public.comic_public_kind_counts from public;
grant select on table public.comic_public_kind_counts to anon, authenticated;
grant select on table public.comic_public_kind_counts to service_role;
comment on view public.comic_public_kind_counts is
  'B3-E kind facet counts over public works only.';
create or replace view public.comic_public_genre_counts
with (security_invoker = false, security_barrier = true)
as
select g.genre, count(*)::int as work_count
from public.comic_public_works w
cross join lateral unnest(w.genres) as g(genre)
group by g.genre;
revoke all on table public.comic_public_genre_counts from public;
grant select on table public.comic_public_genre_counts to anon, authenticated;
grant select on table public.comic_public_genre_counts to service_role;
comment on view public.comic_public_genre_counts is
  'B3-E genre facet counts over public works only.';
-- Search support. The existing GIN index covers full-text search of the base
-- table, but a substring search over title/aliases needs a trigram index. The
-- extension is optional (PGlite/local Postgres may not ship it), so the block is
-- guarded and idempotent: missing pg_trgm degrades performance, not correctness.
do $b3e$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_trgm') then
    execute 'create extension if not exists pg_trgm';
    execute 'create index if not exists comic_works_title_ru_trgm_idx on public.comic_works using gin (title_ru gin_trgm_ops) where title_ru is not null';
    execute 'create index if not exists comic_aliases_alias_trgm_idx on public.comic_aliases using gin (alias gin_trgm_ops) where is_public';
    raise notice 'B3-E: pg_trgm indexes available';
  else
    raise notice 'B3-E: pg_trgm unavailable, substring search falls back to a scan over public works only';
  end if;
exception when others then
  raise notice 'B3-E: pg_trgm setup skipped (% )', sqlerrm;
end
$b3e$;
create index if not exists comic_aliases_public_work_idx
  on public.comic_aliases (work_id) where is_public;