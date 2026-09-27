-- Миграция 007 (ТЗ блок 20.2): клубы по интересам + участники + обсуждения.
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  cover_url text,
  owner_id uuid references auth.users on delete cascade,
  created_at timestamptz default now()
);
create table if not exists public.club_members (
  club_id uuid references public.clubs on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text default 'member',
  joined_at timestamptz default now(),
  primary key (club_id, user_id)
);
-- расширение схемы для обсуждений внутри клуба (ТЗ: «внутри клуба — обсуждения»)
create table if not exists public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs on delete cascade,
  author_id uuid references auth.users on delete cascade,
  text text not null,
  ts timestamptz default now()
);
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_posts enable row level security;
drop policy if exists clubs_select_all on public.clubs;
create policy clubs_select_all on public.clubs for select using (true);
drop policy if exists clubs_insert_own on public.clubs;
create policy clubs_insert_own on public.clubs for insert with check (auth.uid() = owner_id);
drop policy if exists clubs_update_owner on public.clubs;
create policy clubs_update_owner on public.clubs for update using (auth.uid() = owner_id);
drop policy if exists clubs_delete_owner on public.clubs;
create policy clubs_delete_owner on public.clubs for delete using (auth.uid() = owner_id);
drop policy if exists club_members_select_all on public.club_members;
create policy club_members_select_all on public.club_members for select using (true);
drop policy if exists club_members_insert_own on public.club_members;
create policy club_members_insert_own on public.club_members for insert with check (auth.uid() = user_id);
drop policy if exists club_members_delete_own on public.club_members;
create policy club_members_delete_own on public.club_members for delete using (auth.uid() = user_id or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid()));
drop policy if exists club_posts_select_all on public.club_posts;
create policy club_posts_select_all on public.club_posts for select using (true);
drop policy if exists club_posts_insert_own on public.club_posts;
create policy club_posts_insert_own on public.club_posts for insert with check (auth.uid() = author_id);
drop policy if exists club_posts_delete_own on public.club_posts;
create policy club_posts_delete_own on public.club_posts for delete using (auth.uid() = author_id or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid()));
