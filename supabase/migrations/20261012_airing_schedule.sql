-- Аудит 2026-10 (ТЗ 1.1): расписание выхода серий переезжает из рантайм-запросов
-- к AniList в таблицу. Причина: AniList лимитирует 90 запросов/мин по IP, а у Vercel
-- IP общие — /schedule на проде стабильно падал в демо-неделю («AniList недоступен»).
-- Теперь рантайм читает только БД (ISR 600), а AniList опрашивает воркер
-- scripts/sync-airing.mjs из GitHub Actions (свой IP, cron каждые 30 минут).
--
-- Миграция идемпотентна: всё через if not exists / drop policy if exists.

create table if not exists public.airing_schedule (
  anime_id int not null,
  episode int not null,
  airing_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (anime_id, episode)
);

-- Выборка «окно −2…+8 дней» — единственный горячий запрос рантайма.
create index if not exists airing_schedule_airing_at_idx on public.airing_schedule (airing_at);

alter table public.airing_schedule enable row level security;

-- Публичное чтение: расписание не содержит персональных данных.
drop policy if exists airing_schedule_read on public.airing_schedule;
create policy airing_schedule_read on public.airing_schedule for select using (true);

-- Запись — только service_role (воркер). RLS не содержит write-политик для
-- аутентифицированных/анонимных ролей, поэтому любой прямой REST-запрос отклоняется.
drop policy if exists airing_schedule_write on public.airing_schedule;
create policy airing_schedule_write on public.airing_schedule for all to service_role using (true) with check (true);

-- Мусор старше 30 дней чистит сам воркер (DELETE по airing_at), а не триггер:
-- на free-тарифе Supabase лишний триггер на каждую запись не нужен.
