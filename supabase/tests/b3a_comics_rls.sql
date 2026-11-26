-- B3-A Comics schema/RLS contract test. Disposable database only.
-- Prerequisites: migrations 20261123_comics_foundation.sql and
-- 20261123_comics_rls.sql applied; Supabase roles anon/authenticated/service_role
-- and auth.uid()/auth.users exist. All rows below are FIXTURES, not production data.
-- Run with a role that can insert into auth.users/titles, then ROLLBACK.

begin;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

insert into public.titles (id, slug, anilist_id) values
  (1, 'b3a-fixture-anime', 1)
on conflict (id) do nothing;

-- Canonical works. Only W_PUB and W_NOCOVER should reach the public view.
insert into public.comic_works (id, internal_key, slug, title_ru, title_ru_status,
  kind, country_code, publication_year, release_date, release_date_precision,
  publishing_status, description_ru, cover_url, total_chapters_known, volumes_known,
  genres, is_adult, content_rating_status, content_rating_source, content_rating_checked_at,
  publication_status, published_at, origin_source_name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'comic:anilist:30011', 'testovyy-komiks',
   'Тестовый комикс', 'source_verified', 'manga', 'JP', 2020, '2020-01-01', 'day',
   'ongoing', 'Тестовое описание.', 'https://example.test/cover.jpg', 12, 2,
   '{Тест}', false, 'verified_non_adult', 'manual', now(), 'approved', now() - interval '2 days', 'anilist'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'comic:mal:999', 'chernovik',
   'Черновик', 'source_verified', 'manga', 'JP', 2021, null, 'unknown',
   'unknown', null, 'https://example.test/draft.jpg', null, null,
   '{}', false, 'unknown', null, null, 'draft', null, 'manual'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'comic:anilist:30013', 'bez-prav',
   'Без прав', 'source_verified', 'manga', 'JP', 2022, null, 'unknown',
   'unknown', null, null, null, null, '{}', false, 'verified_non_adult', 'manual', now(), 'approved', now() - interval '1 day', 'anilist'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'comic:anilist:30014', 'vzroslyy',
   'Взрослый', 'source_verified', 'manga', 'JP', 2023, null, 'unknown',
   'unknown', null, null, null, null, '{}', true, 'adult', 'manual', now(), 'approved', now() - interval '1 day', 'anilist'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'comic:anilist:30015', 'istekshiy',
   'Истёкший', 'source_verified', 'manga', 'JP', 2024, null, 'unknown',
   'unknown', null, null, null, null, '{}', false, 'verified_non_adult', 'manual', now(), 'approved', now() - interval '1 day', 'anilist'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'comic:anilist:30016', 'bez-nazvaniya',
   'Bez nazvaniya', 'candidate', 'manga', 'JP', 2025, null, 'unknown',
   'unknown', null, null, null, null, '{}', false, 'unknown', null, null, 'approved', now() - interval '1 day', 'anilist'),
  ('abababab-abab-4bab-8bab-abababababab', 'comic:anilist:30017', 'bez-oblozhki',
   'Без обложки', 'source_verified', 'manga', 'JP', 2020, null, 'unknown',
   'unknown', null, 'https://example.test/no-cover-right.jpg', null, null,
   '{}', false, 'verified_non_adult', 'manual', now(), 'approved', now() - interval '1 day', 'anilist'),
  ('bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc', 'comic:anilist:30018', 'ne-opublikovan',
   'Не опубликован', 'source_verified', 'manga', 'JP', 2020, null, 'unknown',
   'unknown', null, null, null, null, '{}', false, 'verified_non_adult', 'manual', now(), 'approved', null, 'anilist');

insert into public.comic_external_ids (work_id, source_name, external_id, source_url,
  is_primary, verification_status, confidence)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'anilist', '30011', 'https://anilist.co/manga/30011', true, 'source_verified', 1.00),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'mal', '999', 'https://myanimelist.net/manga/999', true, 'source_verified', 1.00);

insert into public.comic_aliases (work_id, alias, alias_type, language, is_public,
  source_name, source_url, verification_status, confidence)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Тестовый комикс', 'official_russian', 'ru', true,
   'manual', null, 'editorially_verified', 1.00),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Test Comic', 'original_title', 'en', false,
   'anilist', 'https://anilist.co/manga/30011', 'source_verified', 1.00);

insert into public.comic_people (id, canonical_name, display_name_ru, name_status,
  source_name, source_person_id, source_url, checked_at, verification_status, confidence, is_public,
  identity_status)
