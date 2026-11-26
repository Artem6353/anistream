-- B3-C rollback for disposable/local databases only. It restores the B3-B schema
-- and public projections, then removes B3-C columns/table. Data loss is explicit:
-- unknown kinds become manga, new review reasons become manual, and all source
-- observations/conflict evidence are deleted. Never run this on production data.

begin;

update public.comic_review_queue set reason = 'manual'
where reason in (
  'source_metadata_conflict', 'kind_unknown', 'duplicate_public_title',
  'relation_evidence_conflict', 'ambiguous_people_identity', 'missing_provenance'
);
alter table public.comic_review_queue drop constraint if exists comic_review_queue_reason_check;
alter table public.comic_review_queue add constraint comic_review_queue_reason_check
  check (reason in ('missing_ru_title', 'name_mismatch', 'duplicate_alias', 'duplicate_external_id', 'ambiguous_external_id', 'rights_unknown', 'rights_expired', 'source_conflict', 'unsupported_relation', 'unsupported_reading_mode', 'manual'));

-- Restore B3-B public views before dropping their B3-C columns.
create or replace view public.comic_public_works
with (security_invoker = false, security_barrier = true)
as
select
  w.id, w.slug, w.title_ru, w.kind, w.publication_year, w.publishing_status,
  w.description_ru,
  case
    when exists (
      select 1 from public.comic_rights r
      where r.work_id = w.id and r.permission = 'cover'
        and r.reading_source_id is null and r.status = 'approved'
        and r.evidence_ref is not null and char_length(btrim(r.evidence_ref)) > 0
        and r.reviewed_by is not null and char_length(btrim(r.reviewed_by)) > 0
        and r.reviewed_at is not null
        and (r.valid_from is null or r.valid_from <= current_date)
        and (r.valid_until is null or r.valid_until >= current_date)
    ) then w.cover_url else null end as cover_url,
  w.total_chapters_known, w.volumes_known, w.genres,
  w.release_date, w.release_date_precision, w.published_at, w.updated_at
