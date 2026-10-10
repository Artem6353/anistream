-- Index foreign-key columns and avoid repeated auth.uid() evaluation in RLS.
BEGIN;

CREATE INDEX IF NOT EXISTS club_members_user_id_idx ON public.club_members (user_id);
CREATE INDEX IF NOT EXISTS club_posts_author_id_idx ON public.club_posts (author_id);
CREATE INDEX IF NOT EXISTS club_posts_club_id_idx ON public.club_posts (club_id);
CREATE INDEX IF NOT EXISTS clubs_owner_id_idx ON public.clubs (owner_id);
CREATE INDEX IF NOT EXISTS dm_messages_sender_id_idx ON public.dm_messages (sender_id);
CREATE INDEX IF NOT EXISTS dm_messages_thread_id_idx ON public.dm_messages (thread_id);
CREATE INDEX IF NOT EXISTS dm_threads_user_a_idx ON public.dm_threads (user_a);
CREATE INDEX IF NOT EXISTS dm_threads_user_b_idx ON public.dm_threads (user_b);
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows (following_id);
CREATE INDEX IF NOT EXISTS forum_posts_author_id_idx ON public.forum_posts (author_id);
CREATE INDEX IF NOT EXISTS forum_posts_thread_id_idx ON public.forum_posts (thread_id);
CREATE INDEX IF NOT EXISTS forum_threads_author_id_idx ON public.forum_threads (author_id);
CREATE INDEX IF NOT EXISTS forum_threads_category_id_idx ON public.forum_threads (category_id);

DO $migration$
DECLARE
  p record;
  new_qual text;
  new_check text;
  stmt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual LIKE '%auth.uid()%' AND qual NOT LIKE '%SELECT auth.uid()%')
        OR
        (with_check IS NOT NULL AND with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%SELECT auth.uid()%')
      )
  LOOP
    new_qual := p.qual;
    new_check := p.with_check;

    IF new_qual IS NOT NULL
       AND new_qual LIKE '%auth.uid()%'
       AND new_qual NOT LIKE '%SELECT auth.uid()%' THEN
      new_qual := replace(new_qual, 'auth.uid()', '(SELECT auth.uid())');
    END IF;

    IF new_check IS NOT NULL
       AND new_check LIKE '%auth.uid()%'
       AND new_check NOT LIKE '%SELECT auth.uid()%' THEN
      new_check := replace(new_check, 'auth.uid()', '(SELECT auth.uid())');
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || ' USING (' || new_qual || ')';
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || ' WITH CHECK (' || new_check || ')';
    END IF;
    EXECUTE stmt;
  END LOOP;
END;
$migration$;

-- These command-specific policies duplicated existing FOR ALL owner policies.
DROP POLICY IF EXISTS profile_history_delete_own ON public.profile_history;
DROP POLICY IF EXISTS profile_history_insert_own ON public.profile_history;
DROP POLICY IF EXISTS profile_history_select_own ON public.profile_history;
DROP POLICY IF EXISTS profile_history_update_own ON public.profile_history;

DROP POLICY IF EXISTS profile_lists_delete_own ON public.profile_lists;
DROP POLICY IF EXISTS profile_lists_insert_own ON public.profile_lists;
DROP POLICY IF EXISTS profile_lists_select_own ON public.profile_lists;
DROP POLICY IF EXISTS profile_lists_update_own ON public.profile_lists;

COMMIT;
