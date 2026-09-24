-- 002_profile_rls.sql — RLS-политики для синхронизации профиля (задача: profile_lists/profile_history).
-- Применить вручную: Supabase Dashboard → SQL Editor → вставить → Run.
-- Идемпотентно: drop policy if exists + create. Структуру таблиц НЕ меняет.
-- Требование: доступ только к строкам со своим user_id (auth.uid() = user_id).

-- profile_lists: доступ только своему user_id
alter table public.profile_lists enable row level security;

drop policy if exists "profile_lists_select_own" on public.profile_lists;
create policy "profile_lists_select_own" on public.profile_lists
  for select using (auth.uid() = user_id);

drop policy if exists "profile_lists_insert_own" on public.profile_lists;
create policy "profile_lists_insert_own" on public.profile_lists
  for insert with check (auth.uid() = user_id);

drop policy if exists "profile_lists_update_own" on public.profile_lists;
create policy "profile_lists_update_own" on public.profile_lists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profile_lists_delete_own" on public.profile_lists;
create policy "profile_lists_delete_own" on public.profile_lists
  for delete using (auth.uid() = user_id);

-- profile_history: то же
alter table public.profile_history enable row level security;

drop policy if exists "profile_history_select_own" on public.profile_history;
create policy "profile_history_select_own" on public.profile_history
  for select using (auth.uid() = user_id);

drop policy if exists "profile_history_insert_own" on public.profile_history;
create policy "profile_history_insert_own" on public.profile_history
  for insert with check (auth.uid() = user_id);

drop policy if exists "profile_history_update_own" on public.profile_history;
create policy "profile_history_update_own" on public.profile_history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profile_history_delete_own" on public.profile_history;
create policy "profile_history_delete_own" on public.profile_history
  for delete using (auth.uid() = user_id);