from public.comic_works w
where w.publication_status = 'approved'
  and w.published_at is not null and w.published_at <= now()
  and w.title_ru is not null
  and w.title_ru_status in ('source_verified', 'editorially_verified')
  and w.is_adult = false
  and exists (
    select 1 from public.comic_rights r
    where r.work_id = w.id and r.permission = 'metadata'
      and r.reading_source_id is null and r.status = 'approved'
      and r.evidence_ref is not null and char_length(btrim(r.evidence_ref)) > 0
      and r.reviewed_by is not null and char_length(btrim(r.reviewed_by)) > 0
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
  c.id, c.work_id, c.chapter_number, c.chapter_number_text, c.chapter_kind,
  c.volume_number, c.volume_text, c.title_ru, c.language, c.page_count, c.published_at,
  s.id as reading_source_id, s.source_name, s.attribution_text,
  case when s.reading_mode = 'external_link' then 'external_link' else 'permitted_embed' end as reading_mode,
  case
    when s.reading_mode = 'external_link' then c.source_url
    when s.reading_mode = 'permitted_embed' then c.embed_url
    else null
  end as reading_url
from public.comic_chapters c
join public.comic_works w on w.id = c.work_id
join public.comic_reading_sources s on s.id = c.reading_source_id
where w.publication_status = 'approved'
  and w.published_at is not null and w.published_at <= now()
  and w.title_ru is not null
  and w.title_ru_status in ('source_verified', 'editorially_verified')
  and w.is_adult = false
  and exists (
    select 1 from public.comic_rights r
    where r.work_id = w.id and r.permission = 'metadata'
      and r.reading_source_id is null and r.status = 'approved'
      and r.evidence_ref is not null and char_length(btrim(r.evidence_ref)) > 0
      and r.reviewed_by is not null and char_length(btrim(r.reviewed_by)) > 0
      and r.reviewed_at is not null
      and (r.valid_from is null or r.valid_from <= current_date)
      and (r.valid_until is null or r.valid_until >= current_date)
  )
  and c.availability = 'public' and c.language = 'ru' and c.page_count > 0
  and s.is_active and s.language = 'ru'
  and s.terms_review_status = 'approved'
  and s.terms_url is not null and char_length(btrim(s.terms_url)) > 0
  and s.terms_checked_at is not null
  and s.terms_reviewed_by is not null and char_length(btrim(s.terms_reviewed_by)) > 0
  and (
    (s.reading_mode = 'external_link' and c.source_url is not null and exists (
      select 1 from public.comic_rights r
      where r.work_id = w.id and r.reading_source_id = s.id
        and r.permission = 'chapter_link' and r.status = 'approved'
        and r.evidence_ref is not null and char_length(btrim(r.evidence_ref)) > 0
        and r.reviewed_by is not null and char_length(btrim(r.reviewed_by)) > 0
        and r.reviewed_at is not null
        and (r.valid_from is null or r.valid_from <= current_date)
        and (r.valid_until is null or r.valid_until >= current_date)
    ))
    or
    (s.reading_mode = 'permitted_embed' and c.embed_url is not null and exists (
      select 1 from public.comic_rights r
      where r.work_id = w.id and r.reading_source_id = s.id
        and r.permission = 'embed' and r.status = 'approved'
        and r.evidence_ref is not null and char_length(btrim(r.evidence_ref)) > 0
        and r.reviewed_by is not null and char_length(btrim(r.reviewed_by)) > 0
        and r.reviewed_at is not null
        and (r.valid_from is null or r.valid_from <= current_date)
        and (r.valid_until is null or r.valid_until >= current_date)
    ))
  );

revoke all on table public.comic_public_chapters from public;
grant select on table public.comic_public_chapters to anon, authenticated;
grant select on table public.comic_public_chapters to service_role;
comment on view public.comic_public_chapters is
  'Safe public chapter projection. Only approved evidenced work+metadata, approved evidenced chapter_link/embed source, chapter-specific URL, Russian, page_count>0. licensed_hosted excluded.';

drop table if exists public.comic_source_observations;

alter table public.comic_adaptations drop constraint if exists comic_adaptations_normalized_type_check;
alter table public.comic_adaptations drop column if exists normalized_relation_type;

alter table public.comic_people drop constraint if exists comic_people_unidentified_public_check;
alter table public.comic_people drop constraint if exists comic_people_name_bucket_len_check;
alter table public.comic_people drop constraint if exists comic_people_identity_status_check;
alter table public.comic_people drop column if exists name_bucket_key;
alter table public.comic_people drop column if exists identity_status;

update public.comic_works set kind = 'manga' where kind = 'unknown';
alter table public.comic_works drop constraint if exists comic_works_content_rating_is_adult_check;
alter table public.comic_works drop constraint if exists comic_works_content_rating_provenance_check;
alter table public.comic_works drop constraint if exists comic_works_content_rating_url_check;
alter table public.comic_works drop constraint if exists comic_works_content_rating_source_check;
alter table public.comic_works drop constraint if exists comic_works_content_rating_status_check;
alter table public.comic_works drop constraint if exists comic_works_source_kind_raw_check;
alter table public.comic_works alter column kind set default 'manga';
alter table public.comic_works drop constraint if exists comic_works_kind_check;
alter table public.comic_works add constraint comic_works_kind_check
  check (kind in ('manga', 'manhwa', 'manhua', 'webtoon', 'comic', 'one_shot'));
alter table public.comic_works drop column if exists content_rating_evidence_url;
alter table public.comic_works drop column if exists content_rating_checked_at;
alter table public.comic_works drop column if exists content_rating_source;
alter table public.comic_works drop column if exists content_rating_status;
alter table public.comic_works drop column if exists source_kind_raw;

commit;
