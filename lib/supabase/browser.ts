'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from './env';

/**
 * Браузерный клиент Supabase Auth.
 *
 * `createBrowserClient` из @supabase/ssr хранит сессию в **cookies** (а не только в
 * localStorage), поэтому серверные компоненты и proxy видят того же пользователя.
 * Клиент создаётся один раз на вкладку: повторное создание плодит обработчики
 * onAuthStateChange и лишние запросы.
 */
let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  // B2-C: callback сам обменивает PKCE-код на сессию. Авто-обмен в SDK
  // срабатывает раньше эффекта страницы и съедает code_verifier — тогда
  // ручной exchange падает, хотя cookie уже записана.
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { detectSessionInUrl: false },
  });
  return client;
}
