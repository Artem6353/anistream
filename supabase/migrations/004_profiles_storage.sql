-- Миграция 004 (ТЗ блок 16–17): профили с аватаром/баннером/био/бейджами + Storage.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  username text unique,
  avatar_url text,
  banner_url text,
  bio text default '',
  pinned_achievements text[] default '{}',
  updated_at timestamptz default now()
);
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists bio text default '';
alter table public.profiles add column if not exists pinned_achievements text[] default '{}';
alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);          -- публичные профили
drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert on public.profiles for insert with check (auth.uid() = user_id);
drop policy if exists profiles_own_write on public.profiles;
create policy profiles_own_write on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Отзывы: связь с пользователем для аватаров/бейджей в отзывах (ТЗ блок 17)
alter table public.reviews add column if not exists user_id text;

-- Storage: аватары и баннеры (публичное чтение, запись только владельцем по папке <uid>/)
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true), ('banners', 'banners', true)
on conflict (id) do nothing;
drop policy if exists profile_media_read on storage.objects;
create policy profile_media_read on storage.objects for select using (bucket_id in ('avatars', 'banners'));
drop policy if exists profile_media_write on storage.objects;
create policy profile_media_write on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'banners') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists profile_media_update on storage.objects;
create policy profile_media_update on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'banners') and (storage.foldername(name))[1] = auth.uid()::text);
