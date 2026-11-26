-- B3-C schema/data-quality contract test. Disposable database only.
-- Run after 20261125_comics_b3c_quality_relations.sql. Transactional; rollback.
begin;

insert into public.titles (id, slug, anilist_id) values
  (2, 'b3c-fixture-anime', 2)
on conflict (id) do nothing;

insert into public.comic_works (id, internal_key, slug, title_ru, title_ru_status,
  kind, source_kind_raw, country_code, is_adult, content_rating_status,
  content_rating_source, content_rating_checked_at, publication_status, published_at,
  origin_source_name)
values
  ('c0000000-0000-4000-8000-000000000001', 'comic:test:b3c-ok', 'b3c-ok',
   'Тестовый комикс B3C', 'source_verified', 'unknown', 'MANGA', 'JP', false,
   'verified_non_adult', 'manual', now(), 'approved', now() - interval '1 day', 'aninova'),
  ('c0000000-0000-4000-8000-000000000002', 'comic:test:b3c-unknown', 'b3c-unknown',
   'Статус неизвестен', 'source_verified', 'unknown', 'MANGA', 'KR', false,
   'unknown', null, null, 'approved', now() - interval '1 day', 'aninova'),
  ('c0000000-0000-4000-8000-000000000003', 'comic:test:b3c-adult', 'b3c-adult',
   'Взрослый B3C', 'source_verified', 'manhwa', 'MANGA', 'KR', true,
   'adult', 'manual', now(), 'approved', now() - interval '1 day', 'aninova'),
  ('c0000000-0000-4000-8000-000000000004', 'comic:test:b3c-cn', 'b3c-cn',
   'Китайский комикс B3C', 'source_verified', 'unknown', 'MANGA', 'CN', false,
   'unknown', null, null, 'draft', null, 'aninova');

insert into public.comic_rights (work_id, permission, status, evidence_ref, reviewed_by, reviewed_at)
values
  ('c0000000-0000-4000-8000-000000000001', 'metadata', 'approved', 'https://example.test/rights/b3c-ok', 'reviewer', now()),
  ('c0000000-0000-4000-8000-000000000002', 'metadata', 'approved', 'https://example.test/rights/b3c-unknown', 'reviewer', now()),
  ('c0000000-0000-4000-8000-000000000003', 'metadata', 'approved', 'https://example.test/rights/b3c-adult', 'reviewer', now());

insert into public.comic_source_observations (id, work_id, field_name, source_name,
  external_id, join_key, source_url, observed_at, confidence, verification_status,
  source_payload_hash, value_json, is_conflict, conflict_group)
values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'kind', 'anilist', '30001', '30001', 'https://anilist.co/manga/30001', now(), 0.9,
   'recorded', repeat('a', 64), '"MANGA"'::jsonb, true, 'b3c-ok:kind'),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'kind', 'shikimori', '30001', '30001', 'https://shikimori.one/mangas/30001', now(), 0.9,
   'source_verified', repeat('b', 64), '"manhwa"'::jsonb, true, 'b3c-ok:kind');

insert into public.comic_people (id, canonical_name, name_status, source_name, source_person_id, is_public)
values
  ('b0000000-0000-4000-8000-000000000001', 'Same Name Author', 'unverified', 'anilist', null, false);

insert into public.comic_adaptations (id, anime_id, comic_work_id, raw_relation_type,
  normalized_relation_type, direction, confidence_level, basis, source_name, source_url)
values
  ('d0000000-0000-4000-8000-000000000001', 2, 'c0000000-0000-4000-8000-000000000001',
   'CHARACTER', 'CHARACTER', 'unknown', 'unknown', 'anilist_relation_only', 'anilist',
   'https://anilist.co/anime/2'),
  ('d0000000-0000-4000-8000-000000000002', 2, 'c0000000-0000-4000-8000-000000000003',
   'ADAPTATION', 'ADAPTATION', 'unknown', 'unknown', 'anilist_relation_only', 'anilist',
   'https://anilist.co/anime/2');

insert into public.comic_review_queue (item_type, item_ref, reason, details)
values
  ('work', 'b3c-kind', 'kind_unknown', '{"fixture":true}'::jsonb),
  ('work', 'b3c-meta', 'source_metadata_conflict', '{"fixture":true}'::jsonb),
  ('work', 'b3c-title', 'duplicate_public_title', '{"fixture":true}'::jsonb),
  ('relation', 'b3c-rel', 'relation_evidence_conflict', '{"fixture":true}'::jsonb),
  ('person', 'b3c-person', 'ambiguous_people_identity', '{"fixture":true}'::jsonb),
  ('adaptation', 'b3c-prov', 'missing_provenance', '{"fixture":true}'::jsonb);

do $$
begin
  if (select kind from public.comic_works where id = 'c0000000-0000-4000-8000-000000000004') <> 'unknown' then
    raise exception 'B3C: CN work kind must stay unknown without verified source format';
  end if;
  if (select content_rating_status from public.comic_works where id = 'c0000000-0000-4000-8000-000000000002') <> 'unknown' then
    raise exception 'B3C: missing source classification must be unknown';
  end if;
  if (select count(*) from public.comic_source_observations where work_id = 'c0000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'B3C: source observations were not both preserved';
  end if;
  if not exists (
    select 1 from public.comic_source_observations
    where work_id = 'c0000000-0000-4000-8000-000000000001'
      and is_conflict and conflict_group = 'b3c-ok:kind'
  ) then
    raise exception 'B3C: source conflict was not marked';
  end if;
  if (select identity_status from public.comic_people where id = 'b0000000-0000-4000-8000-000000000001') <> 'unidentified_name_bucket' then
    raise exception 'B3C: name-only person must be an unidentified name bucket';
  end if;
  if exists (select 1 from public.comic_people where id = 'b0000000-0000-4000-8000-000000000001' and (source_person_id is not null or is_public)) then
    raise exception 'B3C: name-only person must not be public or have an invented source person id';
  end if;
  begin
    insert into public.comic_people (id, canonical_name, name_status, source_name, source_person_id, is_public)
    values ('b0000000-0000-4000-8000-000000000002', 'Invented Identity', 'unverified', 'anilist', 'invented-person', false);
    raise exception 'B3C: name bucket with source person id was accepted';
  exception when check_violation then null;
  end;
  if (select normalized_relation_type from public.comic_adaptations where id = 'd0000000-0000-4000-8000-000000000001') <> 'CHARACTER' then
    raise exception 'B3C: raw relation type was not preserved separately';
  end if;
  if (select count(*) from public.comic_public_works) <> 1 then
    raise exception 'B3C: public view must expose only verified_non_adult, got %',
      (select count(*) from public.comic_public_works);
  end if;
  if exists (
    select 1 from public.comic_public_works
    where id in ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003')
  ) then
    raise exception 'B3C: unknown or adult work leaked into public view';
  end if;
end $$;

do $$
begin
  begin
    update public.comic_works set is_adult = false
    where id = 'c0000000-0000-4000-8000-000000000003';
    raise exception 'B3C: adult content_rating_status accepted is_adult=false';
  exception when check_violation then
    null;
  end;
end $$;

rollback;
