-- B3-E rollback for disposable/local databases only. Drops the announcement
-- monitor storage and its seed rows. Announcement candidates, confirmation
-- evidence and the append-only audit trail are deleted; never run on data
-- that may be needed as a review record.

begin;

drop trigger if exists comic_announcement_events_no_update_delete on public.comic_announcement_events;
drop trigger if exists comic_announcement_events_no_truncate on public.comic_announcement_events;
drop function if exists public.comic_announcement_events_append_only();

drop table if exists public.comic_announcement_events;
drop table if exists public.comic_adaptation_announcements;
drop table if exists public.comic_announcement_sources;

commit;
