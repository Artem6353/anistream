-- Миграция 006 (ТЗ блок 20.1): подписки пользователей.
create table if not exists public.follows (
  follower_id uuid references auth.users on delete cascade,
  following_id uuid references auth.users on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);
alter table public.follows enable row level security;
drop policy if exists follows_select_all on public.follows;
create policy follows_select_all on public.follows for select using (true);
drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows for delete using (auth.uid() = follower_id);
