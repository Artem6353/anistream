-- B3-E: official announcement monitor storage.
--
-- Scope: a review queue for official anime-adaptation announcements. It never
-- publishes anything by itself:
--   * every ingested item starts as pending_review;
--   * confirmed/delayed/cancelled/withdrawn require a confirmation URL and time;
--   * confirmed rows never create or change comic_adaptations automatically;
--   * source rows are an allowlist (https only, one domain per source).
--
-- History is append-only: comic_announcement_events rejects UPDATE/DELETE/TRUNCATE.
--
-- Access: service_role only. No public view is created in B3-E because nothing
-- here has been editorially confirmed yet; exposing it would imply publication.
create table if not exists public.comic_announcement_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null default 'rss',
  url text,
  domain text not null,
  language text not null default 'en',
  is_official boolean not null default true,
  is_enabled boolean not null default true,
  fetched_at timestamptz,
  etag text,
  last_modified text,
  last_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_announcement_sources_slug_check check (slug ~ '^[a-z][a-z0-9-]{1,63}$'),
  constraint comic_announcement_sources_name_len check (char_length(name) between 2 and 200),
  constraint comic_announcement_sources_kind_check check (kind in ('rss', 'atom', 'manual')),
  constraint comic_announcement_sources_domain_check check (domain ~ '^[a-z0-9][a-z0-9.-]{1,252}$'),
  constraint comic_announcement_sources_language_check check (language ~ '^[a-z]{2}$'),
  constraint comic_announcement_sources_url_check check (url is null or url ~ '^https://'),
  constraint comic_announcement_sources_url_by_kind_check check (
    (kind = 'manual' and url is null) or (kind <> 'manual' and url is not null)
  )
);
comment on table public.comic_announcement_sources is
  'Allowlisted official announcement feeds. https only; one domain per source; manual sources carry no URL.';
create index if not exists comic_announcement_sources_enabled_idx
  on public.comic_announcement_sources (is_enabled, kind);