values
  ('90000000-0000-4000-8000-000000000001', 'Test Author', 'Тестовый Автор', 'source_verified',
   'manual', 'p1', 'https://example.test/people/p1', now(), 'source_verified', 1.00, true,
   'source_identified');

insert into public.comic_credits (work_id, person_id, role, billing_order, source_name,
  verification_status, confidence, is_public)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '90000000-0000-4000-8000-000000000001', 'author', 0,
   'manual', 'editorially_verified', 1.00, true);

insert into public.comic_relations (from_work_id, to_work_id, relation_type,
  source_relation_type, source_name, source_url, confidence, verification_status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'SEQUEL', 'SEQUEL', 'anilist', 'https://anilist.co/manga/30011', 1.00, 'source_verified');

insert into public.comic_adaptations (anime_id, comic_work_id, raw_relation_type,
  direction, confidence_level, basis, is_primary, source_name, source_url,
  verification_status)
values
  (1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ADAPTATION', 'comic_is_source',
   'confirmed', 'anilist-relation', true, 'anilist', 'https://anilist.co/manga/30011',
   'source_verified');

-- Reading sources: one per mode plus negative cases.
insert into public.comic_reading_sources (id, work_id, source_name, reading_mode,
  language, source_url, embed_url, attribution_text, terms_url, terms_review_status,
  terms_checked_at, terms_reviewed_by, is_active)
values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Example Publisher', 'external_link', 'ru', 'https://example.test/ch/1', null,
   'Источник: Example Publisher', 'https://example.test/terms', 'approved', now(), 'fixture-terms-reviewer', true),
  ('20000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Embed Publisher', 'permitted_embed', 'ru', 'https://example.test/reader/1',
   'https://example.test/embed/1', 'Источник: Embed Publisher', 'https://example.test/terms',
   'approved', now(), 'fixture-terms-reviewer', true),
  ('30000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Unknown Rights', 'permitted_embed', 'ru', 'https://example.test/reader/2',
   'https://example.test/embed/2', 'Источник: Unknown Rights', 'https://example.test/terms',
   'approved', now(), 'fixture-terms-reviewer', true),
  ('40000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Hosted Publisher', 'licensed_hosted', 'ru', null, null, 'Источник: Hosted Publisher',
   'https://example.test/terms', 'approved', now(), 'fixture-terms-reviewer', true),
  ('50000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Expired Embed', 'permitted_embed', 'ru', 'https://example.test/reader/3',
   'https://example.test/embed/3', 'Источник: Expired Embed', 'https://example.test/terms',
   'approved', now(), 'fixture-terms-reviewer', true),
  ('60000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Pending Terms', 'external_link', 'ru', 'https://example.test/ch/4', null,
   'Источник: Pending Terms', 'https://example.test/terms', 'pending_review', null, null, true),
  ('70000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'No Pages', 'external_link', 'ru', 'https://example.test/ch/5', null,
   'Источник: No Pages', 'https://example.test/terms', 'approved', now(), 'fixture-terms-reviewer', true),
  ('80000000-0000-4000-8000-000000000008', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'Draft Source', 'external_link', 'ru', 'https://example.test/draft/1', null,
   'Источник: Draft Source', 'https://example.test/terms', 'approved', now(), 'fixture-terms-reviewer', true);

