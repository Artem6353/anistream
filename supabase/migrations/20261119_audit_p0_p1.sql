-- Аудит 2026-11-19, P0/P1.
--
-- 1) set_episodes_released() была SECURITY DEFINER и исполнялась PUBLIC/anon/
--    authenticated: любой мог массово завысить «вышло серий». Оставляем только
--    service_role (её использует scripts/sync-episodes.mjs).
-- 2) Storage-бакеты avatars/banners были без лимита размера и MIME-типов.
-- 3) Профиль создавался только app-level upsert'ом: пользователь, который
--    зарегистрировался и не открыл кабинет, оставался без public.profiles.
--    Добавляем триггер на auth.users + backfill существующих.
-- 4) Формат username и длину bio теперь проверяет и БД, а не только UI.

begin;

-- ---------------------------------------------------------------------------
-- 1. RPC «сколько серий вышло» — только service_role
-- ---------------------------------------------------------------------------
revoke all on function public.set_episodes_released(jsonb) from public;
revoke all on function public.set_episodes_released(jsonb) from anon, authenticated;
grant execute on function public.set_episodes_released(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Storage: 2 MB и только изображения
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 2 * 1024 * 1024,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id in ('avatars', 'banners');

-- ---------------------------------------------------------------------------
-- 3. Профиль при регистрации + безопасный backfill
-- ---------------------------------------------------------------------------
-- Генерирует валидный уникальный username из metadata/email/local-part.
-- SECURITY DEFINER нужен, чтобы триггер auth.users мог писать в public.profiles;
-- search_path закреплён, EXECUTE ниже отзывается у клиентских ролей.
create or replace function public.profile_username(
  p_user_id uuid,
  p_email text,
  p_meta jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  suffix integer := 0;
begin
  base := coalesce(
    nullif(trim(p_meta ->> 'username'), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    ''
  );

  base := lower(base);
  base := regexp_replace(base, '[^a-z0-9_-]+', '-', 'g');
  base := regexp_replace(base, '^[^a-z0-9]+', '', 'g');
  base := regexp_replace(base, '[^a-z0-9]+$', '', 'g');

  if length(base) < 3 then
    base := 'user-' || left(replace(p_user_id::text, '-', ''), 8);
  end if;

  base := left(base, 24);

  -- Зарезервированные имена не должны появляться даже через OAuth-метаданные.
  if base = any (array[
    'admin', 'administrator', 'root', 'support', 'moderator',
    'anistream', 'aninova', 'profile', 'auth', 'api', 'settings',
    'list', 'history', 'bookmarks', 'achievements'
  ]) then
    base := left(base, 18) || '-user';
  end if;

  candidate := base;
  while exists (
    select 1
    from public.profiles
    where lower(username) = lower(candidate)
      and user_id <> p_user_id
  ) loop
    suffix := suffix + 1;
    candidate := left(base, greatest(1, 24 - 1 - length(suffix::text))) || '-' || suffix::text;
  end loop;

  return candidate;
end;
$$;

revoke all on function public.profile_username(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.profile_username(uuid, text, jsonb) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, username, bio)
  values (
    new.id,
    public.profile_username(new.id, new.email, new.raw_user_meta_data),
    ''
  )
  on conflict (user_id) do nothing;
  return new;
exception
  -- Гонка двух регистраций с одинаковым ником не должна ломать signup.
  when unique_violation then
    insert into public.profiles (user_id, username, bio)
    values (
      new.id,
      'user-' || left(replace(new.id::text, '-', ''), 8),
      ''
    )
    on conflict (user_id) do nothing;
    return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill: пользователи без строки профиля (в проде был 1 orphan).
do $$
declare
  u record;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    left join public.profiles p on p.user_id = au.id
    where p.user_id is null
  loop
    insert into public.profiles (user_id, username, bio)
    values (
      u.id,
      public.profile_username(u.id, u.email, u.raw_user_meta_data),
      ''
    )
    on conflict (user_id) do nothing;
  end loop;
end;
$$;

-- Пустые username у уже существующих профилей тоже заполняем.
do $$
declare
  p record;
begin
  for p in
    select pr.user_id, au.email, au.raw_user_meta_data
    from public.profiles pr
    join auth.users au on au.id = pr.user_id
    where pr.username is null or btrim(pr.username) = ''
  loop
    update public.profiles
    set username = public.profile_username(p.user_id, p.email, p.raw_user_meta_data),
        updated_at = now()
    where user_id = p.user_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Ограничения profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format check (
    username is null
    or (
      char_length(username) between 3 and 24
      and username ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
    )
  ) not valid;
alter table public.profiles validate constraint profiles_username_format;

alter table public.profiles
  drop constraint if exists profiles_bio_length;
alter table public.profiles
  add constraint profiles_bio_length check (
    bio is null or char_length(bio) <= 280
  ) not valid;
alter table public.profiles validate constraint profiles_bio_length;

-- Регистр не должен создавать «Admin» и «admin» как разные ники.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null;

commit;
