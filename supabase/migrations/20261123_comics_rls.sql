-- B3-A Comics RLS and public projections.
-- Base comics tables are server-only. Public reads go through the two
-- security-definer, read-only projections at the bottom; they expose only safe
-- columns and re-check work publication + rights on every query.
-- No moderator/admin role exists in this repository, so no such policy is invented.

alter table public.comic_works enable row level security;
alter table public.comic_external_ids enable row level security;
alter table public.comic_aliases enable row level security;
alter table public.comic_people enable row level security;
alter table public.comic_credits enable row level security;
alter table public.comic_relations enable row level security;
alter table public.comic_adaptations enable row level security;
alter table public.comic_chapters enable row level security;
alter table public.comic_reading_sources enable row level security;
alter table public.comic_rights enable row level security;
alter table public.comic_sync_runs enable row level security;
alter table public.comic_review_queue enable row level security;
alter table public.user_comic_library enable row level security;
alter table public.user_comic_progress enable row level security;

-- Principle of least privilege: client roles get no base-table access at all.
-- anon/authenticated only receive SELECT on the two public views below.
revoke all on table
  public.comic_works,
  public.comic_external_ids,
  public.comic_aliases,
  public.comic_people,
  public.comic_credits,
  public.comic_relations,
  public.comic_adaptations,
  public.comic_chapters,
  public.comic_reading_sources,
  public.comic_rights,
  public.comic_sync_runs,
  public.comic_review_queue
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.comic_works,
  public.comic_external_ids,
  public.comic_aliases,
  public.comic_people,
  public.comic_credits,
  public.comic_relations,
  public.comic_adaptations,
  public.comic_chapters,
  public.comic_reading_sources,
  public.comic_rights,
  public.comic_sync_runs,
  public.comic_review_queue
to service_role;

-- User-owned layers are available to authenticated users, but RLS limits every
-- statement to auth.uid() = user_id. anon gets nothing.
revoke all on table public.user_comic_library, public.user_comic_progress from public, anon, authenticated;
grant select, insert, update, delete on table public.user_comic_library, public.user_comic_progress to authenticated;
grant select, insert, update, delete on table public.user_comic_library, public.user_comic_progress to service_role;

drop policy if exists user_comic_library_select_own on public.user_comic_library;
create policy user_comic_library_select_own on public.user_comic_library
  for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists user_comic_library_insert_own on public.user_comic_library;
create policy user_comic_library_insert_own on public.user_comic_library
  for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
drop policy if exists user_comic_library_update_own on public.user_comic_library;
create policy user_comic_library_update_own on public.user_comic_library
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists user_comic_library_delete_own on public.user_comic_library;
create policy user_comic_library_delete_own on public.user_comic_library
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_comic_progress_select_own on public.user_comic_progress;
create policy user_comic_progress_select_own on public.user_comic_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists user_comic_progress_insert_own on public.user_comic_progress;
create policy user_comic_progress_insert_own on public.user_comic_progress
  for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
drop policy if exists user_comic_progress_update_own on public.user_comic_progress;
create policy user_comic_progress_update_own on public.user_comic_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists user_comic_progress_delete_own on public.user_comic_progress;
create policy user_comic_progress_delete_own on public.user_comic_progress
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Explicit server-role policies. Supabase service_role also has BYPASSRLS;
-- these policies document intent and keep local/role-scoped checks honest.
drop policy if exists comic_works_service_all on public.comic_works;
create policy comic_works_service_all on public.comic_works for all to service_role using (true) with check (true);
drop policy if exists comic_external_ids_service_all on public.comic_external_ids;
create policy comic_external_ids_service_all on public.comic_external_ids for all to service_role using (true) with check (true);
drop policy if exists comic_aliases_service_all on public.comic_aliases;
create policy comic_aliases_service_all on public.comic_aliases for all to service_role using (true) with check (true);
drop policy if exists comic_people_service_all on public.comic_people;
create policy comic_people_service_all on public.comic_people for all to service_role using (true) with check (true);
drop policy if exists comic_credits_service_all on public.comic_credits;
create policy comic_credits_service_all on public.comic_credits for all to service_role using (true) with check (true);
drop policy if exists comic_relations_service_all on public.comic_relations;
create policy comic_relations_service_all on public.comic_relations for all to service_role using (true) with check (true);
drop policy if exists comic_adaptations_service_all on public.comic_adaptations;
create policy comic_adaptations_service_all on public.comic_adaptations for all to service_role using (true) with check (true);
drop policy if exists comic_chapters_service_all on public.comic_chapters;
create policy comic_chapters_service_all on public.comic_chapters for all to service_role using (true) with check (true);
drop policy if exists comic_reading_sources_service_all on public.comic_reading_sources;
create policy comic_reading_sources_service_all on public.comic_reading_sources for all to service_role using (true) with check (true);
drop policy if exists comic_rights_service_all on public.comic_rights;
create policy comic_rights_service_all on public.comic_rights for all to service_role using (true) with check (true);
drop policy if exists comic_sync_runs_service_all on public.comic_sync_runs;
create policy comic_sync_runs_service_all on public.comic_sync_runs for all to service_role using (true) with check (true);
drop policy if exists comic_review_queue_service_all on public.comic_review_queue;
create policy comic_review_queue_service_all on public.comic_review_queue for all to service_role using (true) with check (true);
drop policy if exists user_comic_library_service_all on public.user_comic_library;
create policy user_comic_library_service_all on public.user_comic_library for all to service_role using (true) with check (true);
drop policy if exists user_comic_progress_service_all on public.user_comic_progress;
create policy user_comic_progress_service_all on public.user_comic_progress for all to service_role using (true) with check (true);