insert into public.comic_rights (work_id, reading_source_id, permission, status,
  valid_from, valid_until, evidence_ref, reviewed_by, reviewed_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'metadata', 'approved', current_date - 30, null, 'https://example.test/rights/metadata', 'fixture-reviewer', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'cover', 'approved', current_date - 30, null, 'https://example.test/rights/cover', 'fixture-reviewer', now()),
  ('abababab-abab-4bab-8bab-abababababab', null, 'metadata', 'approved', current_date - 30, null, 'https://example.test/rights/metadata-b', 'fixture-reviewer', now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, 'metadata', 'unknown', null, null, null, null, null),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', null, 'metadata', 'approved', current_date - 30, null, 'https://example.test/rights/metadata-d', 'fixture-reviewer', now()),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', null, 'metadata', 'approved', current_date - 30, current_date - 1, 'https://example.test/rights/metadata-e', 'fixture-reviewer', now()),
  ('bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc', null, 'metadata', 'approved', current_date - 30, null, 'https://example.test/rights/metadata-c', 'fixture-reviewer', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000001', 'chapter_link', 'approved', current_date - 30, null, 'https://example.test/rights/chapter-link', 'fixture-reviewer', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000002', 'embed', 'approved', current_date - 30, null, 'https://example.test/rights/embed', 'fixture-reviewer', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-000000000003', 'embed', 'unknown', null, null, null, null, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '40000000-0000-4000-8000-000000000004', 'hosting', 'approved', current_date - 30, null, 'https://example.test/rights/hosting', 'fixture-reviewer', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '50000000-0000-4000-8000-000000000005', 'embed', 'approved', current_date - 30, current_date - 1, 'https://example.test/rights/embed-expired', 'fixture-reviewer', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '60000000-0000-4000-8000-000000000006', 'chapter_link', 'approved', current_date - 30, null, 'https://example.test/rights/chapter-link-pending', 'fixture-reviewer', now());

insert into public.comic_chapters (id, work_id, reading_source_id, chapter_number,
  chapter_number_text, chapter_kind, volume_number, volume_text, title_ru, language,
  page_count, published_at, date_precision, availability, source_chapter_ref, source_url,
  embed_url)
values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000001', 1, '1', 'regular', 1, '1', 'Глава 1', 'ru', 20, '2020-01-01', 'day', 'public', 'ch-1', 'https://example.test/chapters/1', null),
  ('a2000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000002', 2, '2', 'regular', 1, '1', 'Глава 2', 'ru', 20, null, 'unknown', 'public', 'ch-2', null, 'https://example.test/chapters/2-embed'),
  ('a3000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '40000000-0000-4000-8000-000000000004', 3, '3', 'regular', 1, '1', 'Глава 3', 'ru', 20, null, 'unknown', 'public', 'ch-3', null, null),
  ('a4000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-000000000003', 4, '4', 'regular', 1, '1', 'Глава 4', 'ru', 20, null, 'unknown', 'public', 'ch-4', null, null),
  ('a5000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '50000000-0000-4000-8000-000000000005', 5, '5', 'regular', 1, '1', 'Глава 5', 'ru', 20, null, 'unknown', 'public', 'ch-5', null, null),
  ('a6000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '60000000-0000-4000-8000-000000000006', 6, '6', 'regular', 1, '1', 'Глава 6', 'ru', 20, null, 'unknown', 'public', 'ch-6', null, null),
  ('a7000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-000000000007', 7, '7', 'regular', 1, '1', 'Глава 7', 'ru', 0, null, 'unknown', 'public', 'ch-7', null, null),
  ('a9000000-0000-4000-8000-000000000009', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '80000000-0000-4000-8000-000000000008', 1, '1', 'regular', null, null, 'Глава 1', 'ru', 20, null, 'unknown', 'public', 'ch-9', null, null),
  ('aa000000-0000-4000-8000-000000000010', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '80000000-0000-4000-8000-000000000008', 1.5, '1.5', 'regular', null, null, 'Глава 1.5', 'ru', 20, null, 'unknown', 'hidden', 'ch-1.5', null, null),
  ('ab000000-0000-4000-8000-000000000011', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '80000000-0000-4000-8000-000000000008', null, 'SP1', 'special', null, null, 'Спешл', 'ru', 10, null, 'unknown', 'hidden', 'sp-1', null, null);

insert into public.comic_sync_runs (source_name, run_kind, adapter_version, status,
  started_at, finished_at, source_snapshot_at, terms_review_status, records_seen,
  records_inserted, records_updated, records_skipped, records_failed, details)
values
  ('anilist', 'graph_snapshot', 'fixture-1', 'success', now() - interval '3 hours',
   now() - interval '2 hours', now() - interval '4 hours', 'approved', 10, 10, 0, 0, 0,
   '{"fixture":true}'::jsonb);

insert into public.comic_review_queue (work_id, item_type, item_ref, reason, severity,
  status, priority, details)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'rights', null, 'rights_unknown', 'high',
   'open', 90, '{"fixture":true}'::jsonb);

insert into public.user_comic_library (user_id, comic_work_id, status, score, started_at)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'reading', 8.5, now() - interval '5 days'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'planned', null, null);

insert into public.user_comic_progress (user_id, chapter_id, page, completed)
values
  ('11111111-1111-4111-8111-111111111111', 'a1000000-0000-4000-8000-000000000001', 5, false);

-- Constraint/duplicate checks. Any unexpected success raises and aborts the test.
do $$
begin
  begin
    insert into public.comic_works (internal_key, slug, title_ru, title_ru_status, kind)
    values ('comic:test:dupe-slug', 'testovyy-komiks', 'Дубль', 'unverified', 'manga');
    raise exception 'duplicate comic_works.slug was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.comic_external_ids (work_id, source_name, external_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'anilist', '30011');
    raise exception 'duplicate external id was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.comic_external_ids (work_id, source_name, external_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'anilist', '99999');
    raise exception 'second external id for one source was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.comic_aliases (work_id, alias, alias_type, language, source_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Тестовый комикс', 'official_russian', 'ru', 'manual');
    raise exception 'duplicate alias was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.comic_people (canonical_name, name_status, source_name,
      source_person_id, source_url, checked_at, verification_status, identity_status)
    values ('Test Author', 'source_verified', 'manual', 'p1',
      'https://example.test/people/p1', now(), 'source_verified', 'source_identified');
    raise exception 'duplicate source person id was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.comic_credits (work_id, person_id, role, source_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '90000000-0000-4000-8000-000000000001', 'author', 'manual');
    raise exception 'duplicate credit was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.comic_relations (from_work_id, to_work_id, relation_type,
      source_relation_type, source_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'SEQUEL', 'SEQUEL', 'anilist');
    raise exception 'duplicate relation was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.comic_relations (from_work_id, to_work_id, relation_type,
      source_relation_type, source_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'RELATED', 'OTHER', 'anilist');
    raise exception 'self relation was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.comic_adaptations (anime_id, comic_work_id, confidence_level,
      basis, is_primary, source_name)
    values (1, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'confirmed', 'anilist-relation', true, 'anilist');
    raise exception 'second primary adaptation was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.comic_adaptations (anime_id, comic_work_id, confidence_level,
      basis, source_name)
    values (999, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'unknown', 'unknown', 'anilist');
    raise exception 'adaptation with missing anime was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.comic_chapters (work_id, reading_source_id, chapter_number,
      chapter_number_text, chapter_kind, language, page_count, availability)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10000000-0000-4000-8000-000000000001',
      2, '2', 'regular', 'ru', 10, 'hidden');
    raise exception 'chapter with another work source was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.comic_rights (work_id, reading_source_id, permission, status)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10000000-0000-4000-8000-000000000001',
      'embed', 'unknown');
    raise exception 'right with another work source was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.comic_chapters (work_id, reading_source_id, chapter_number,
      chapter_number_text, chapter_kind, language, page_count, availability)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10000000-0000-4000-8000-000000000001',
      null, 'X', 'regular', 'ru', 10, 'hidden');
    raise exception 'regular chapter without numeric number was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.comic_chapters (work_id, reading_source_id, chapter_number,
      chapter_number_text, chapter_kind, language, page_count, availability)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000001',
      1, '1', 'regular', 'ru', 20, 'public');
    raise exception 'duplicate chapter number was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.comic_rights (work_id, reading_source_id, permission, status)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, 'metadata', 'approved');
    raise exception 'approved right without evidence review was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.comic_rights (work_id, reading_source_id, permission, status)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10000000-0000-4000-8000-000000000001',
      'metadata', 'unknown');
    raise exception 'metadata right bound to a reading source was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.comic_rights (work_id, permission, status)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cover', 'expired');
    raise exception 'expired right without expiry date was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.comic_review_queue (work_id, item_type, item_ref, reason, status)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'rights', null, 'rights_unknown', 'open');
    raise exception 'duplicate open review item was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.user_comic_library (user_id, comic_work_id)
    values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    raise exception 'duplicate user library row was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.user_comic_progress (user_id, chapter_id)
    values ('11111111-1111-4111-8111-111111111111', 'a1000000-0000-4000-8000-000000000001');
    raise exception 'duplicate user progress row was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- Public projection shape: no original/native/provenance columns.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comic_public_works'
      and column_name in ('title_original', 'title_native', 'origin_source_name', 'origin_source_url', 'metadata_confidence')
  ) then
    raise exception 'public works view leaks internal columns';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comic_public_chapters'
      and column_name in ('source_chapter_ref', 'rights_id', 'notes_internal')
  ) then
    raise exception 'public chapters view leaks internal columns';
  end if;
