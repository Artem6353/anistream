-- Миграция 008 (ТЗ блок 20.3): личные сообщения.
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references auth.users on delete cascade,
  user_b uuid references auth.users on delete cascade,
  updated_at timestamptz default now()
);
create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.dm_threads on delete cascade,
  sender_id uuid references auth.users on delete cascade,
  text text not null,
  ts timestamptz default now(),
  read_at timestamptz
);
alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
drop policy if exists dm_threads_part on public.dm_threads;
create policy dm_threads_part on public.dm_threads for select using (auth.uid() in (user_a, user_b));
drop policy if exists dm_threads_insert_part on public.dm_threads;
create policy dm_threads_insert_part on public.dm_threads for insert with check (auth.uid() in (user_a, user_b));
drop policy if exists dm_threads_update_part on public.dm_threads;
create policy dm_threads_update_part on public.dm_threads for update using (auth.uid() in (user_a, user_b));
drop policy if exists dm_messages_part on public.dm_messages;
create policy dm_messages_part on public.dm_messages for select using (exists (select 1 from public.dm_threads t where t.id = thread_id and auth.uid() in (t.user_a, t.user_b)));
drop policy if exists dm_messages_insert_part on public.dm_messages;
create policy dm_messages_insert_part on public.dm_messages for insert with check (auth.uid() = sender_id and exists (select 1 from public.dm_threads t where t.id = thread_id and auth.uid() in (t.user_a, t.user_b)));
drop policy if exists dm_messages_update_part on public.dm_messages;
create policy dm_messages_update_part on public.dm_messages for update using (exists (select 1 from public.dm_threads t where t.id = thread_id and auth.uid() in (t.user_a, t.user_b)));
