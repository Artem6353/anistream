-- Миграция 010 (аудит 2026-09-28, P0): закрытие открытых write-политик.
-- Предусловие: SUPABASE_SERVICE_KEY задан в env Vercel (API ходит service-ключом).

-- P0-1: отзывы может править только автор (ранее update using (true) — правил кто угодно).
-- service_role обходит RLS: модерация/наш API не затрагиваются.
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews for update
  using (user_id is not null and user_id = auth.uid()::text)
  with check (user_id is not null and user_id = auth.uid()::text);

-- P0-2: реакции пишутся только через наш API (service_role) — конец накрутке прямым REST.
drop policy if exists reactions_insert on public.review_reactions;
create policy reactions_insert on public.review_reactions for insert to service_role with check (true);
drop policy if exists reactions_update on public.review_reactions;
create policy reactions_update on public.review_reactions for update to service_role using (true);
drop policy if exists reactions_delete on public.review_reactions;
create policy reactions_delete on public.review_reactions for delete to service_role using (true);

-- P0-3: push-подписки создаются только сервером (service_role) — конец спаму прямым REST.
drop policy if exists push_insert on public.push_subs;
create policy push_insert on public.push_subs for insert to service_role with check (true);
