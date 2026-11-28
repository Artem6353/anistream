-- B3-E announcement monitor contracts: allowlisted sources, pending_review
-- default, confirmation guards and an append-only event trail.
-- Run after 20261129_comics_b3e_announcement_monitor.sql.
do $$
declare
  v_source_id uuid;
  v_announcement_id uuid;
  v_event_announcement_id uuid;
  v_event_count int;
begin
  if (select count(*) from public.comic_announcement_sources
      where slug in ('seven-seas','kodansha-usa','mappa','bones','shueisha')) <> 5 then
    raise exception 'B3-E: seeded official sources are missing';
  end if;

  if exists (select 1 from public.comic_announcement_sources where not is_official or not is_enabled) then
    raise exception 'B3-E: seeded sources must be official and enabled';
  end if;

  if not has_table_privilege('service_role', 'public.comic_adaptation_announcements', 'INSERT')
     or not has_table_privilege('service_role', 'public.comic_announcement_events', 'INSERT') then
    raise exception 'B3-E: service_role cannot write the review queue';
  end if;

  if has_table_privilege('anon', 'public.comic_adaptation_announcements', 'SELECT')
     or has_table_privilege('authenticated', 'public.comic_announcement_sources', 'SELECT') then
    raise exception 'B3-E: announcement queue must not be readable by public roles';
  end if;

  if has_table_privilege('service_role', 'public.comic_announcement_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.comic_announcement_events', 'DELETE') then
    raise exception 'B3-E: events must be append-only even for service_role';
  end if;

  select id into v_source_id from public.comic_announcement_sources where slug = 'seven-seas';

  begin
    insert into public.comic_announcement_sources (slug, name, kind, url, domain)
    values ('bad_slug', 'Bad', 'rss', 'https://x.test/feed', 'x.test');
    raise exception 'B3-E: invalid slug was accepted';
  exception when check_violation then null;
  end;

  insert into public.comic_announcement_sources (slug, name, kind, domain)
  values ('manual-with-url', 'Manual', 'manual', 'example.com');
  if not exists (select 1 from public.comic_announcement_sources where slug = 'manual-with-url' and url is null) then
    raise exception 'B3-E: manual source without URL was not stored';
  end if;
  delete from public.comic_announcement_sources where slug = 'manual-with-url';

  begin
    insert into public.comic_adaptation_announcements
      (source_id, item_key, title, url, content_hash, status, confirmation_url)
    values (v_source_id, 'bad-confirmation', 'Title', 'https://sevenseasentertainment.com/x',
      repeat('a', 64), 'confirmed', 'https://sevenseasentertainment.com/confirm');
    raise exception 'B3-E: confirmed announcement without confirmed_at was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.comic_adaptation_announcements
      (source_id, item_key, title, url, content_hash, status)
    values (v_source_id, 'bad-rejected', 'Title', 'https://sevenseasentertainment.com/x',
      repeat('a', 64), 'rejected');
    raise exception 'B3-E: rejected announcement without reviewer was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.comic_adaptation_announcements
      (source_id, item_key, title, url, content_hash)
    values (v_source_id, 'http-item', 'Title', 'http://sevenseasentertainment.com/x', repeat('a', 64));
    raise exception 'B3-E: non-https announcement URL was accepted';
  exception when check_violation then null;
  end;

  insert into public.comic_adaptation_announcements
    (source_id, item_key, title, summary, url, published_at, detected_keywords, content_hash, raw_payload)
  values (v_source_id, 'canary-item', 'TV anime adaptation announced',
    'Canary summary', 'https://sevenseasentertainment.com/canary', '2026-07-06T03:10:08Z',
    array['anime adaptation'], repeat('b', 64), '{"canary": true}'::jsonb)
  returning id into v_announcement_id;

  if (select status from public.comic_adaptation_announcements where id = v_announcement_id) <> 'pending_review' then
    raise exception 'B3-E: announcement did not default to pending_review';
  end if;

  if (select confirmation_url from public.comic_adaptation_announcements where id = v_announcement_id) is not null then
    raise exception 'B3-E: ingestion must not write a confirmation URL';
  end if;

  begin
    insert into public.comic_adaptation_announcements
      (source_id, item_key, title, url, content_hash)
    values (v_source_id, 'canary-item', 'Duplicate', 'https://sevenseasentertainment.com/x', repeat('c', 64));
    raise exception 'B3-E: duplicate (source_id, item_key) was accepted';
  exception when unique_violation then null;
  end;

  insert into public.comic_announcement_events (announcement_id, event_type, to_status, detail)
  values (v_announcement_id, 'ingested', 'pending_review', '{"canary": true}'::jsonb)
  returning announcement_id into v_event_announcement_id;
  select count(*) into v_event_count
  from public.comic_announcement_events where announcement_id = v_event_announcement_id;
  if v_event_count <> 1 then
    raise exception 'B3-E: ingested event was not recorded';
  end if;

  begin
    update public.comic_announcement_events set actor = 'tampered' where announcement_id = v_event_announcement_id;
    raise exception 'B3-E: event UPDATE was accepted';
  exception when restrict_violation then null;
  end;

  begin
    delete from public.comic_announcement_events where announcement_id = v_event_announcement_id;
    raise exception 'B3-E: event DELETE was accepted';
  exception when restrict_violation then null;
  end;
end $$;