end $$;

-- anon: only the two safe views; base tables and private queue are denied.
set role anon;
do $$
begin
  if (select count(*) from public.comic_public_works) <> 2 then
    raise exception 'anon public works: expected 2, got %', (select count(*) from public.comic_public_works);
  end if;
  if (select count(*) from public.comic_public_chapters) <> 2 then
    raise exception 'anon public chapters: expected 2, got %', (select count(*) from public.comic_public_chapters);
  end if;
  if not exists (
    select 1 from public.comic_public_chapters
    where id = 'a1000000-0000-4000-8000-000000000001'
      and reading_url = 'https://example.test/chapters/1'
  ) then
    raise exception 'external chapter did not use its own URL';
  end if;
  if not exists (
    select 1 from public.comic_public_chapters
    where id = 'a2000000-0000-4000-8000-000000000002'
      and reading_url = 'https://example.test/chapters/2-embed'
  ) then
    raise exception 'embed chapter did not use its own URL';
  end if;
  if exists (
    select 1 from public.comic_public_chapters
    where reading_url in ('https://example.test/ch/1', 'https://example.test/embed/1')
  ) then
    raise exception 'public chapter leaked a work-level source URL';
  end if;
  if exists (select 1 from public.comic_public_chapters where reading_mode not in ('external_link', 'permitted_embed')) then
    raise exception 'anon saw unsupported reading mode';
  end if;
  if exists (select 1 from public.comic_public_works where id = 'abababab-abab-4bab-8bab-abababababab' and cover_url is not null) then
    raise exception 'cover without approved cover right leaked';
  end if;

  begin
    perform 1 from public.comic_works limit 1;
    raise exception 'anon read comic_works unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.comic_rights limit 1;
    raise exception 'anon read comic_rights unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.comic_review_queue limit 1;
    raise exception 'anon read private review queue unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.user_comic_library limit 1;
    raise exception 'anon read user_comic_library unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Alice: own rows only; public views readable; writes to Bob denied.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set role authenticated;
