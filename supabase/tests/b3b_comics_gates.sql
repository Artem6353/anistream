-- B3-B regression tests: chapter-specific URLs, evidence gates and expiry.
-- Run after 20261123_comics_foundation.sql, 20261123_comics_rls.sql and
-- 20261124_comics_b3b_chapter_urls_evidence.sql. Transactional; rolls back.
begin;

insert into public.comic_works (id, internal_key, slug, title_ru, title_ru_status,
  kind, content_rating_status, content_rating_source, content_rating_checked_at,
  publication_status, published_at, origin_source_name)
values
  ('d0000000-0000-4000-8000-000000000001', 'comic:test:b3b-gate', 'b3b-gate',
   'Тестовый комикс B3B', 'source_verified', 'manga', 'verified_non_adult', 'manual', now(), 'approved', now(), 'aninova'),
  ('d0000000-0000-4000-8000-000000000002', 'comic:test:b3b-evidence', 'b3b-evidence',
   'Тестовый комикс B3B 2', 'source_verified', 'manga', 'verified_non_adult', 'manual', now(), 'draft', null, 'aninova');

insert into public.comic_reading_sources (id, work_id, source_name, reading_mode,
  language, source_url, embed_url, attribution_text, terms_url, terms_review_status,
  terms_checked_at, terms_reviewed_by, is_active)
values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'B3B External', 'external_link', 'ru', 'https://example.test/source-landing', null,
   'Источник: B3B External', 'https://example.test/terms', 'approved', now(),
   'terms-reviewer', true),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   'B3B Embed', 'permitted_embed', 'ru', null, 'https://example.test/embed-landing',
   'Источник: B3B Embed', 'https://example.test/terms', 'approved', now(),
   'terms-reviewer', true);

insert into public.comic_chapters (id, work_id, reading_source_id, chapter_number,
  chapter_number_text, chapter_kind, language, page_count, availability, source_url,
  embed_url)
values
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 1, '1', 'regular', 'ru', 20, 'public',
   'https://example.test/chapters/1', null),
  ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000002', 2, '2', 'regular', 'ru', 20, 'public', null,
   'https://example.test/chapters/2-embed');

insert into public.comic_rights (work_id, reading_source_id, permission, status,
  valid_from, valid_until, evidence_ref, reviewed_by, reviewed_at)
values
  ('d0000000-0000-4000-8000-000000000001', null, 'metadata', 'approved',
   current_date - 30, null, 'https://example.test/rights/metadata', 'reviewer', now()),
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   'chapter_link', 'approved', current_date - 30, null,
   'https://example.test/rights/chapter-link', 'reviewer', now()),
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
   'embed', 'approved', current_date - 30, null,
   'https://example.test/rights/embed', 'reviewer', now());

do $$
begin
  if (select count(*) from public.comic_public_chapters) <> 2 then
    raise exception 'B3B: expected 2 public chapters, got %',
      (select count(*) from public.comic_public_chapters);
  end if;
  if not exists (
    select 1 from public.comic_public_chapters
    where id = 'f0000000-0000-4000-8000-000000000001'
      and reading_url = 'https://example.test/chapters/1'
  ) then
    raise exception 'B3B: external chapter URL is not chapter-specific';
  end if;
  if not exists (
    select 1 from public.comic_public_chapters
    where id = 'f0000000-0000-4000-8000-000000000002'
      and reading_url = 'https://example.test/chapters/2-embed'
  ) then
    raise exception 'B3B: embed chapter URL is not chapter-specific';
  end if;
  if exists (
    select 1 from public.comic_public_chapters
    where reading_url in ('https://example.test/source-landing',
      'https://example.test/embed-landing')
  ) then
    raise exception 'B3B: public view fell back to a work-level URL';
  end if;
end $$;

-- A chapter with no own URL is not public even when the source has a fallback URL.
update public.comic_chapters set source_url = null
where id = 'f0000000-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.comic_public_chapters
    where id = 'f0000000-0000-4000-8000-000000000001') then
    raise exception 'B3B: external chapter without its own URL was public';
  end if;
