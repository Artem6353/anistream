-- B3-C.1 integrity hardening. Additive only: B3-A/B3-B/B3-C
-- migrations are not edited.
--
-- 1. comic_source_observations becomes an append-only journal. The work FK
--    uses RESTRICT, UPDATE/DELETE/TRUNCATE are denied to service_role, and
--    triggers reject mutation even for a table owner.
-- 2. comic_people identity statuses require explicit, checkable provenance.
--    SQL can validate the presence and shape of evidence, not whether an
--    external source actually issued an ID or confirmed a person.

-- 1. Append-only source observations.

alter table public.comic_source_observations
  drop constraint if exists comic_source_observations_work_id_fkey;
alter table public.comic_source_observations
  add constraint comic_source_observations_work_id_fkey
  foreign key (work_id) references public.comic_works (id) on delete restrict;

create or replace function public.comic_source_observations_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'comic_source_observations is append-only; insert a new observation instead'
    using errcode = 'restrict_violation';
end;
$$;

revoke all on function public.comic_source_observations_append_only() from public, anon, authenticated;
grant execute on function public.comic_source_observations_append_only() to service_role;

drop trigger if exists comic_source_observations_no_update_delete on public.comic_source_observations;
create trigger comic_source_observations_no_update_delete
  before update or delete on public.comic_source_observations
  for each row execute function public.comic_source_observations_append_only();

drop trigger if exists comic_source_observations_no_truncate on public.comic_source_observations;
create trigger comic_source_observations_no_truncate
  before truncate on public.comic_source_observations
  for each statement execute function public.comic_source_observations_append_only();

alter table public.comic_source_observations enable row level security;
revoke all on table public.comic_source_observations from public, anon, authenticated, service_role;
grant select, insert on table public.comic_source_observations to service_role;

drop policy if exists comic_source_observations_service_all on public.comic_source_observations;
drop policy if exists comic_source_observations_service_select on public.comic_source_observations;
drop policy if exists comic_source_observations_service_insert on public.comic_source_observations;
create policy comic_source_observations_service_select
  on public.comic_source_observations for select to service_role using (true);
create policy comic_source_observations_service_insert
  on public.comic_source_observations for insert to service_role with check (true);

comment on table public.comic_source_observations is
  'Append-only per-source evidence. UPDATE, DELETE and TRUNCATE are rejected; a work cannot be deleted while observations reference it. New values are new rows.';
comment on function public.comic_source_observations_append_only() is
  'Rejects mutation of source observations. The trigger is the last line of defence for owners; service_role also lacks UPDATE/DELETE/TRUNCATE privileges.';

-- 2. Identity gates for people.

alter table public.comic_people
  drop constraint if exists comic_people_unidentified_public_check;
alter table public.comic_people
  add constraint comic_people_unidentified_public_check
  check (
    identity_status <> 'unidentified_name_bucket'
    or (
      source_person_id is null
      and is_public = false
      and name_status = 'unverified'
      and name_bucket_key is not null
      and name_bucket_key = btrim(name_bucket_key)
      and char_length(name_bucket_key) between 1 and 500
      and left(name_bucket_key, 1) <> ':'
      and strpos(name_bucket_key, ':') > 0
      and right(name_bucket_key, 1) <> ':'
    )
  );

alter table public.comic_people
  drop constraint if exists comic_people_source_identified_provenance_check;
alter table public.comic_people
  add constraint comic_people_source_identified_provenance_check
  check (
    identity_status <> 'source_identified'
    or (
      source_person_id is not null
      and source_url is not null
      and source_url ~ '^https://'
      and name_status = 'source_verified'
      and verification_status = 'source_verified'
      and checked_at is not null
    )
  );

alter table public.comic_people
  drop constraint if exists comic_people_manually_verified_provenance_check;
alter table public.comic_people
  add constraint comic_people_manually_verified_provenance_check
  check (
    identity_status <> 'manually_verified'
    or (
      source_url is not null
      and source_url ~ '^https://'
      and name_status = 'editorially_verified'
      and verification_status = 'editorially_verified'
      and checked_at is not null
    )
  );

create or replace function public.comic_people_validate_name_bucket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized text;
begin
  if new.identity_status = 'unidentified_name_bucket' then
    normalized := lower(btrim(new.canonical_name));
    if not exists (
      select 1
      from public.comic_works w
      where w.internal_key || ':' || normalized = new.name_bucket_key
    ) then
      raise exception 'comic_people name_bucket_key must reference an existing work internal_key and the normalized author name'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.comic_people_validate_name_bucket() from public, anon, authenticated;
grant execute on function public.comic_people_validate_name_bucket() to service_role;

drop trigger if exists comic_people_validate_name_bucket on public.comic_people;
create trigger comic_people_validate_name_bucket
  before insert or update of canonical_name, identity_status, name_bucket_key
  on public.comic_people
  for each row execute function public.comic_people_validate_name_bucket();

-- Fail closed if existing buckets do not point at a real work/name pair.
do $$
declare
  invalid_buckets int;
begin
  select count(*) into invalid_buckets
  from public.comic_people p
  where p.identity_status = 'unidentified_name_bucket'
    and not exists (
      select 1
      from public.comic_works w
      where w.internal_key || ':' || p.normalized_name = p.name_bucket_key
    );
  if invalid_buckets > 0 then
    raise exception 'B3-C.1: % existing name buckets do not reference a real work/name pair', invalid_buckets;
  end if;
end $$;

comment on column public.comic_people.name_bucket_key is
  'Per-work name observation key. For unidentified_name_bucket it must equal comic_works.internal_key || normalized_name; it is not a person identity.';
comment on column public.comic_people.identity_status is
  'unidentified_name_bucket is name-only; source_identified requires a source person id, https URL, source-verified name/record and checked_at; manually_verified requires editorially-verified name/record, checked_at and an https evidence URL.';
