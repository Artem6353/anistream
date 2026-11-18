import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from './env';

/**
 * Серверный клиент Supabase для Server Components и route handlers.
 *
 * Сессия читается из cookies, которые выставляет @supabase/ssr на клиенте
 * (и обновляет proxy). В Server Component запись cookies запрещена — поэтому
 * `setAll` глотает ошибку: обновлением занимается proxy, а не рендер.
 */
export async function createServerSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured()) return null;
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items) cookieStore.set(name, value, options);
        } catch {
          /* RSC: cookies доступны только на чтение. Обновление сессии делает proxy. */
        }
      },
    },
  });
}

/** Текущий пользователь на сервере (валидирует JWT в Supabase, а не доверяет cookie). */
export async function getServerUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}