do $$
begin
  if (select count(*) from public.comic_public_works) <> 2 then
    raise exception 'authenticated public works: expected 2, got %', (select count(*) from public.comic_public_works);
  end if;
  if (select count(*) from public.user_comic_library) <> 1 then
    raise exception 'Alice sees % library rows, expected 1', (select count(*) from public.user_comic_library);
  end if;
  if exists (select 1 from public.user_comic_library where user_id <> '11111111-1111-4111-8111-111111111111') then
    raise exception 'Alice saw Bob library row';
  end if;
  if (select count(*) from public.user_comic_progress) <> 1 then
    raise exception 'Alice sees % progress rows, expected 1', (select count(*) from public.user_comic_progress);
  end if;

  insert into public.user_comic_library (user_id, comic_work_id, status, score)
  values ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'planned', 7.0);
  if (select count(*) from public.user_comic_library) <> 2 then
    raise exception 'Alice own insert did not become visible';
  end if;

  begin
    insert into public.user_comic_library (user_id, comic_work_id)
    values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    raise exception 'Alice inserted a Bob library row';
  exception when insufficient_privilege then null;
  end;

  update public.user_comic_library set score = 1 where user_id = '22222222-2222-4222-8222-222222222222';
  if found then
    raise exception 'Alice updated Bob library row';
  end if;
  delete from public.user_comic_library where user_id = '22222222-2222-4222-8222-222222222222';
  if found then
    raise exception 'Alice deleted Bob library row';
  end if;

  insert into public.user_comic_progress (user_id, chapter_id, page)
  values ('11111111-1111-4111-8111-111111111111', 'a2000000-0000-4000-8000-000000000002', 3);
  if (select count(*) from public.user_comic_progress) <> 2 then
    raise exception 'Alice own progress insert did not become visible';
  end if;

  begin
    perform 1 from public.comic_works limit 1;
    raise exception 'authenticated read comic_works unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Bob isolation.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set role authenticated;
do $$
begin
  if (select count(*) from public.user_comic_library) <> 1 then
    raise exception 'Bob sees % library rows, expected 1', (select count(*) from public.user_comic_library);
  end if;
  if exists (select 1 from public.user_comic_library where user_id <> '22222222-2222-4222-8222-222222222222') then
    raise exception 'Bob saw Alice library row';
  end if;
  if (select count(*) from public.user_comic_progress) <> 0 then
    raise exception 'Bob sees Alice progress rows';
  end if;
end $$;
reset role;

-- Service role: protected operations succeed; no moderator role exists.
set role service_role;
do $$
begin
  if (select count(*) from public.comic_review_queue) <> 1 then
    raise exception 'service_role cannot read review queue';
  end if;
  if (select count(*) from public.comic_rights) < 10 then
    raise exception 'service_role cannot read rights';
  end if;
  if (select count(*) from public.comic_works) < 8 then
    raise exception 'service_role cannot read works';
  end if;
  insert into public.comic_sync_runs (source_name, run_kind, adapter_version, status)
  values ('manual', 'manual', 'fixture-2', 'success');
end $$;
reset role;

-- Cascade check: deleting a work removes its children and user rows.
delete from public.comic_works where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$
begin
  if exists (select 1 from public.comic_external_ids where work_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'external id survived work cascade';
  end if;
  if exists (select 1 from public.comic_chapters where work_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'chapter survived work cascade';
  end if;
  if exists (select 1 from public.user_comic_library where comic_work_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'user library row survived work cascade';
  end if;
end $$;

rollback;