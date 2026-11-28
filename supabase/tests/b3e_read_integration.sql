-- B3-E read integration contracts: views exist, inherit the public gates and
-- expose no write surface. Run after 20261128_comics_b3e_read_integration.sql.
do $$
begin
  if (select count(*) from information_schema.views
      where table_schema = 'public'
        and table_name in ('comic_public_catalog','comic_public_adaptations','comic_public_kind_counts','comic_public_genre_counts')) <> 4 then
    raise exception 'B3-E: not all public read views exist';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'comic_public_%'
      and c.relkind = 'v'
      and (c.reloptions is null or not ('security_barrier=true' = any (c.reloptions)))
  ) then
    raise exception 'B3-E: a public view is missing security_barrier=true';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('comic_public_catalog','comic_public_adaptations','comic_public_kind_counts','comic_public_genre_counts')
      and (c.reloptions is null or not ('security_invoker=false' = any (c.reloptions)))
  ) then
    raise exception 'B3-E: a public view is missing security_invoker=false';
  end if;

  if not has_table_privilege('anon', 'public.comic_public_catalog', 'SELECT')
     or not has_table_privilege('anon', 'public.comic_public_adaptations', 'SELECT') then
    raise exception 'B3-E: anon cannot read the public read views';
  end if;

  if has_table_privilege('anon', 'public.comic_public_catalog', 'INSERT')
     or has_table_privilege('anon', 'public.comic_public_adaptations', 'UPDATE')
     or has_table_privilege('anon', 'public.comic_public_kind_counts', 'DELETE') then
    raise exception 'B3-E: anon has a write privilege on a public view';
  end if;

  if has_table_privilege('anon', 'public.comic_works', 'SELECT')
     or has_table_privilege('anon', 'public.comic_adaptations', 'SELECT') then
    raise exception 'B3-E: anon can read base comic tables directly';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comic_public_catalog'
      and column_name in ('search_aliases','source_anime_count','role','country_code')
    group by table_schema, table_name
    having count(*) = 4
  ) then
    raise exception 'B3-E: comic_public_catalog lacks expected projection columns';
  end if;
end $$;
