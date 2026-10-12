-- Аудит 2026-10 (ТЗ 2.1): каталог из git в Supabase.
--
-- Причина: lib/data/titles.json (28 МБ) коммитится каждые 6 часов (sync-catalog/push-daily)
-- и раздувает pack навсегда; Git LFS отклонён из-за квот (LIMITS.md). Плюс
-- .cache/providers-resolve-cache.json (98 МБ) намеренно трекается как seed-кэш.
-- Рантайм при этом читает файл синхронно и парсит 28 МБ JSON на каждый процесс —
-- на Vercel это холодные старты и риск упереться в лимит функции 10 с (Hobby).
--
-- Миграция создаёт таблицы; перенос данных — scripts/import-titles-to-db.mjs (идемпотентный
-- upsert пачками). lib/catalog.ts переключается флагом CATALOG_SOURCE=db|file, файл
-- остаётся fallback'ом до проверки smoke.

create table if not exists public.titles (
  id int primary key,                    -- AniList id
  slug text not null unique,
  anilist_id int not null unique,
  mal_id int,
  shikimori_id int,
  title_ru text,
  title_en text,
  title_romaji text,
  format text not null default 'tv',     -- tv | movie | ona | ova | special
  status text not null default 'finished', -- ongoing | finished | upcoming
  year int,
  season text,                           -- winter | spring | summer | fall
  episodes_total int,                    -- null = итог не объявлен (НЕ заглушка)
  episodes_released int,                 -- сколько серий реально вышло
  score numeric(3,1) default 0,
  popularity int default 0,              -- AniList favourites
  genres text[] not null default '{}',
  studios text[] not null default '{}',
  source text,                           -- первоисточник (MANGA / LIGHT_NOVEL / …)
  duration int,
  is_adult boolean default false,
  description_ru text,
  description_alt text,                  -- альтернативное (Shikimori) описание
  poster text,
  banner text,
  trailer text,
  meta_source text default 'anilist',    -- anilist | jikan
  hidden boolean default false,          -- скрыт модерацией (DMCA)
  updated_at timestamptz not null default now()
);

create index if not exists titles_status_idx on public.titles (status);
create index if not exists titles_year_idx on public.titles (year);
create index if not exists titles_popularity_idx on public.titles (popularity desc);
create index if not exists titles_score_idx on public.titles (score desc);
create index if not exists titles_genres_gin on public.titles using gin (genres);

-- Связи франшизы (порядок просмотра) и персонажи — отдельные таблицы, чтобы не
-- тащить их в выборку каталога.
create table if not exists public.title_relations (
  anime_id int not null,
  related_id int not null,
  relation_type text not null,
  primary key (anime_id, related_id)
);

create table if not exists public.title_characters (
  anime_id int not null,
  position int not null,
  name text not null,
  image text,
  role text,
  primary key (anime_id, position)
);

alter table public.titles enable row level security;
alter table public.title_relations enable row level security;
alter table public.title_characters enable row level security;

drop policy if exists titles_read on public.titles;
create policy titles_read on public.titles for select using (true);
drop policy if exists titles_write on public.titles;
create policy titles_write on public.titles for all to service_role using (true) with check (true);

drop policy if exists title_relations_read on public.title_relations;
create policy title_relations_read on public.title_relations for select using (true);
drop policy if exists title_relations_write on public.title_relations;
create policy title_relations_write on public.title_relations for all to service_role using (true) with check (true);

drop policy if exists title_characters_read on public.title_characters;
create policy title_characters_read on public.title_characters for select using (true);
drop policy if exists title_characters_write on public.title_characters;
create policy title_characters_write on public.title_characters for all to service_role using (true) with check (true);
