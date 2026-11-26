-- B3-C data-quality layer. Additive only: no B3-A/B3-B migration is edited.
-- Stores source observations and conflicts, distinguishes unverified work kind,
-- records adult classification explicitly and prevents name-only author buckets
-- from being treated as verified person identities. No import, publication or
-- public API is added. Disposable/local PostgreSQL only for verification.

-- 1. Canonical work: raw source kind, unknown kind, explicit adult status.
alter table public.comic_works
  add column if not exists source_kind_raw text,
  add column if not exists content_rating_status text not null default 'unknown',
  add column if not exists content_rating_source text,
  add column if not exists content_rating_checked_at timestamptz,
  add column if not exists content_rating_evidence_url text;

alter table public.comic_works alter column kind set default 'unknown';
alter table public.comic_works drop constraint if exists comic_works_kind_check;
alter table public.comic_works add constraint comic_works_kind_check
  check (kind in ('manga', 'manhwa', 'manhua', 'webtoon', 'comic', 'one_shot', 'unknown'));
alter table public.comic_works drop constraint if exists comic_works_source_kind_raw_check;
alter table public.comic_works add constraint comic_works_source_kind_raw_check
  check (source_kind_raw is null or char_length(source_kind_raw) between 1 and 32);
alter table public.comic_works drop constraint if exists comic_works_content_rating_status_check;
alter table public.comic_works add constraint comic_works_content_rating_status_check
  check (content_rating_status in ('unknown', 'verified_non_adult', 'adult'));
alter table public.comic_works drop constraint if exists comic_works_content_rating_source_check;
alter table public.comic_works add constraint comic_works_content_rating_source_check
  check (content_rating_source is null or content_rating_source ~ '^[a-z][a-z0-9_]{1,31}$');
alter table public.comic_works drop constraint if exists comic_works_content_rating_url_check;
alter table public.comic_works add constraint comic_works_content_rating_url_check
  check (content_rating_evidence_url is null or content_rating_evidence_url ~ '^https://');
alter table public.comic_works drop constraint if exists comic_works_content_rating_provenance_check;
alter table public.comic_works add constraint comic_works_content_rating_provenance_check
  check (
    content_rating_status = 'unknown'
    or (content_rating_source is not null and content_rating_checked_at is not null)
  );
alter table public.comic_works drop constraint if exists comic_works_content_rating_is_adult_check;
alter table public.comic_works add constraint comic_works_content_rating_is_adult_check
  check (
    (content_rating_status <> 'verified_non_adult' or is_adult = false)
    and (content_rating_status <> 'adult' or is_adult = true)
  );

comment on column public.comic_works.source_kind_raw is
  'Raw source format (for example AniList MANGA/ONE_SHOT). Never used to infer manhwa/manhua without a verified source.';
comment on column public.comic_works.content_rating_status is
  'Explicit age classification. unknown means not verified; absence of an adult flag is not proof of non-adult.';
comment on column public.comic_works.kind is
  'Canonical kind. unknown is valid when the source only says MANGA or gives no reliable format.';

-- 2. People: a normalized name bucket is not a person identity.
alter table public.comic_people
  add column if not exists identity_status text not null default 'unidentified_name_bucket',
  add column if not exists name_bucket_key text;
alter table public.comic_people drop constraint if exists comic_people_identity_status_check;
alter table public.comic_people add constraint comic_people_identity_status_check
  check (identity_status in ('unidentified_name_bucket', 'source_identified', 'manually_verified'));
alter table public.comic_people drop constraint if exists comic_people_name_bucket_len_check;
alter table public.comic_people add constraint comic_people_name_bucket_len_check
  check (name_bucket_key is null or char_length(name_bucket_key) between 1 and 500);
alter table public.comic_people drop constraint if exists comic_people_unidentified_public_check;
alter table public.comic_people add constraint comic_people_unidentified_public_check
  check (identity_status <> 'unidentified_name_bucket' or (is_public = false and source_person_id is null));

comment on column public.comic_people.identity_status is
  'unidentified_name_bucket means the row is a per-work name observation, not a confirmed person. source_person_id stays NULL.';

-- 3. Relations: preserve the raw type and a separate conservative normalization.
alter table public.comic_adaptations
  add column if not exists normalized_relation_type text not null default 'unknown';
