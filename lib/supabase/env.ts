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

const readEnv = (key: string): string => (process.env[key] ?? '').trim();

export const SUPABASE_URL = readEnv('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY =
  readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || readEnv('NEXT_PUBLIC_SUPABASE_URL_ANON_KEY');

/** Настроен ли Supabase Auth в этой сборке. */
export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
