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
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