alter table public.comic_adaptations drop constraint if exists comic_adaptations_normalized_type_check;
alter table public.comic_adaptations add constraint comic_adaptations_normalized_type_check
  check (normalized_relation_type in (
    'ADAPTATION', 'ALTERNATIVE', 'CHARACTER', 'PARENT', 'PREQUEL', 'SEQUEL',
    'SIDE_STORY', 'SPIN_OFF', 'OTHER', 'unknown'
  ));
comment on column public.comic_adaptations.normalized_relation_type is
  'Conservative normalization of raw_relation_type. unrelated types become unknown, never RELATED.';

-- 4. Immutable source observations. Each row keeps the exact source value and
-- provenance; conflicts are marked, never resolved by overwrite.
create table if not exists public.comic_source_observations (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.comic_works (id) on delete cascade,
  field_name text not null,
  source_name text not null,
  external_id text,
  join_key text,
  source_url text,
  observed_at timestamptz not null,
  confidence numeric(3,2),
  verification_status text not null default 'recorded',
  source_payload_hash text not null,
  value_json jsonb not null,
  is_conflict boolean not null default false,
  conflict_group text,
  created_at timestamptz not null default now(),
  constraint comic_source_observations_field_check check (field_name in (
    'kind', 'publication_year', 'chapters', 'volumes', 'mal_id', 'shikimori_id',
    'title_ru', 'title_original', 'content_rating', 'adult_status'
  )),
  constraint comic_source_observations_source_check check (source_name ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint comic_source_observations_hash_check check (source_payload_hash ~ '^[a-f0-9]{64}$'),
  constraint comic_source_observations_url_check check (source_url is null or source_url ~ '^https://'),
  constraint comic_source_observations_confidence_check check (confidence is null or confidence between 0 and 1),
  constraint comic_source_observations_verification_check check (verification_status in ('recorded', 'source_verified', 'editorially_verified', 'candidate', 'conflict', 'disputed', 'rejected')),
  constraint comic_source_observations_conflict_group_check check (
    (is_conflict = false and conflict_group is null)
    or (is_conflict = true and conflict_group is not null and char_length(conflict_group) between 1 and 300)
  ),
  constraint comic_source_observations_identity_key unique
    (work_id, field_name, source_name, source_payload_hash)
);
create index if not exists comic_source_observations_work_idx
  on public.comic_source_observations (work_id, field_name);
create index if not exists comic_source_observations_conflict_idx
  on public.comic_source_observations (work_id, field_name)
  where is_conflict;

comment on table public.comic_source_observations is
  'Per-source values with URL, observation time, confidence and payload hash. Conflicts are preserved and queued, not overwritten.';

-- 5. Review queue reasons introduced by B3-C.
alter table public.comic_review_queue drop constraint if exists comic_review_queue_reason_check;
alter table public.comic_review_queue add constraint comic_review_queue_reason_check
  check (reason in (
    'missing_ru_title', 'name_mismatch', 'duplicate_alias', 'duplicate_external_id',
    'ambiguous_external_id', 'rights_unknown', 'rights_expired', 'source_conflict',
    'unsupported_relation', 'unsupported_reading_mode', 'manual',
    'source_metadata_conflict', 'kind_unknown', 'duplicate_public_title',
    'relation_evidence_conflict', 'ambiguous_people_identity', 'missing_provenance'
  ));

-- 6. Server-only access for the new observation table.
alter table public.comic_source_observations enable row level security;
revoke all on table public.comic_source_observations from public, anon, authenticated;
grant select, insert, update, delete on table public.comic_source_observations to service_role;
drop policy if exists comic_source_observations_service_all on public.comic_source_observations;
create policy comic_source_observations_service_all on public.comic_source_observations
  for all to service_role using (true) with check (true);

-- 7. Public cards and chapters additionally require explicit non-adult verification.
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
  and w.content_rating_status = 'verified_non_adult'
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
  'Safe public cards: approved work, verified Russian title, approved evidenced metadata right, is_adult=false and content_rating_status=verified_non_adult. No original titles/provenance.';

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
  and w.content_rating_status = 'verified_non_adult'
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
  'Safe public chapter projection. Requires explicit verified_non_adult work status in addition to all B3-B rights/evidence gates.';
