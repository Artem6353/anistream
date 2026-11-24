/**
 * Конфигурация Supabase для браузера/сервера (редизайн + вход через Supabase Auth).
 *
 * Ключи читаются в двух вариантах имён: Supabase выдаёт новый проект с
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`, а часть старых конфигов использует
 * `NEXT_PUBLIC_SUPABASE_URL_ANON_KEY` (это уже поддержано в lib/sync.ts).
 *
 * Всё, что завязано на вход, обязано деградировать мирно: если ключей нет
 * (локальная разработка без .env.local, CI-билд), страницы показывают понятное
 * состояние «вход не настроен», а не падают с 500.
 */

/* Прямые обращения к process.env нужны, чтобы Next подставил значения в
   клиентский бандл. Динамический process.env[key] в браузере пуст, из-за
   чего форма входа считала сборку ненастроенной. */
const readEnv = (value: string | undefined): string => (value ?? '').trim();

export const SUPABASE_URL = readEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY =
  readEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || readEnv(process.env.NEXT_PUBLIC_SUPABASE_URL_ANON_KEY);

/** Настроен ли Supabase Auth в этой сборке. */
export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
