-- B3-C.1 rollback for disposable/local environments.
-- WARNING: this restores the B3-C mutable-observation behaviour and the old
-- CASCADE foreign key. It does not delete or rewrite any observation row, but
-- after rollback a later work delete can cascade observations again.
-- Do not run against production.

-- 1. Restore B3-C observation access and FK behaviour.

drop trigger if exists comic_source_observations_no_update_delete on public.comic_source_observations;
drop trigger if exists comic_source_observations_no_truncate on public.comic_source_observations;
drop function if exists public.comic_source_observations_append_only();

alter table public.comic_source_observations
  drop constraint if exists comic_source_observations_work_id_fkey;
alter table public.comic_source_observations
  add constraint comic_source_observations_work_id_fkey
  foreign key (work_id) references public.comic_works (id) on delete cascade;

revoke all on table public.comic_source_observations from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.comic_source_observations to service_role;

drop policy if exists comic_source_observations_service_select on public.comic_source_observations;
drop policy if exists comic_source_observations_service_insert on public.comic_source_observations;
drop policy if exists comic_source_observations_service_all on public.comic_source_observations;
create policy comic_source_observations_service_all on public.comic_source_observations
  for all to service_role using (true) with check (true);

comment on table public.comic_source_observations is
  'Per-source values with URL, observation time, confidence and payload hash. Conflicts are preserved and queued, not overwritten.';

-- 2. Restore the B3-C name-bucket constraint and remove C.1 identity gates.

drop trigger if exists comic_people_validate_name_bucket on public.comic_people;
drop function if exists public.comic_people_validate_name_bucket();
alter table public.comic_people
  drop constraint if exists comic_people_source_identified_provenance_check;
alter table public.comic_people
  drop constraint if exists comic_people_manually_verified_provenance_check;
alter table public.comic_people
  drop constraint if exists comic_people_unidentified_public_check;
alter table public.comic_people
  add constraint comic_people_unidentified_public_check
  check (identity_status <> 'unidentified_name_bucket' or (is_public = false and source_person_id is null));

comment on column public.comic_people.name_bucket_key is null;
comment on column public.comic_people.identity_status is
  'unidentified_name_bucket means the row is a per-work name observation, not a confirmed person. source_person_id stays NULL.';
