-- Миграция 009 (ТЗ блок 20.5): форум (разделы, треды, посты) + сидирование разделов.
create table if not exists public.forum_categories (
  id serial primary key,
  slug text unique,
  name text,
  description text
);
create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  category_id int references public.forum_categories on delete cascade,
  author_id uuid references auth.users on delete cascade,
  title text not null,
  created_at timestamptz default now()
);
create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.forum_threads on delete cascade,
  author_id uuid references auth.users on delete cascade,
  text text not null,
  ts timestamptz default now()
);
insert into public.forum_categories (slug, name, description) values
  ('obshchee', 'Общее', 'Всё обо всём'),
  ('novosti', 'Новости', 'Релизы, анонсы, индустрия'),
  ('manga', 'Манга', 'Обсуждения манги и ранобэ'),
  ('tehnologii', 'Технологии', 'Плееры, озвучки, качество'),
  ('fludilka', 'Флудилка', 'Оффтоп и трёп')
on conflict (slug) do nothing;
alter table public.forum_categories enable row level security;
alter table public.forum_threads enable row level security;
alter table public.forum_posts enable row level security;
drop policy if exists forum_read_all on public.forum_categories;
create policy forum_read_all on public.forum_categories for select using (true);
drop policy if exists forum_threads_read on public.forum_threads;
create policy forum_threads_read on public.forum_threads for select using (true);
drop policy if exists forum_threads_write on public.forum_threads;
create policy forum_threads_write on public.forum_threads for insert with check (auth.uid() = author_id);
drop policy if exists forum_threads_del_own on public.forum_threads;
create policy forum_threads_del_own on public.forum_threads for delete using (auth.uid() = author_id);
drop policy if exists forum_posts_read on public.forum_posts;
create policy forum_posts_read on public.forum_posts for select using (true);
drop policy if exists forum_posts_write on public.forum_posts;
create policy forum_posts_write on public.forum_posts for insert with check (auth.uid() = author_id);
drop policy if exists forum_posts_del_own on public.forum_posts;
create policy forum_posts_del_own on public.forum_posts for delete using (auth.uid() = author_id);