create table if not exists public.comic_adaptation_announcements (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.comic_announcement_sources (id) on delete restrict,
  item_key text not null,
  title text not null,
  summary text,
  url text not null,
  published_at timestamptz,
  observed_at timestamptz not null default now(),
  detected_keywords text[] not null default '{}',
  status text not null default 'pending_review',
  confirmation_url text,
  confirmed_at timestamptz,
  comic_work_id uuid references public.comic_works (id) on delete set null,
  anime_id int references public.titles (id) on delete set null,
  content_hash text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comic_adaptation_announcements_item_key_check
    check (char_length(item_key) between 1 and 512),
  constraint comic_adaptation_announcements_title_len
    check (char_length(title) between 1 and 500),
  constraint comic_adaptation_announcements_url_check check (url ~ '^https://'),
  constraint comic_adaptation_announcements_confirmation_url_check
    check (confirmation_url is null or confirmation_url ~ '^https://'),
  constraint comic_adaptation_announcements_hash_check
    check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint comic_adaptation_announcements_status_check check (status in (
    'rumour', 'pending_review', 'confirmed', 'delayed', 'cancelled', 'withdrawn', 'rejected'
  )),
  constraint comic_adaptation_announcements_confirmation_check check (
    (status in ('confirmed', 'delayed', 'cancelled', 'withdrawn'))
      = (confirmation_url is not null and confirmed_at is not null)
  ),
  constraint comic_adaptation_announcements_rejected_check check (
    status <> 'rejected' or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint comic_adaptation_announcements_source_key unique (source_id, item_key)
);
comment on table public.comic_adaptation_announcements is
  'Official announcement candidates for anime adaptations. Default pending_review; confirmed statuses require a confirmation URL and time. NEVER auto-links comic_adaptations.';
create index if not exists comic_adaptation_announcements_status_idx
  on public.comic_adaptation_announcements (status, observed_at desc);
create index if not exists comic_adaptation_announcements_anime_idx
  on public.comic_adaptation_announcements (anime_id) where anime_id is not null;
create index if not exists comic_adaptation_announcements_work_idx
  on public.comic_adaptation_announcements (comic_work_id) where comic_work_id is not null;
create table if not exists public.comic_announcement_events (
  id bigserial primary key,
  announcement_id uuid not null references public.comic_adaptation_announcements (id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  actor text not null default 'monitor',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint comic_announcement_events_type_check check (event_type in (
    'ingested', 'keyword_detected', 'status_changed', 'linked', 'note'
  )),
  constraint comic_announcement_events_actor_len check (char_length(actor) between 1 and 64)
);
comment on table public.comic_announcement_events is
  'Append-only audit trail for announcement status changes. UPDATE/DELETE/TRUNCATE are rejected by triggers.';
create index if not exists comic_announcement_events_announcement_idx
  on public.comic_announcement_events (announcement_id, created_at desc);
create or replace function public.comic_announcement_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'comic_announcement_events is append-only; insert a new event instead'
    using errcode = 'restrict_violation';
end;
$$;
revoke all on function public.comic_announcement_events_append_only() from public, anon, authenticated;
grant execute on function public.comic_announcement_events_append_only() to service_role;
drop trigger if exists comic_announcement_events_no_update_delete on public.comic_announcement_events;
create trigger comic_announcement_events_no_update_delete
  before update or delete on public.comic_announcement_events
  for each row execute function public.comic_announcement_events_append_only();
drop trigger if exists comic_announcement_events_no_truncate on public.comic_announcement_events;
create trigger comic_announcement_events_no_truncate
  before truncate on public.comic_announcement_events
  for each statement execute function public.comic_announcement_events_append_only();
drop trigger if exists comic_announcement_sources_touch on public.comic_announcement_sources;
create trigger comic_announcement_sources_touch before update on public.comic_announcement_sources
  for each row execute function public.comic_touch_updated_at();
drop trigger if exists comic_adaptation_announcements_touch on public.comic_adaptation_announcements;
create trigger comic_adaptation_announcements_touch before update on public.comic_adaptation_announcements
  for each row execute function public.comic_touch_updated_at();
alter table public.comic_announcement_sources enable row level security;
alter table public.comic_adaptation_announcements enable row level security;
alter table public.comic_announcement_events enable row level security;
revoke all on table public.comic_announcement_sources from public, anon, authenticated, service_role;
revoke all on table public.comic_adaptation_announcements from public, anon, authenticated, service_role;
revoke all on table public.comic_announcement_events from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.comic_announcement_sources to service_role;
grant select, insert, update, delete on table public.comic_adaptation_announcements to service_role;
grant select, insert on table public.comic_announcement_events to service_role;
grant usage, select on sequence public.comic_announcement_events_id_seq to service_role;
drop policy if exists comic_announcement_sources_service_all on public.comic_announcement_sources;
create policy comic_announcement_sources_service_all on public.comic_announcement_sources
  for all to service_role using (true) with check (true);
drop policy if exists comic_adaptation_announcements_service_all on public.comic_adaptation_announcements;
create policy comic_adaptation_announcements_service_all on public.comic_adaptation_announcements
  for all to service_role using (true) with check (true);
drop policy if exists comic_announcement_events_service_select on public.comic_announcement_events;
create policy comic_announcement_events_service_select on public.comic_announcement_events
  for select to service_role using (true);
drop policy if exists comic_announcement_events_service_insert on public.comic_announcement_events;
create policy comic_announcement_events_service_insert on public.comic_announcement_events
  for insert to service_role with check (true);
-- Seed: feeds that were fetched successfully on 2026-11-26 and returned valid RSS.
-- Domains are the allowlist; the monitor refuses any other host.
insert into public.comic_announcement_sources (slug, name, kind, url, domain, language, is_official)
values
  ('seven-seas', 'Seven Seas Entertainment', 'rss', 'https://sevenseasentertainment.com/feed/', 'sevenseasentertainment.com', 'en', true),
  ('kodansha-usa', 'Kodansha USA', 'rss', 'https://kodansha.us/feed/', 'kodansha.us', 'en', true),
  ('mappa', 'MAPPA', 'rss', 'https://www.mappa.co.jp/feed/', 'mappa.co.jp', 'ja', true),
  ('bones', 'BONES', 'rss', 'https://www.bones.co.jp/feed/', 'bones.co.jp', 'ja', true),
  ('shueisha', 'Shueisha', 'rss', 'https://www.shueisha.co.jp/feed/', 'shueisha.co.jp', 'ja', true)
on conflict (slug) do nothing;
