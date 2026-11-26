-- B3-B additive schema corrections for source adapters and dry-run import.
-- Target PostgreSQL 15+ (Supabase). Depends on 20261123_comics_foundation.sql
-- and 20261123_comics_rls.sql. It never imports data, creates chapters, grants
-- rights, publishes works or opens a reading route.
--
-- Two B3-A defects are corrected here:
-- 1. reading URLs belong to each chapter, not to the work-level reading source;
-- 2. approved rights/terms require human-readable evidence, a named reviewer and
--    a review timestamp. Unknown/pending/rejected/expired never opens reading.

-- ---------------------------------------------------------------------------
-- 1. Chapter-specific URLs
-- ---------------------------------------------------------------------------
alter table public.comic_chapters add column if not exists embed_url text;

alter table public.comic_chapters drop constraint if exists comic_chapters_embed_url_check;
alter table public.comic_chapters add constraint comic_chapters_embed_url_check
  check (embed_url is null or embed_url ~ '^https://');

comment on column public.comic_chapters.source_url is
  'Chapter-specific external-link URL. A work-level reading source URL must never be copied here.';
comment on column public.comic_chapters.embed_url is
  'Chapter-specific permitted-embed URL. A work-level reading source URL must never be copied here.';

-- Work-level URLs are optional metadata about a source, not chapter destinations.
alter table public.comic_reading_sources drop constraint if exists comic_reading_sources_mode_fields_check;

-- ---------------------------------------------------------------------------
-- 2. Terms review evidence
-- ---------------------------------------------------------------------------
alter table public.comic_reading_sources add column if not exists terms_reviewed_by text;

alter table public.comic_reading_sources drop constraint if exists comic_reading_sources_terms_reviewer_len;
alter table public.comic_reading_sources add constraint comic_reading_sources_terms_reviewer_len
  check (terms_reviewed_by is null or char_length(btrim(terms_reviewed_by)) between 1 and 120);

alter table public.comic_reading_sources drop constraint if exists comic_reading_sources_terms_approved_evidence_check;
alter table public.comic_reading_sources add constraint comic_reading_sources_terms_approved_evidence_check
  check (
    terms_review_status <> 'approved'
    or (
      terms_url is not null
      and char_length(btrim(terms_url)) > 0
      and terms_checked_at is not null
      and terms_reviewed_by is not null
      and char_length(btrim(terms_reviewed_by)) > 0
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Rights evidence
-- ---------------------------------------------------------------------------
alter table public.comic_rights drop constraint if exists comic_rights_approved_evidence_check;
alter table public.comic_rights add constraint comic_rights_approved_evidence_check
  check (
    status <> 'approved'
    or (
      evidence_ref is not null
      and char_length(btrim(evidence_ref)) > 0
      and reviewed_by is not null
      and char_length(btrim(reviewed_by)) > 0
      and reviewed_at is not null
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Public projections use chapter URLs and defensive evidence checks
-- ---------------------------------------------------------------------------
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
        and r.evidence_ref is not null
        and char_length(btrim(r.evidence_ref)) > 0
        and r.reviewed_by is not null
        and char_length(btrim(r.reviewed_by)) > 0
        and r.reviewed_at is not null
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
      and r.evidence_ref is not null
      and char_length(btrim(r.evidence_ref)) > 0
      and r.reviewed_by is not null
      and char_length(btrim(r.reviewed_by)) > 0
      and r.reviewed_at is not null
      and (r.valid_from is null or r.valid_from <= current_date)
      and (r.valid_until is null or r.valid_until >= current_date)
  );

revoke all on table public.comic_public_works from public;
grant select on table public.comic_public_works to anon, authenticated;
grant select on table public.comic_public_works to service_role;

comment on view public.comic_public_works is
  'Safe public cards: approved work, verified Russian title, approved evidenced metadata right, non-adult. Cover only with approved evidenced cover right. No original titles/provenance.';

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
    when s.reading_mode = 'external_link' then c.source_url
    when s.reading_mode = 'permitted_embed' then c.embed_url
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
      and r.evidence_ref is not null
      and char_length(btrim(r.evidence_ref)) > 0
      and r.reviewed_by is not null
      and char_length(btrim(r.reviewed_by)) > 0
      and r.reviewed_at is not null
      and (r.valid_from is null or r.valid_from <= current_date)
      and (r.valid_until is null or r.valid_until >= current_date)
  )
  and c.availability = 'public'
  and c.language = 'ru'
  and c.page_count > 0
  and s.is_active
  and s.language = 'ru'
  and s.terms_review_status = 'approved'
  and s.terms_url is not null
  and char_length(btrim(s.terms_url)) > 0
  and s.terms_checked_at is not null
  and s.terms_reviewed_by is not null
  and char_length(btrim(s.terms_reviewed_by)) > 0
  and (
    (
      s.reading_mode = 'external_link'
      and c.source_url is not null
      and exists (
        select 1 from public.comic_rights r
        where r.work_id = w.id
          and r.reading_source_id = s.id
          and r.permission = 'chapter_link'
          and r.status = 'approved'
          and r.evidence_ref is not null
          and char_length(btrim(r.evidence_ref)) > 0
          and r.reviewed_by is not null
          and char_length(btrim(r.reviewed_by)) > 0
          and r.reviewed_at is not null
          and (r.valid_from is null or r.valid_from <= current_date)
          and (r.valid_until is null or r.valid_until >= current_date)
      )
    )
    or
    (
      s.reading_mode = 'permitted_embed'
      and c.embed_url is not null
      and exists (
        select 1 from public.comic_rights r
        where r.work_id = w.id
          and r.reading_source_id = s.id
          and r.permission = 'embed'
          and r.status = 'approved'
          and r.evidence_ref is not null
          and char_length(btrim(r.evidence_ref)) > 0
          and r.reviewed_by is not null
          and char_length(btrim(r.reviewed_by)) > 0
          and r.reviewed_at is not null
          and (r.valid_from is null or r.valid_from <= current_date)
          and (r.valid_until is null or r.valid_until >= current_date)
      )
    )
  );

revoke all on table public.comic_public_chapters from public;
grant select on table public.comic_public_chapters to anon, authenticated;
grant select on table public.comic_public_chapters to service_role;

comment on view public.comic_public_chapters is
  'Safe public chapter projection. Only approved evidenced work+metadata, approved evidenced chapter_link/embed source, chapter-specific URL, Russian, page_count>0. licensed_hosted excluded.';

comment on table public.comic_reading_sources is
  'Work-level source metadata and terms review. Chapter destinations come from comic_chapters.source_url/embed_url.';
comment on table public.comic_rights is
  'Internal rights register. Approved requires non-empty evidence_ref, reviewer and timestamp. Public views enforce this defensively.';
