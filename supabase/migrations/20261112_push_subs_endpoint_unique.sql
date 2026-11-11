-- Аудит 2026-11-12: атомарный upsert подписок (push/subscribe) требует unique
-- на endpoint. Дедуп оставляем последнюю запись (ctid — физический порядок).
delete from public.push_subs a using public.push_subs b
  where a.endpoint = b.endpoint and a.ctid < b.ctid;
create unique index if not exists push_subs_endpoint_key on public.push_subs (endpoint);

-- Страховка для admin/hide (Supabase-first): колонка hidden в public.titles.
alter table public.titles add column if not exists hidden boolean not null default false;
