-- B3-A Comics data foundation. Additive only: no existing table, column, policy or
-- catalog object is renamed, dropped or rewritten. Target PostgreSQL 15+ (Supabase).
-- Depends on 20261012_titles.sql (public.titles) and auth.users.
--
-- This migration creates storage for source-independent Comics entities. It does NOT
-- import data, publish Comics, create chapter pages, or expose public routes.
-- All rows are internal until rights/publication gates are satisfied (see next migration).

-- ---------------------------------------------------------------------------
-- 1. Canonical work
-- ---------------------------------------------------------------------------
create table if not exists public.comic_works (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null,
  slug text not null,
  title_ru text,
  title_ru_status text not null default 'unverified',
  kind text not null default 'manga',
  country_code char(2),
  publication_year int,
  release_date date,
  release_date_precision text not null default 'unknown',
  publishing_status text not null default 'unknown',
  description_ru text,
  cover_url text,
  total_chapters_known int,
  volumes_known int,
  genres text[] not null default '{}',
  is_adult boolean not null default false,
  publication_status text not null default 'draft',
  published_at timestamptz,
  origin_source_name text not null default 'aninova',
  origin_source_url text,
  origin_fetched_at timestamptz not null default now(),
  metadata_checked_at timestamptz,
  metadata_confidence numeric(3,2),
  search_ru tsvector generated always as (
    to_tsvector('russian'::regconfig,
      coalesce(title_ru, '') || ' ' || coalesce(description_ru, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_works_internal_key_key unique (internal_key),
  constraint comic_works_slug_key unique (slug),
  constraint comic_works_internal_key_check check (internal_key ~ '^comic:[a-z0-9_]+:[A-Za-z0-9._:-]+$'),
  constraint comic_works_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint comic_works_title_ru_len check (title_ru is null or char_length(title_ru) between 1 and 300),
  constraint comic_works_title_ru_cyrillic check (
    title_ru_status not in ('source_verified', 'editorially_verified')
    or (title_ru is not null and title_ru ~ '[А-Яа-яЁё]')
  ),
  constraint comic_works_title_ru_status_check check (
    title_ru_status in ('unverified', 'candidate', 'source_verified', 'editorially_verified', 'name_mismatch', 'no_ru_title', 'rejected')
  ),
  constraint comic_works_kind_check check (kind in ('manga', 'manhwa', 'manhua', 'webtoon', 'comic', 'one_shot')),
  constraint comic_works_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint comic_works_year_check check (publication_year is null or publication_year between 1900 and 2100),
  constraint comic_works_release_check check (
    (release_date is null and release_date_precision = 'unknown')
    or (release_date is not null and release_date_precision in ('day', 'month', 'year'))
  ),
  constraint comic_works_release_precision_check check (release_date_precision in ('day', 'month', 'year', 'unknown')),
  constraint comic_works_publishing_status_check check (publishing_status in ('ongoing', 'completed', 'hiatus', 'cancelled', 'unknown')),
  constraint comic_works_description_len check (description_ru is null or char_length(description_ru) <= 8000),
  constraint comic_works_cover_url_check check (cover_url is null or cover_url ~ '^https://'),
  constraint comic_works_chapters_check check (total_chapters_known is null or total_chapters_known > 0),
  constraint comic_works_volumes_check check (volumes_known is null or volumes_known > 0),
  constraint comic_works_genres_check check (cardinality(genres) <= 32),
  constraint comic_works_publication_status_check check (publication_status in ('draft', 'pending_verification', 'approved', 'rejected', 'expired')),
  constraint comic_works_published_status_check check (published_at is null or publication_status = 'approved'),
  constraint comic_works_origin_source_check check (origin_source_name ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint comic_works_origin_url_check check (origin_source_url is null or origin_source_url ~ '^https://'),
  constraint comic_works_metadata_confidence_check check (metadata_confidence is null or metadata_confidence between 0 and 1)
);

create index if not exists comic_works_published_idx
  on public.comic_works (published_at desc)
  where publication_status = 'approved' and published_at is not null;
create index if not exists comic_works_kind_year_idx
  on public.comic_works (kind, publication_year desc);
create index if not exists comic_works_search_ru_idx
  on public.comic_works using gin (search_ru);
create index if not exists comic_works_title_ru_lower_idx
  on public.comic_works (lower(title_ru))
  where title_ru is not null;

-- ---------------------------------------------------------------------------
-- 2. External identifiers (one row per source id; never overwrite another source)
-- ---------------------------------------------------------------------------
create table if not exists public.comic_external_ids (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.comic_works (id) on delete cascade,
  source_name text not null,
  external_id text not null,
  source_url text,
  is_primary boolean not null default false,
  fetched_at timestamptz not null default now(),
  last_verified_at timestamptz,
  verification_status text not null default 'recorded',
  confidence numeric(3,2),
  source_payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_external_ids_source_check check (source_name ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint comic_external_ids_external_check check (external_id ~ '^[A-Za-z0-9._:-]{1,200}$'),
  constraint comic_external_ids_url_check check (source_url is null or source_url ~ '^https://'),
  constraint comic_external_ids_verification_check check (verification_status in ('recorded', 'source_verified', 'disputed', 'rejected')),
  constraint comic_external_ids_confidence_check check (confidence is null or confidence between 0 and 1),
  constraint comic_external_ids_hash_check check (source_payload_hash is null or source_payload_hash ~ '^[a-f0-9]{64}$'),
  constraint comic_external_ids_verified_after_fetch check (last_verified_at is null or last_verified_at >= fetched_at),
  constraint comic_external_ids_source_id_key unique (source_name, external_id),
  constraint comic_external_ids_work_source_key unique (work_id, source_name)
);
create unique index if not exists comic_external_ids_one_primary_idx
  on public.comic_external_ids (work_id) where is_primary;
create index if not exists comic_external_ids_work_idx
  on public.comic_external_ids (work_id);

-- ---------------------------------------------------------------------------
-- 3. Titles and aliases (public title is separate from all internal aliases)
-- ---------------------------------------------------------------------------
create table if not exists public.comic_aliases (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.comic_works (id) on delete cascade,
  alias text not null,
  alias_type text not null,
  language text not null default 'und',
  is_public boolean not null default false,
  source_name text not null,
  source_url text,
  fetched_at timestamptz not null default now(),
  checked_at timestamptz,
  confidence numeric(3,2),
  verification_status text not null default 'candidate',
  normalized_alias text generated always as (
    lower(btrim(regexp_replace(alias, '[[:space:]]+', ' ', 'g')))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_aliases_alias_len check (char_length(alias) between 1 and 300),
  constraint comic_aliases_type_check check (alias_type in ('alternative_title', 'transliteration', 'official_russian', 'search_alias', 'original_title', 'native_title')),
  constraint comic_aliases_language_check check (language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  constraint comic_aliases_source_check check (source_name ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint comic_aliases_url_check check (source_url is null or source_url ~ '^https://'),
  constraint comic_aliases_confidence_check check (confidence is null or confidence between 0 and 1),
  constraint comic_aliases_verification_check check (verification_status in ('candidate', 'source_verified', 'editorially_verified', 'conflict', 'rejected')),
  constraint comic_aliases_checked_after_fetch check (checked_at is null or checked_at >= fetched_at)
);
create unique index if not exists comic_aliases_unique_idx
  on public.comic_aliases (work_id, source_name, alias_type, normalized_alias);
create index if not exists comic_aliases_work_idx
  on public.comic_aliases (work_id, alias_type);
create index if not exists comic_aliases_normalized_idx
  on public.comic_aliases (normalized_alias);
create index if not exists comic_aliases_search_idx
  on public.comic_aliases using gin (to_tsvector('simple'::regconfig, normalized_alias));

-- ---------------------------------------------------------------------------
-- 4. People and credits (credits are source-specific, never merged silently)
-- ---------------------------------------------------------------------------
create table if not exists public.comic_people (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text generated always as (lower(btrim(canonical_name))) stored,
  display_name_ru text,
  name_status text not null default 'unverified',
  source_name text not null,
  source_person_id text,
  source_url text,
  fetched_at timestamptz not null default now(),
  checked_at timestamptz,
  confidence numeric(3,2),
  verification_status text not null default 'recorded',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_people_canonical_len check (char_length(canonical_name) between 1 and 300),
  constraint comic_people_display_len check (display_name_ru is null or char_length(display_name_ru) between 1 and 300),
  constraint comic_people_display_cyrillic check (display_name_ru is null or display_name_ru ~ '[А-Яа-яЁё]'),
  constraint comic_people_name_status_check check (name_status in ('unverified', 'source_verified', 'editorially_verified', 'rejected')),
  constraint comic_people_source_check check (source_name ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint comic_people_source_person_check check (source_person_id is null or source_person_id ~ '^[A-Za-z0-9._:-]{1,200}$'),
  constraint comic_people_url_check check (source_url is null or source_url ~ '^https://'),
  constraint comic_people_confidence_check check (confidence is null or confidence between 0 and 1),
  constraint comic_people_verification_check check (verification_status in ('recorded', 'source_verified', 'editorially_verified', 'disputed', 'rejected')),
  constraint comic_people_checked_after_fetch check (checked_at is null or checked_at >= fetched_at)
);
create unique index if not exists comic_people_source_person_idx
  on public.comic_people (source_name, source_person_id)
  where source_person_id is not null;
create index if not exists comic_people_normalized_idx
  on public.comic_people (normalized_name);

create table if not exists public.comic_credits (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.comic_works (id) on delete cascade,
  person_id uuid not null references public.comic_people (id) on delete cascade,
  role text not null,
  billing_order int not null default 0,
  source_name text not null,
  source_url text,
  fetched_at timestamptz not null default now(),
  checked_at timestamptz,
  confidence numeric(3,2),
  verification_status text not null default 'recorded',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_credits_role_check check (role in ('author', 'writer', 'artist', 'illustrator', 'editor', 'original_creator', 'other')),
  constraint comic_credits_order_check check (billing_order >= 0),
  constraint comic_credits_source_check check (source_name ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint comic_credits_url_check check (source_url is null or source_url ~ '^https://'),
  constraint comic_credits_confidence_check check (confidence is null or confidence between 0 and 1),
  constraint comic_credits_verification_check check (verification_status in ('recorded', 'source_verified', 'editorially_verified', 'disputed', 'rejected')),
  constraint comic_credits_checked_after_fetch check (checked_at is null or checked_at >= fetched_at),
  constraint comic_credits_unique_source_key unique (work_id, person_id, role, source_name)
);
create index if not exists comic_credits_work_idx on public.comic_credits (work_id);
create index if not exists comic_credits_person_idx on public.comic_credits (person_id);

-- ---------------------------------------------------------------------------
-- 5. Comic-comic relations. Source type is retained; normalized type is separate.
-- ---------------------------------------------------------------------------
create table if not exists public.comic_relations (
  id uuid primary key default gen_random_uuid(),
  from_work_id uuid not null references public.comic_works (id) on delete cascade,
  to_work_id uuid not null references public.comic_works (id) on delete cascade,
  relation_type text not null,
  source_relation_type text not null,
  source_name text not null,
  source_url text,
  observed_at timestamptz not null default now(),
  checked_at timestamptz,
  confidence numeric(3,2),
  verification_status text not null default 'recorded',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_relations_not_self check (from_work_id <> to_work_id),
  constraint comic_relations_type_check check (relation_type in ('ADAPTED_FROM', 'SEQUEL', 'PREQUEL', 'SPIN_OFF', 'ALTERNATIVE', 'SAME_FRANCHISE', 'RELATED')),
  constraint comic_relations_symmetric_order check (
    relation_type not in ('ALTERNATIVE', 'SAME_FRANCHISE', 'RELATED')
    or from_work_id < to_work_id
  ),
  constraint comic_relations_source_type_len check (char_length(source_relation_type) between 1 and 64),
  constraint comic_relations_source_check check (source_name ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint comic_relations_url_check check (source_url is null or source_url ~ '^https://'),
  constraint comic_relations_confidence_check check (confidence is null or confidence between 0 and 1),
  constraint comic_relations_verification_check check (verification_status in ('recorded', 'source_verified', 'editorially_verified', 'disputed', 'rejected')),
  constraint comic_relations_checked_after_observed check (checked_at is null or checked_at >= observed_at),
  constraint comic_relations_unique_source_key unique (from_work_id, to_work_id, relation_type, source_name)
);
create index if not exists comic_relations_from_idx on public.comic_relations (from_work_id);
create index if not exists comic_relations_to_idx on public.comic_relations (to_work_id);

-- ---------------------------------------------------------------------------
-- 6. Anime <-> comics links. Direction/confidence are explicit, not inferred at read.
-- ---------------------------------------------------------------------------
create table if not exists public.comic_adaptations (
  id uuid primary key default gen_random_uuid(),
  anime_id int not null references public.titles (id) on delete cascade,
  comic_work_id uuid not null references public.comic_works (id) on delete cascade,
  raw_relation_type text not null default 'ADAPTATION',
  direction text not null default 'unknown',
  confidence_level text not null default 'unknown',
  basis text not null default 'unknown',
  is_primary boolean not null default false,
  source_name text not null,
  source_url text,
  observed_at timestamptz not null default now(),
  checked_at timestamptz,
  verification_status text not null default 'recorded',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_adaptations_direction_check check (direction in ('comic_is_source', 'anime_is_source', 'unknown')),
  constraint comic_adaptations_confidence_check check (confidence_level in ('confirmed', 'inferred', 'unknown')),
  constraint comic_adaptations_basis_len check (char_length(basis) between 1 and 64),
  constraint comic_adaptations_primary_confirmed check (not is_primary or confidence_level = 'confirmed'),
  constraint comic_adaptations_confirmed_basis check (confidence_level <> 'confirmed' or basis <> 'unknown'),
  constraint comic_adaptations_raw_len check (char_length(raw_relation_type) between 1 and 64),
  constraint comic_adaptations_source_check check (source_name ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint comic_adaptations_url_check check (source_url is null or source_url ~ '^https://'),
  constraint comic_adaptations_verification_check check (verification_status in ('recorded', 'source_verified', 'editorially_verified', 'disputed', 'rejected')),
  constraint comic_adaptations_checked_after_observed check (checked_at is null or checked_at >= observed_at),
  constraint comic_adaptations_anime_work_key unique (anime_id, comic_work_id)
);
create unique index if not exists comic_adaptations_one_primary_idx
  on public.comic_adaptations (anime_id) where is_primary;
create index if not exists comic_adaptations_anime_idx on public.comic_adaptations (anime_id);
create index if not exists comic_adaptations_work_idx on public.comic_adaptations (comic_work_id);

-- ---------------------------------------------------------------------------
-- 7. Reading sources. A source is not a permission; rights are stored separately.
-- ---------------------------------------------------------------------------
create table if not exists public.comic_reading_sources (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.comic_works (id) on delete cascade,
  source_name text not null,
  reading_mode text not null,
  language text not null default 'ru',
  source_url text,
  embed_url text,
  attribution_text text,
  terms_url text,
  terms_review_status text not null default 'unknown',
  terms_checked_at timestamptz,
  is_active boolean not null default false,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_reading_sources_name_len check (char_length(source_name) between 1 and 120),
  constraint comic_reading_sources_mode_check check (reading_mode in ('external_link', 'permitted_embed', 'licensed_hosted')),
  constraint comic_reading_sources_language_check check (language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  constraint comic_reading_sources_url_check check (source_url is null or source_url ~ '^https://'),
  constraint comic_reading_sources_embed_check check (embed_url is null or embed_url ~ '^https://'),
  constraint comic_reading_sources_mode_fields_check check (
    (reading_mode = 'external_link' and source_url is not null)
    or (reading_mode = 'permitted_embed' and embed_url is not null)
    or reading_mode = 'licensed_hosted'
  ),
  constraint comic_reading_sources_terms_status_check check (terms_review_status in ('unknown', 'pending_review', 'approved', 'rejected', 'expired')),
  constraint comic_reading_sources_terms_approved_check check (terms_review_status <> 'approved' or terms_checked_at is not null),
  constraint comic_reading_sources_terms_url_check check (terms_url is null or terms_url ~ '^https://'),
  constraint comic_reading_sources_notes_len check (notes_internal is null or char_length(notes_internal) <= 4000),
  constraint comic_reading_sources_unique_key unique (work_id, source_name, reading_mode, language),
  constraint comic_reading_sources_work_id_key unique (work_id, id)
);
create index if not exists comic_reading_sources_work_idx on public.comic_reading_sources (work_id);

-- ---------------------------------------------------------------------------
-- 8. Rights: five separate permissions; unknown is the default and is not consent.
-- ---------------------------------------------------------------------------
create table if not exists public.comic_rights (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.comic_works (id) on delete cascade,
  reading_source_id uuid,
  permission text not null,
  status text not null default 'unknown',
  valid_from date,
  valid_until date,
  evidence_ref text,
  reviewed_by text,
  reviewed_at timestamptz,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_rights_permission_check check (permission in ('metadata', 'cover', 'chapter_link', 'embed', 'hosting')),
  constraint comic_rights_status_check check (status in ('unknown', 'pending_review', 'approved', 'rejected', 'expired')),
  constraint comic_rights_scope_check check (
    (permission in ('metadata', 'cover') and reading_source_id is null)
    or (permission in ('chapter_link', 'embed', 'hosting') and reading_source_id is not null)
  ),
  constraint comic_rights_review_check check (
    status not in ('approved', 'rejected')
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint comic_rights_expired_check check (status <> 'expired' or valid_until is not null),
  constraint comic_rights_validity_check check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint comic_rights_evidence_len check (evidence_ref is null or char_length(evidence_ref) <= 500),
  constraint comic_rights_reviewer_len check (reviewed_by is null or char_length(reviewed_by) between 1 and 120),
  constraint comic_rights_notes_len check (notes_internal is null or char_length(notes_internal) <= 4000),
  constraint comic_rights_source_work_fkey foreign key (work_id, reading_source_id)
    references public.comic_reading_sources (work_id, id) on delete cascade
);
create unique index if not exists comic_rights_work_permission_idx
  on public.comic_rights (work_id, permission)
  where reading_source_id is null;
create unique index if not exists comic_rights_source_permission_idx
  on public.comic_rights (work_id, reading_source_id, permission)
  where reading_source_id is not null;
create index if not exists comic_rights_gate_idx
  on public.comic_rights (work_id, permission, status);
create index if not exists comic_rights_source_idx
  on public.comic_rights (reading_source_id);

-- ---------------------------------------------------------------------------
-- 9. Chapters. Number text is authoritative for specials/fractions; no pages table.
-- ---------------------------------------------------------------------------
create table if not exists public.comic_chapters (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.comic_works (id) on delete cascade,
  reading_source_id uuid,
  chapter_number numeric(10,3),
  chapter_number_text text not null,
  chapter_kind text not null default 'regular',
  volume_number numeric(6,2),
  volume_text text,
  title_ru text,
  language text not null default 'ru',
  page_count int not null default 0,
  published_at date,
  date_precision text not null default 'unknown',
  availability text not null default 'hidden',
  source_chapter_ref text,
  source_url text,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_chapters_number_text_len check (char_length(chapter_number_text) between 1 and 32),
  constraint comic_chapters_number_kind_check check (
    (chapter_kind = 'regular' and chapter_number is not null and chapter_number > 0)
    or (chapter_kind <> 'regular' and chapter_number is null)
  ),
  constraint comic_chapters_kind_check check (chapter_kind in ('regular', 'bonus', 'special', 'extra', 'one_shot')),
  constraint comic_chapters_volume_check check (volume_number is null or volume_number > 0),
  constraint comic_chapters_title_len check (title_ru is null or char_length(title_ru) between 1 and 300),
  constraint comic_chapters_language_check check (language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  constraint comic_chapters_pages_check check (page_count >= 0),
  constraint comic_chapters_date_check check (
    (published_at is null and date_precision = 'unknown')
    or (published_at is not null and date_precision in ('day', 'month', 'year'))
  ),
  constraint comic_chapters_date_precision_check check (date_precision in ('day', 'month', 'year', 'unknown')),
  constraint comic_chapters_availability_check check (availability in ('public', 'hidden')),
  constraint comic_chapters_ref_len check (source_chapter_ref is null or char_length(source_chapter_ref) <= 200),
  constraint comic_chapters_url_check check (source_url is null or source_url ~ '^https://'),
  constraint comic_chapters_checked_after_seen check (last_checked_at is null or last_checked_at >= first_seen_at),
  constraint comic_chapters_unique_number unique nulls not distinct (work_id, language, chapter_number_text, reading_source_id),
  constraint comic_chapters_source_work_fkey foreign key (work_id, reading_source_id)
    references public.comic_reading_sources (work_id, id) on delete set null (reading_source_id)
);
create index if not exists comic_chapters_work_number_idx
  on public.comic_chapters (work_id, chapter_number, chapter_number_text);
create index if not exists comic_chapters_source_idx
  on public.comic_chapters (reading_source_id);
create index if not exists comic_chapters_public_idx
  on public.comic_chapters (work_id, language)
  where availability = 'public' and page_count > 0;

-- ---------------------------------------------------------------------------
-- 10. Import/sync audit. No tokens, headers or private payloads are stored here.
-- ---------------------------------------------------------------------------
create table if not exists public.comic_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  run_kind text not null,
  adapter_version text not null default 'unknown',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_snapshot_at timestamptz,
  terms_review_status text not null default 'unknown',
  records_seen int not null default 0,
  records_inserted int not null default 0,
  records_updated int not null default 0,
  records_skipped int not null default 0,
  records_failed int not null default 0,
  details jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  constraint comic_sync_runs_source_check check (source_name ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint comic_sync_runs_kind_check check (run_kind in ('graph_snapshot', 'metadata_verify', 'metadata_import', 'rights_review', 'reconciliation', 'manual')),
  constraint comic_sync_runs_status_check check (status in ('running', 'success', 'partial', 'failed', 'cancelled')),
  constraint comic_sync_runs_finished_check check (finished_at is null or finished_at >= started_at),
  constraint comic_sync_runs_terms_check check (terms_review_status in ('unknown', 'pending_review', 'approved', 'rejected', 'expired')),
  constraint comic_sync_runs_counts_check check (records_seen >= 0 and records_inserted >= 0 and records_updated >= 0 and records_skipped >= 0 and records_failed >= 0),
  constraint comic_sync_runs_details_check check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 16384),
  constraint comic_sync_runs_error_len check (error_summary is null or char_length(error_summary) <= 4000)
);
create index if not exists comic_sync_runs_source_started_idx
  on public.comic_sync_runs (source_name, started_at desc);

-- ---------------------------------------------------------------------------
-- 11. Review queue. Internal only; never exposed through anon/authenticated API.
-- ---------------------------------------------------------------------------
create table if not exists public.comic_review_queue (
  id uuid primary key default gen_random_uuid(),
  work_id uuid references public.comic_works (id) on delete cascade,
  item_type text not null,
  item_ref text,
  reason text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  priority smallint not null default 50,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  constraint comic_review_queue_type_check check (item_type in ('work', 'external_id', 'alias', 'person', 'credit', 'relation', 'adaptation', 'chapter', 'rights', 'reading_source', 'sync_run')),
  constraint comic_review_queue_reason_check check (reason in ('missing_ru_title', 'name_mismatch', 'duplicate_alias', 'duplicate_external_id', 'ambiguous_external_id', 'rights_unknown', 'rights_expired', 'source_conflict', 'unsupported_relation', 'unsupported_reading_mode', 'manual')),
  constraint comic_review_queue_severity_check check (severity in ('low', 'medium', 'high')),
  constraint comic_review_queue_status_check check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  constraint comic_review_queue_priority_check check (priority between 0 and 100),
  constraint comic_review_queue_ref_len check (item_ref is null or char_length(item_ref) <= 300),
  constraint comic_review_queue_details_check check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 16384),
  constraint comic_review_queue_resolved_check check (
    (status in ('resolved', 'dismissed') and resolved_at is not null)
    or (status in ('open', 'in_review') and resolved_at is null)
  )
);
create unique index if not exists comic_review_queue_open_unique_idx
  on public.comic_review_queue (
    coalesce(work_id, '00000000-0000-0000-0000-000000000000'::uuid),
    item_type,
    reason,
    coalesce(item_ref, '')
  )
  where status = 'open';
create index if not exists comic_review_queue_status_idx
  on public.comic_review_queue (status, priority desc, created_at);
create index if not exists comic_review_queue_work_idx
  on public.comic_review_queue (work_id);

-- ---------------------------------------------------------------------------
-- 12. B4-facing user tables. Isolated additive layer; existing anime library
--     (profile_lists/profile_history) is untouched.
-- ---------------------------------------------------------------------------
create table if not exists public.user_comic_library (
  user_id uuid not null references auth.users (id) on delete cascade,
  comic_work_id uuid not null references public.comic_works (id) on delete cascade,
  status text not null default 'planned',
  score numeric(3,1),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, comic_work_id),
  constraint user_comic_library_status_check check (status in ('planned', 'reading', 'completed', 'on_hold', 'dropped')),
  constraint user_comic_library_score_check check (score is null or (score >= 1 and score <= 10)),
  constraint user_comic_library_dates_check check (finished_at is null or started_at is null or finished_at >= started_at)
);
create index if not exists user_comic_library_work_idx
  on public.user_comic_library (comic_work_id);
create index if not exists user_comic_library_user_updated_idx
  on public.user_comic_library (user_id, updated_at desc);

create table if not exists public.user_comic_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  chapter_id uuid not null references public.comic_chapters (id) on delete cascade,
  page int not null default 0,
  completed boolean not null default false,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, chapter_id),
  constraint user_comic_progress_page_check check (page >= 0)
);
create index if not exists user_comic_progress_chapter_idx
  on public.user_comic_progress (chapter_id);
create index if not exists user_comic_progress_user_read_idx
  on public.user_comic_progress (user_id, last_read_at desc);

-- ---------------------------------------------------------------------------
-- 13. Updated-at trigger (invoker; no SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create or replace function public.comic_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.comic_touch_updated_at() from public;

drop trigger if exists comic_works_touch on public.comic_works;
create trigger comic_works_touch before update on public.comic_works
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_external_ids_touch on public.comic_external_ids;
create trigger comic_external_ids_touch before update on public.comic_external_ids
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_aliases_touch on public.comic_aliases;
create trigger comic_aliases_touch before update on public.comic_aliases
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_people_touch on public.comic_people;
create trigger comic_people_touch before update on public.comic_people
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_credits_touch on public.comic_credits;
create trigger comic_credits_touch before update on public.comic_credits
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_relations_touch on public.comic_relations;
create trigger comic_relations_touch before update on public.comic_relations
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_adaptations_touch on public.comic_adaptations;
create trigger comic_adaptations_touch before update on public.comic_adaptations
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_reading_sources_touch on public.comic_reading_sources;
create trigger comic_reading_sources_touch before update on public.comic_reading_sources
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_rights_touch on public.comic_rights;
create trigger comic_rights_touch before update on public.comic_rights
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_chapters_touch on public.comic_chapters;
create trigger comic_chapters_touch before update on public.comic_chapters
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_review_queue_touch on public.comic_review_queue;
create trigger comic_review_queue_touch before update on public.comic_review_queue
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists user_comic_library_touch on public.user_comic_library;
create trigger user_comic_library_touch before update on public.user_comic_library
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists user_comic_progress_touch on public.user_comic_progress;
create trigger user_comic_progress_touch before update on public.user_comic_progress
  for each row execute function public.comic_touch_updated_at();

comment on table public.comic_works is 'B3-A canonical comics work. Internal by default; public projection is rights-gated in 20261123_comics_rls.sql.';
comment on table public.comic_aliases is 'All titles/aliases including original/native/search. Never use original/native as a public Russian fallback.';
comment on table public.comic_rights is 'Five independent permissions; default unknown. API availability is not a permission.';
comment on table public.comic_chapters is 'Chapter metadata only. No chapter page URLs/Storage objects in B3-A.';
comment on table public.user_comic_library is 'B4-facing user data; own-row RLS only, existing anime library untouched.';