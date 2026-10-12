-- Аудит 2026-10 (ТЗ 1.3): названия и даты серий.
-- Причина: на странице «Ван-Пис» последняя серия датировалась 29 июня 2025 (эп. 1134),
-- а названия серий везде были «Episode 1123» — данные лежали в titles.json и не
-- обновлялись после импорта. Таблица наполняется воркером scripts/sync-episodes.mjs
-- (AniList → даты/номера, Shikimori/Jikan → русские названия).

create table if not exists public.episodes (
  anime_id int not null,
  number int not null,
  title_ru text,
  title_en text,
  aired_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (anime_id, number)
);

-- «Свежесть ленты» на странице тайтла = max(aired_at) по тайтлу.
create index if not exists episodes_anime_aired_idx on public.episodes (anime_id, aired_at desc);
-- Воркер идёт по датам: «какие серии пора обновить».
create index if not exists episodes_updated_at_idx on public.episodes (updated_at);

alter table public.episodes enable row level security;

drop policy if exists episodes_read on public.episodes;
create policy episodes_read on public.episodes for select using (true);

drop policy if exists episodes_write on public.episodes;
create policy episodes_write on public.episodes for all to service_role using (true) with check (true);
