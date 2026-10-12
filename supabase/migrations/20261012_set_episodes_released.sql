-- Аудит 2026-10, задача 1: «сколько серий вышло» из БД, а не из устаревшего каталога.
--
-- Зачем RPC, а не PATCH/POST:
--   * POST /rest/v1/titles?on_conflict=id с частичной строкой СОЗДАЛ бы строку-огрызок
--     (id + episodes_released, остальные колонки null), если тайтла ещё нет в таблице;
--   * PATCH по списку id — это по одному запросу на тайтл (226 онгоингов = 226 запросов);
--   * функция принимает массив и делает один upsert «только колонка episodes_released».
--
-- Значение пишет scripts/sync-episodes.mjs из Shikimori `episodes_aired`
-- (у «Ван-Пис» там 1180 при episodes=0), читает рантайм при старте процесса.
--
-- Оценка размера: колонка int у 226 онгоингов — единицы килобайт, таблицу не раздувает.
-- Вариант «заполнить строки episodes номерами без даты» отклонён: 16 739 строк
-- (сумма episodes_aired по онгоингам) × ~130 байт ≈ 2,2 МБ, а у гигантов вроде
-- «Садзаэ-сан» (2784 серии) это мусор без дат и названий.

create or replace function public.set_episodes_released(p_rows jsonb)
returns integer
language plpgsql
security definer
-- search_path закреплён явно (тот же приём, что в 20261010215240_fix_review_function_search_path.sql).
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_rows is null then
    return 0;
  end if;

  with incoming as (
    select
      nullif((elem ->> 'id')::text, '')::int as id,
      nullif((elem ->> 'released')::text, '')::int as released
    from jsonb_array_elements(p_rows) as elem
  ),
  valid as (
    select id, max(released) as released
    from incoming
    where id is not null and released is not null and released > 0
    group by id
  )
  update public.titles t
  set episodes_released = v.released,
      updated_at = now()
  from valid v
  where t.id = v.id
    -- только увеличиваем: регресс из-за сбоя источника не должен откатывать прогресс
    and (t.episodes_released is null or v.released > t.episodes_released);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Выполнять может только service_role (RLS на public отзывает EXECUTE у anon/authenticated
-- по умолчанию; явных GRANT не добавляем).

-- Представления для рантайм-прайма «сколько серий вышло» (instrumentation.ts →
-- lib/episode-data.ts:primeEpisodeData). PostgREST не умеет GROUP BY, поэтому
-- максимум считаем в БД и отдаём по одной строке на тайтл:
--   episodes        ~16 739 строк по онгоингам → 226 строк;
--   airing_schedule ~5 000 строк окна          → ~1 500 строк.
-- Без представлений пришлось бы тянуть десятки тысяч строк на каждый старт процесса.

create or replace view public.episode_progress as
select
  anime_id,
  max(number) as max_number,
  count(*) as known_episodes
from public.episodes
-- дата неизвестна (aired_at is null) — номер всё равно считаем вышедшим:
-- воркер пишет номер только из подтверждённого источника
where aired_at is null or aired_at <= now()
group by anime_id;

create or replace view public.airing_progress as
select anime_id, max(episode) as max_episode
from public.airing_schedule
where airing_at <= now()
group by anime_id;

-- Чтение представлений публичное (как и базовых таблиц): номера и даты серий
-- не являются персональными данными.
alter view public.episode_progress set (security_invoker = off);
alter view public.airing_progress set (security_invoker = off);
