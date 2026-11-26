-- Rollback for 20261124_comics_b3b_chapter_urls_evidence.sql.
-- Restores the B3-A public projections and constraints, then removes B3-B
-- columns. Run only after stopping writes. If B3-B data already relies on
-- chapter-specific URLs or evidence, archive/repair it first; the restored
-- B3-A constraints may reject it rather than silently weakening the gate.

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

alter table public.comic_reading_sources drop constraint if exists comic_reading_sources_terms_approved_evidence_check;
alter table public.comic_reading_sources drop constraint if exists comic_reading_sources_terms_reviewer_len;
alter table public.comic_rights drop constraint if exists comic_rights_approved_evidence_check;

alter table public.comic_chapters drop column if exists embed_url;
alter table public.comic_reading_sources drop column if exists terms_reviewed_by;

alter table public.comic_reading_sources drop constraint if exists comic_reading_sources_mode_fields_check;
alter table public.comic_reading_sources add constraint comic_reading_sources_mode_fields_check check (
  (reading_mode = 'external_link' and source_url is not null)
  or (reading_mode = 'permitted_embed' and embed_url is not null)
  or reading_mode = 'licensed_hosted'
);

comment on table public.comic_reading_sources is
  'Work-level source metadata and terms review. A source is not a permission.';
comment on table public.comic_rights is
  'Internal rights register. Default unknown. Public views enforce approved+valid rights; API availability is not permission.';
