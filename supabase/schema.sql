-- AniStream: схема Supabase (бесплатный тариф) для общих отзывов/комментариев.
-- Выполнить один раз в SQL Editor проекта Supabase.

create table if not exists public.reviews (
  id text primary key,
  slug text not null,
  name text not null default 'Гость',
  rating int check (rating is null or rating between 1 and 10),
  text text not null,
  ts bigint not null,
  likes int not null default 0,
  dislikes int not null default 0,
  parent text
);

create index if not exists reviews_slug_ts on public.reviews (slug, ts desc);

-- публичная запись/чтение для anon-ключа (модерация — через service_role/админку):
alter table public.reviews enable row level security;
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (true);
drop policy if exists reviews_insert on public.reviews;
-- insert только через service_role (edge function submit-review с Turnstile):
create policy reviews_insert on public.reviews for insert to service_role with check (true);
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews for update using (true);

-- профили и синхронизация списков (ТЗ 2.2):
create table if not exists public.profile_lists (
  user_id uuid references auth.users on delete cascade,
  slug text not null,
  status text not null,
  updated_at timestamptz default now(),
  primary key (user_id, slug)
);
create table if not exists public.profile_history (
  user_id uuid references auth.users on delete cascade,
  slug text not null,
  episode int not null,
  position real, duration real,
  updated_at timestamptz default now(),
  primary key (user_id, slug, episode)
);
alter table public.profile_lists enable row level security;
alter table public.profile_history enable row level security;
drop policy if exists lists_own on public.profile_lists;
create policy lists_own on public.profile_lists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists history_own on public.profile_history;
create policy history_own on public.profile_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- push-подписки:
create table if not exists public.push_subs (
  id text primary key,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz default now()
);
alter table public.push_subs enable row level security;
drop policy if exists push_insert on public.push_subs;
create policy push_insert on public.push_subs for insert with check (true);

create table if not exists public.dmca_requests (
  id text primary key,
  email text not null, url text not null, rights boolean not null, text text not null,
  slug text, status text default 'new', ts bigint not null
);
create table if not exists public.source_reports (
  id text primary key,
  slug text not null, episode int not null, source text not null, problem text not null,
  ts bigint not null
);
alter table public.dmca_requests enable row level security;
alter table public.source_reports enable row level security;
drop policy if exists dmca_insert on public.dmca_requests;
create policy dmca_insert on public.dmca_requests for insert with check (true);
drop policy if exists reports_insert on public.source_reports;
create policy reports_insert on public.source_reports for insert with check (true);
