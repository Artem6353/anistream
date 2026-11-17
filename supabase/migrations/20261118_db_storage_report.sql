-- P1-2: точный размер базы для монитора квоты (scripts/check-db-size.mjs).
--
-- Зачем: Supabase Free даёт 500 МБ. `episode_source_urls` растёт с каждой гидрацией
-- (≈90–150 байт на серию, до 1200 серий на озвучку), и узнать о заполнении хочется
-- за месяц, а не по пустым источникам на сайте.
--
-- Безопасность:
--   • security definer + фиксированный search_path — функция не зависит от ролей вызывающего;
--   • execute отозван у public/anon/authenticated и выдан только service_role:
--     размеры БД не должны быть видны анонимному клиенту;
--   • функция ничего не пишет и не читает пользовательские строки — только системные каталоги.
--
-- Применение: `supabase db push` (или вручную в SQL-редакторе Supabase).
-- Пока функция не применена, `check-db-size.mjs` работает в режиме оценки
-- (exact: false) и не падает.

create or replace function public.db_storage_report()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'bytes', pg_total_relation_size(c.oid),
        'rows', greatest(c.reltuples::bigint, 0)
      ) order by pg_total_relation_size(c.oid) desc)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.db_storage_report() from public;
revoke all on function public.db_storage_report() from anon;
revoke all on function public.db_storage_report() from authenticated;
grant execute on function public.db_storage_report() to service_role;
