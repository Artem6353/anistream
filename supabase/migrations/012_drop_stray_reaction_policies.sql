-- Миграция 012 (30.09.2026): удаление политик-призраков review_reactions.
-- Обнаружены на проде сверкой pg_policies (скриншот 01.10): реакции после 010
-- остались открытыми для anon, потому что RLS-политики на INSERT складываются
-- через ИЛИ — достаточно одной проходящей: reactions_insert_any (public)
-- обходила service_role-ограничение из 010.
-- Политик с такими именами нет ни в одной миграции репозитория — созданы вручную
-- вне migration-потока (дашборд/assistant). Удаляем во всех окружениях.
--
-- Оставляем осознанно: reactions_read (public SELECT — счётчики публичны),
-- reactions_insert/update/delete (service_role из 010 — пишет только наш API).
-- reviews_update НЕ трогаем: её roles={public} — это норма для 010, ограничение
-- живёт в USING/WITH CHECK (user_id = auth.uid()::text), сверка qual — в DEPLOY.md.

drop policy if exists reactions_insert_any on public.review_reactions;
drop policy if exists reactions_update_own on public.review_reactions;
drop policy if exists reactions_delete_own on public.review_reactions;
drop policy if exists reactions_select_all on public.review_reactions;

-- Приёмка:
--   select policyname, cmd, roles from pg_policies
--   where tablename = 'review_reactions' order by 1;
--   → ровно 4 строки: reactions_read(SELECT,{public}) + insert/update/delete({service_role});
--   npm run check:rls → все PASS.
