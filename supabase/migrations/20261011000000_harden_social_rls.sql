-- Harden direct Data API access to club membership and direct messages.
-- The current social schema predates tracked migrations; referenced tables must exist.
BEGIN;

DROP POLICY IF EXISTS club_members_insert_own ON public.club_members;
CREATE POLICY club_members_insert_own
  ON public.club_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      role = 'member'
      OR (
        role = 'owner'
        AND EXISTS (
          SELECT 1 FROM public.clubs c
          WHERE c.id = club_members.club_id
            AND c.owner_id = (SELECT auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS dm_threads_update_part ON public.dm_threads;
CREATE POLICY dm_threads_update_part
  ON public.dm_threads
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_a OR (SELECT auth.uid()) = user_b)
  WITH CHECK ((SELECT auth.uid()) = user_a OR (SELECT auth.uid()) = user_b);

REVOKE UPDATE ON TABLE public.dm_threads FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (user_a, user_b, updated_at) ON TABLE public.dm_threads FROM PUBLIC, anon, authenticated;
GRANT UPDATE (updated_at) ON TABLE public.dm_threads TO authenticated;

DROP POLICY IF EXISTS dm_messages_update_part ON public.dm_messages;
CREATE POLICY dm_messages_update_part
  ON public.dm_messages
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = dm_messages.thread_id
      AND ((SELECT auth.uid()) = t.user_a OR (SELECT auth.uid()) = t.user_b)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = dm_messages.thread_id
      AND ((SELECT auth.uid()) = t.user_a OR (SELECT auth.uid()) = t.user_b)
  ));

REVOKE UPDATE ON TABLE public.dm_messages FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (thread_id, sender_id, text, ts, read_at) ON TABLE public.dm_messages FROM PUBLIC, anon, authenticated;
GRANT UPDATE (read_at) ON TABLE public.dm_messages TO authenticated;

COMMIT;
