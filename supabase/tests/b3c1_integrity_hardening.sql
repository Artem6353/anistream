-- B3-C.1 integrity contract test. Disposable database only.
-- Run after 20261126_comics_b3c1_integrity_hardening.sql. Transactional; rollback.
begin;

insert into public.comic_works (id, internal_key, slug, title_ru, title_ru_status,
  kind, source_kind_raw, country_code, is_adult, content_rating_status,
  publication_status, origin_source_name)
values
  ('f0000000-0000-4000-8000-000000000001', 'comic:test:b3c1', 'b3c1-integrity',
   'Тест целостности B3C1', 'source_verified', 'unknown', 'MANGA', 'JP', false,
   'unknown', 'draft', 'aninova');

-- Valid unidentified bucket: key references the work and normalized name.
insert into public.comic_people (id, canonical_name, name_status, source_name,
  source_person_id, identity_status, name_bucket_key, is_public)
values
  ('f1000000-0000-4000-8000-000000000001', 'Bucket Author', 'unverified', 'anilist',
   null, 'unidentified_name_bucket', 'comic:test:b3c1:bucket author', false);

-- Valid source-identified person with complete provenance.
insert into public.comic_people (id, canonical_name, name_status, source_name,
  source_person_id, source_url, fetched_at, checked_at, verification_status,
  identity_status, is_public)
values
  ('f1000000-0000-4000-8000-000000000002', 'Source Author', 'source_verified', 'anilist',
   'source-person-1', 'https://anilist.co/staff/1', now() - interval '2 days', now(),
   'source_verified', 'source_identified', true);

-- Valid manually verified person: evidence URL, review date and editorial record.
insert into public.comic_people (id, canonical_name, name_status, source_name,
  source_person_id, source_url, fetched_at, checked_at, verification_status,
  identity_status, is_public)
values
  ('f1000000-0000-4000-8000-000000000003', 'Manual Author', 'editorially_verified', 'manual',
   null, 'https://example.test/reviews/author-1', now() - interval '2 days', now(),
   'editorially_verified', 'manually_verified', true);

insert into public.comic_source_observations (id, work_id, field_name, source_name,
  observed_at, confidence, verification_status, source_payload_hash, value_json,
  is_conflict)
values
  ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'kind', 'manual', now(), 1.0, 'recorded', repeat('c', 64), '"MANGA"'::jsonb, false);

do $$
begin
  -- A name bucket without a key is not an identity.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name, is_public)
    values ('f1000000-0000-4000-8000-000000000010', 'No Key', 'unverified', 'anilist', false);
    raise exception 'B3C1: name bucket without name_bucket_key was accepted';
  exception when check_violation then null;
  end;

  -- A name bucket must not carry a source person id.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      source_person_id, identity_status, name_bucket_key, is_public)
    values ('f1000000-0000-4000-8000-000000000011', 'Bucket Author', 'unverified', 'anilist',
      'invented-person', 'unidentified_name_bucket', 'comic:test:b3c1:bucket author', false);
    raise exception 'B3C1: name bucket with source_person_id was accepted';
  exception when check_violation then null;
  end;

  -- A name bucket must never be public.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      identity_status, name_bucket_key, is_public)
    values ('f1000000-0000-4000-8000-000000000012', 'Bucket Author', 'unverified', 'anilist',
      'unidentified_name_bucket', 'comic:test:b3c1:bucket author', true);
    raise exception 'B3C1: public name bucket was accepted';
  exception when check_violation then null;
  end;

  -- A bucket must reference a real work and its normalized name.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      identity_status, name_bucket_key, is_public)
    values ('f1000000-0000-4000-8000-000000000013', 'Bucket Author', 'unverified', 'anilist',
      'unidentified_name_bucket', 'comic:test:missing:bucket author', false);
    raise exception 'B3C1: bucket with an unknown work key was accepted';
  exception when check_violation then null;
  end;

  -- source_identified requires a source person id.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      source_person_id, source_url, checked_at, verification_status, identity_status, is_public)
    values ('f1000000-0000-4000-8000-000000000020', 'Source Author', 'source_verified', 'anilist',
      null, 'https://anilist.co/staff/20', now(), 'source_verified', 'source_identified', false);
    raise exception 'B3C1: source_identified without source_person_id was accepted';
  exception when check_violation then null;
  end;

  -- source_identified requires an https source URL.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      source_person_id, source_url, checked_at, verification_status, identity_status, is_public)
    values ('f1000000-0000-4000-8000-000000000021', 'Source Author', 'source_verified', 'anilist',
      'source-person-21', null, now(), 'source_verified', 'source_identified', false);
    raise exception 'B3C1: source_identified without source_url was accepted';
  exception when check_violation then null;
  end;

  -- source_identified requires a checked timestamp.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      source_person_id, source_url, checked_at, verification_status, identity_status, is_public)
    values ('f1000000-0000-4000-8000-000000000022', 'Source Author', 'source_verified', 'anilist',
      'source-person-22', 'https://anilist.co/staff/22', null, 'source_verified', 'source_identified', false);
    raise exception 'B3C1: source_identified without checked_at was accepted';
  exception when check_violation then null;
  end;

  -- source_identified requires source-verified status, including for public rows.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      source_person_id, source_url, checked_at, verification_status, identity_status, is_public)
    values ('f1000000-0000-4000-8000-000000000023', 'Source Author', 'source_verified', 'anilist',
      'source-person-23', 'https://anilist.co/staff/23', now(), 'recorded', 'source_identified', true);
    raise exception 'B3C1: unverified public source identity was accepted';
  exception when check_violation then null;
  end;

  -- manually_verified requires an evidence URL.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      source_url, checked_at, verification_status, identity_status, is_public)
    values ('f1000000-0000-4000-8000-000000000030', 'Manual Author', 'editorially_verified', 'manual',
      null, now(), 'editorially_verified', 'manually_verified', false);
    raise exception 'B3C1: manually_verified without evidence URL was accepted';
  exception when check_violation then null;
  end;

  -- manually_verified requires a checked timestamp.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      source_url, checked_at, verification_status, identity_status, is_public)
    values ('f1000000-0000-4000-8000-000000000031', 'Manual Author', 'editorially_verified', 'manual',
      'https://example.test/reviews/author-31', null, 'editorially_verified', 'manually_verified', false);
    raise exception 'B3C1: manually_verified without checked_at was accepted';
  exception when check_violation then null;
  end;

  -- manually_verified requires an explicit editorial verification record.
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name,
      source_url, checked_at, verification_status, identity_status, is_public)
    values ('f1000000-0000-4000-8000-000000000032', 'Manual Author', 'editorially_verified', 'manual',
      'https://example.test/reviews/author-32', now(), 'recorded', 'manually_verified', true);
    raise exception 'B3C1: unverified public manual identity was accepted';
  exception when check_violation then null;
  end;

  -- Observations cannot be updated or deleted, even by the table owner.
  begin
    update public.comic_source_observations set confidence = 0.5
    where id = 'f2000000-0000-4000-8000-000000000001';
    raise exception 'B3C1: source observation update was accepted';
  exception when restrict_violation then null;
  end;

  begin
    delete from public.comic_source_observations
    where id = 'f2000000-0000-4000-8000-000000000001';
    raise exception 'B3C1: source observation delete was accepted';
  exception when restrict_violation then null;
  end;

  -- Deleting the referenced work must not cascade observation history.
  begin
    delete from public.comic_works where id = 'f0000000-0000-4000-8000-000000000001';
    raise exception 'B3C1: work delete cascaded source observations';
  exception when foreign_key_violation or restrict_violation then null;
  end;
end $$;

rollback;