-- Public work cards. This view is intentionally SECURITY DEFINER (owned by the
-- migration role): it must read internal rights rows. It has no dynamic SQL, fixed
-- predicates, no original/native titles, no provenance, no adult rows, and only
-- the columns below. Threat review: docs/comics/adr/0001-comics-data-foundation.md.
create or replace view public.comic_public_works
with (security_invoker = false, security_barrier = true)
as
select
  w.id,
  w.slug,
  w.title_ru,
  w.kind,
  w.publication_year,
  w.publishing_status,
  w.description_ru,
  case
    when exists (
      select 1 from public.comic_rights r
      where r.work_id = w.id
        and r.permission = 'cover'
        and r.reading_source_id is null
        and r.status = 'approved'
        and (r.valid_from is null or r.valid_from <= current_date)
        and (r.valid_until is null or r.valid_until >= current_date)
    ) then w.cover_url
    else null
  end as cover_url,
  w.total_chapters_known,
  w.volumes_known,
  w.genres,
  w.release_date,
  w.release_date_precision,
  w.published_at,
  w.updated_at
from public.comic_works w
where w.publication_status = 'approved'
  and w.published_at is not null
  and w.published_at <= now()
  and w.title_ru is not null
  and w.title_ru_status in ('source_verified', 'editorially_verified')
  and w.is_adult = false
  and exists (
    select 1 from public.comic_rights r
    where r.work_id = w.id
      and r.permission = 'metadata'
      and r.reading_source_id is null
      and r.status = 'approved'
      and (r.valid_from is null or r.valid_from <= current_date)
      and (r.valid_until is null or r.valid_until >= current_date)
  );

revoke all on table public.comic_public_works from public;
grant select on table public.comic_public_works to anon, authenticated;
grant select on table public.comic_public_works to service_role;

comment on view public.comic_public_works is
  'Safe public cards: approved work, verified Russian title, approved metadata right, non-adult. Cover only with approved cover right. No original titles/provenance.';

-- Public chapter list / external link / permitted embed. licensed_hosted is
-- deliberately not projected in B3-A: it requires a legally reviewed page store.
create or replace view public.comic_public_chapters
with (security_invoker = false, security_barrier = true)
as
select
  c.id,
  c.work_id,
  c.chapter_number,
  c.chapter_number_text,
  c.chapter_kind,
  c.volume_number,
  c.volume_text,
  c.title_ru,
  c.language,
  c.page_count,
  c.published_at,
  s.id as reading_source_id,
  s.source_name,
  s.attribution_text,
  case
    when s.reading_mode = 'external_link' then 'external_link'
    else 'permitted_embed'
  end as reading_mode,
  case
    when s.reading_mode = 'external_link' then s.source_url
    when s.reading_mode = 'permitted_embed' then s.embed_url
    else null
  end as reading_url
from public.comic_chapters c
join public.comic_works w on w.id = c.work_id
join public.comic_reading_sources s on s.id = c.reading_source_id
where w.publication_status = 'approved'
  and w.published_at is not null
  and w.published_at <= now()
  and w.title_ru is not null
  and w.title_ru_status in ('source_verified', 'editorially_verified')
  and w.is_adult = false
  and exists (
    select 1 from public.comic_rights r
    where r.work_id = w.id
      and r.permission = 'metadata'
      and r.reading_source_id is null
      and r.status = 'approved'
      and (r.valid_from is null or r.valid_from <= current_date)
      and (r.valid_until is null or r.valid_until >= current_date)
  )
  and c.availability = 'public'
  and c.language = 'ru'
  and c.page_count > 0
  and s.is_active
  and s.language = 'ru'
  and s.terms_review_status = 'approved'
  and s.terms_checked_at is not null
  and (
    (
      s.reading_mode = 'external_link'
      and s.source_url is not null
      and exists (
        select 1 from public.comic_rights r
        where r.work_id = w.id
          and r.reading_source_id = s.id
          and r.permission = 'chapter_link'
          and r.status = 'approved'
          and (r.valid_from is null or r.valid_from <= current_date)
          and (r.valid_until is null or r.valid_until >= current_date)
      )
    )
    or
    (
      s.reading_mode = 'permitted_embed'
      and s.embed_url is not null
      and exists (
        select 1 from public.comic_rights r
        where r.work_id = w.id
          and r.reading_source_id = s.id
          and r.permission = 'embed'
          and r.status = 'approved'
          and (r.valid_from is null or r.valid_from <= current_date)
          and (r.valid_until is null or r.valid_until >= current_date)
      )
    )
  );

revoke all on table public.comic_public_chapters from public;
grant select on table public.comic_public_chapters to anon, authenticated;
grant select on table public.comic_public_chapters to service_role;

comment on view public.comic_public_chapters is
  'Safe public chapter projection. Only approved work+metadata, approved chapter_link or embed source, Russian, page_count>0. licensed_hosted excluded.';

comment on table public.comic_review_queue is
  'Internal editorial queue. No anon/authenticated grants or policies. No moderator role exists; service_role only.';
comment on table public.comic_rights is
  'Internal rights register. Default unknown. Public views enforce approved+valid rights; API availability is not permission.';