-- Миграция 003 (аудит, блок 5): таблица реакций и триггеры пересчёта счётчиков.
-- В проде review_reactions создавалась вручную (дрейф схемы), триггеры могли отсутствовать —
-- из-за этого лайки/дизлайки не пересчитывали reviews.likes/dislikes.
-- Скрипт идемпотентен: безопасно выполнить в SQL Editor повторно.

create table if not exists public.review_reactions (
  id text primary key default gen_random_uuid()::text,
  review_id text not null references public.reviews (id) on delete cascade,
  user_id text not null,
  kind text not null check (kind in ('like', 'dislike')),
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint,
  unique (review_id, user_id)   -- анти-накрутка на уровне БД: один голос на пользователя
);

alter table public.review_reactions enable row level security;
drop policy if exists reactions_read on public.review_reactions;
create policy reactions_read on public.review_reactions for select using (true);
drop policy if exists reactions_insert on public.review_reactions;
create policy reactions_insert on public.review_reactions for insert with check (true);
drop policy if exists reactions_update on public.review_reactions;
create policy reactions_update on public.review_reactions for update using (true);
drop policy if exists reactions_delete on public.review_reactions;
create policy reactions_delete on public.review_reactions for delete using (true);

-- Пересчёт reviews.likes/dislikes ТОЛЬКО триггером: API реакций не трогает счётчики
-- (read-modify-write из кода давал двойной инкремент, коммит 84c5b2).
create or replace function public.recount_review_reactions() returns trigger
language plpgsql as $$
declare
  rid text;
begin
  if tg_op = 'DELETE' then rid := old.review_id; else rid := new.review_id; end if;
  update public.reviews set
    likes    = (select count(*) from public.review_reactions where review_id = rid and kind = 'like'),
    dislikes = (select count(*) from public.review_reactions where review_id = rid and kind = 'dislike')
  where id = rid;
  return coalesce(new, old);
end $$;

drop trigger if exists review_reactions_after_insert on public.review_reactions;
create trigger review_reactions_after_insert
  after insert on public.review_reactions
  for each row execute function public.recount_review_reactions();

drop trigger if exists review_reactions_after_update on public.review_reactions;
create trigger review_reactions_after_update
  after update on public.review_reactions
  for each row execute function public.recount_review_reactions();

drop trigger if exists review_reactions_after_delete on public.review_reactions;
create trigger review_reactions_after_delete
  after delete on public.review_reactions
  for each row execute function public.recount_review_reactions();
