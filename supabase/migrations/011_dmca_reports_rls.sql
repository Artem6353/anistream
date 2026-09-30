-- Миграция 011 (аудит 30.09.2026, P0-3): закрытие anon-INSERT в таблицы обращений
-- на УЖЕ ЖИВЫХ базах. Hardening этих политик попал только в schema.sql (baseline
-- для новых БД), поэтому прод-База, созданная до 30.09, оставалась с открытыми
-- dmca_insert/reports_insert: зонд anon POST dmca_requests {} проходил RLS и падал
-- лишь на NOT NULL (400 code 23503/23502) — прямой REST-спам мимо rate-limit приложения.
-- Предусловие: SUPABASE_SERVICE_KEY задан в env (роуты /api/dmca и /api/report
-- пишут service-ключом — их работа не меняется).
-- Применение: SQL Editor или `supabase db push`; проверка приёмки:
--   anon POST /rest/v1/dmca_requests → 401/403 (42501);
--   anon POST /rest/v1/source_reports → 401/403 (42501);
--   серверный POST /api/dmca (service) → 200.

drop policy if exists dmca_insert on public.dmca_requests;
create policy dmca_insert on public.dmca_requests for insert to service_role with check (true);

drop policy if exists reports_insert on public.source_reports;
create policy reports_insert on public.source_reports for insert to service_role with check (true);
