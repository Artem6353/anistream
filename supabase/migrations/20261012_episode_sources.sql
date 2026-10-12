-- Аудит 2026-10 (ТЗ 1.6): реестр источников видео в БД вместо локальных Python-bridge.
--
-- Причина: bridges/kodik_bridge.py и multi_player_bridge.py слушают 127.0.0.1:8765/8766,
-- на Vercel их нет (lib/config/providers.config.ts специально обнуляет loopback-адреса
-- при env.VERCEL). В итоге прод жил на кэше (3420 записей на ~8000 тайтлов), синтезе URL
-- по шаблону и «подборе пулом озвучек» — всё это показывалось зелёной точкой как
-- «Источник в кэше», хотя ни один URL не был получен от провайдера.
--
-- Про Kodik и один embed на тайтл (пункт ТЗ 1.6.1 требовал проверить на реальном ответе):
-- проверка с токеном в рамках аудита НЕ выполнялась (токена нет). По фактическому формату
-- данных в .cache/providers-resolve-cache.json Kodik отдаёт ОТДЕЛЬНУЮ запись на каждую
-- серию с собственным hash в пути (/seria/<id>/<hash>), а lib/providers/synthesize.ts
-- прямо не синтезирует Kodik: «hash уникален для каждой серии». Поэтому схема сразу
-- двухуровневая: озвучка тайтла (episode_sources) + URL конкретной серии
-- (episode_source_urls). Провайдеры, у которых один embed на тайтл (AniBoom ?episode=N,
-- CVH cdn-iframe/<id>/<voice>/<season>/<ep>), пишут одну строку в episode_sources с
-- episodes_count и без per-episode строк — рантайм подставляет номер серии сам.

create table if not exists public.episode_sources (
  anime_id int not null,
  provider text not null,
  translation_id text not null,
  translation_title text,
  translation_type text,                        -- voice | sub
  kind text not null default 'embed',           -- embed | file
  embed_url text,
  episodes_count int,
  checked_at timestamptz not null default now(),
  status text not null default 'ok',            -- ok | dead | unknown
  primary key (anime_id, provider, translation_id)
);

-- «Есть ли у тайтла рабочий источник» — запрос для robots/index и зелёной точки.
create index if not exists episode_sources_status_idx on public.episode_sources (anime_id, status);
create index if not exists episode_sources_checked_idx on public.episode_sources (checked_at);

create table if not exists public.episode_source_urls (
  anime_id int not null,
  provider text not null,
  translation_id text not null,
  episode int not null,
  kind text not null default 'embed',
  embed_url text,
  checked_at timestamptz not null default now(),
  status text not null default 'ok',
  primary key (anime_id, provider, translation_id, episode)
);

create index if not exists episode_source_urls_lookup_idx
  on public.episode_source_urls (anime_id, episode, status);

alter table public.episode_sources enable row level security;
alter table public.episode_source_urls enable row level security;

drop policy if exists episode_sources_read on public.episode_sources;
create policy episode_sources_read on public.episode_sources for select using (true);
drop policy if exists episode_sources_write on public.episode_sources;
create policy episode_sources_write on public.episode_sources for all to service_role using (true) with check (true);

drop policy if exists episode_source_urls_read on public.episode_source_urls;
create policy episode_source_urls_read on public.episode_source_urls for select using (true);
drop policy if exists episode_source_urls_write on public.episode_source_urls;
create policy episode_source_urls_write on public.episode_source_urls for all to service_role using (true) with check (true);
