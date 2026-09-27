-- Миграция 005: бэкфилл username для профилей без имени (иначе ник в отзывах — span, не ссылка).
-- Берём основу из email аккаунта, санитизируем под [a-z0-9_-]; коллизии разрешаем суффиксом.
update public.profiles p
set username = sub.name
from (
  select u.id as uid,
         coalesce(
           nullif(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_-]', '-', 'g'), ''),
           'user-' || left(u.id::text, 8)
         ) as name
  from auth.users u
) sub
where p.user_id = sub.uid and (p.username is null or p.username = '');

-- уникальность: дубликатам — суффикс из префикса uid
update public.profiles p
set username = p.username || '-' || left(p.user_id::text, 4)
where exists (
  select 1 from public.profiles q
  where q.username = p.username and q.user_id <> p.user_id
);