end $$;
update public.comic_chapters set source_url = 'https://example.test/chapters/1'
where id = 'f0000000-0000-4000-8000-000000000001';

update public.comic_chapters set embed_url = null
where id = 'f0000000-0000-4000-8000-000000000002';
do $$
begin
  if exists (select 1 from public.comic_public_chapters
    where id = 'f0000000-0000-4000-8000-000000000002') then
    raise exception 'B3B: embed chapter without its own URL was public';
  end if;
end $$;
update public.comic_chapters set embed_url = 'https://example.test/chapters/2-embed'
where id = 'f0000000-0000-4000-8000-000000000002';

-- Expired chapter_link or terms close reading immediately.
update public.comic_rights set valid_until = current_date - 1
where work_id = 'd0000000-0000-4000-8000-000000000001'
  and permission = 'chapter_link';
do $$
begin
  if exists (select 1 from public.comic_public_chapters
    where id = 'f0000000-0000-4000-8000-000000000001') then
    raise exception 'B3B: expired chapter_link still opened reading';
  end if;
end $$;
update public.comic_rights set valid_until = null
where work_id = 'd0000000-0000-4000-8000-000000000001'
  and permission = 'chapter_link';

update public.comic_reading_sources set terms_review_status = 'expired'
where id = 'e0000000-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.comic_public_chapters
    where reading_source_id = 'e0000000-0000-4000-8000-000000000001') then
    raise exception 'B3B: expired terms still opened reading';
  end if;
end $$;
update public.comic_reading_sources set terms_review_status = 'approved'
where id = 'e0000000-0000-4000-8000-000000000001';

-- Constraint regression: approved evidence must be real and attributed.
do $$
begin
  begin
    insert into public.comic_rights (work_id, permission, status, reviewed_by, reviewed_at)
    values ('d0000000-0000-4000-8000-000000000002', 'cover', 'approved', 'reviewer', now());
    raise exception 'approved right without evidence_ref was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.comic_rights (work_id, permission, status, evidence_ref, reviewed_by, reviewed_at)
    values ('d0000000-0000-4000-8000-000000000002', 'cover', 'approved', '   ', 'reviewer', now());
    raise exception 'approved right with blank evidence_ref was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.comic_rights (work_id, permission, status, evidence_ref, reviewed_by, reviewed_at)
    values ('d0000000-0000-4000-8000-000000000002', 'cover', 'approved',
      'https://example.test/rights/cover', '   ', now());
    raise exception 'approved right with blank reviewer was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.comic_reading_sources (work_id, source_name, reading_mode, language,
      terms_url, terms_review_status, terms_checked_at, is_active)
    values ('d0000000-0000-4000-8000-000000000001', 'No Reviewer', 'external_link', 'ru',
      'https://example.test/terms', 'approved', now(), true);
    raise exception 'approved terms without terms_reviewed_by was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.comic_reading_sources (work_id, source_name, reading_mode, language,
      terms_review_status, terms_checked_at, terms_reviewed_by, is_active)
    values ('d0000000-0000-4000-8000-000000000001', 'No Terms URL', 'external_link', 'ru',
      'approved', now(), 'terms-reviewer', true);
    raise exception 'approved terms without terms_url was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.comic_chapters (work_id, reading_source_id, chapter_number,
      chapter_number_text, chapter_kind, language, page_count, availability, embed_url)
    values ('d0000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000002', 3, '3', 'regular', 'ru', 20, 'hidden',
      'http://example.test/insecure');
    raise exception 'non-https chapter embed_url was accepted';
  exception when check_violation then null;
  end;
end $$;

-- Rejected rights may keep the existing reviewer/time rule without evidence.
insert into public.comic_rights (work_id, permission, status, reviewed_by, reviewed_at)
values ('d0000000-0000-4000-8000-000000000002', 'cover', 'rejected', 'reviewer', now());

rollback;
