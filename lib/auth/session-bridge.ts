'use client';

/**
 * Мост между cookie-сессией Supabase (новая система входа) и legacy-слоем
 * `lib/sync.ts`, который читает access_token из localStorage.
 *
 * Зачем мост, а не полный переезд: на localStorage завязаны списки/история,
 * достижения и SyncSection (и они же работают у гостей). Новый вход хранит сессию
 * в cookies (@supabase/ssr) — без зеркалирования человек, вошедший через /auth,
 * выглядел бы «гостем» для старых виджетов: рассинхрон состояний в одном UI.
 *
 * Здесь же — обратная операция при выходе: чистим оба хранилища.
 */

const LS_TOKEN = 'anistream:supa_token';
const LS_REFRESH = 'anistream:supa_refresh';
const LS_EXPIRES = 'anistream:supa_expires';
const LS_VERIFIER = 'anistream:supa_verifier';

export interface MirrorableSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number | null;
  expires_in?: number;
}

/** Переносит токены cookie-сессии в legacy-ключи (idempotent, безопасен при null). */
export function mirrorSessionToLegacy(session: MirrorableSession | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (!session?.access_token) {
      clearLegacySession();
      return;
    }
    localStorage.setItem(LS_TOKEN, session.access_token);
    if (session.refresh_token) localStorage.setItem(LS_REFRESH, session.refresh_token);
    const expiresAt = session.expires_at
      ? session.expires_at * 1000
      : typeof session.expires_in === 'number'
        ? Date.now() + session.expires_in * 1000
        : null;
    if (expiresAt) localStorage.setItem(LS_EXPIRES, String(expiresAt));
    localStorage.removeItem(LS_VERIFIER);
  } catch {
    /* приватный режим/квота: cookie-сессия всё равно работает */
  }
}

export function clearLegacySession(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of [LS_TOKEN, LS_REFRESH, LS_EXPIRES, LS_VERIFIER]) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Обратный мост: легаси-вход (lib/sync.ts) хранит токены в localStorage, но новый
 * кабинет и proxy читают cookie-сессию. Здесь мы «переселяем» токены в SDK, чтобы
 * человек, вошедший через модалку, сразу попадал в /profile без второго входа.
 */
export async function adoptLegacySessionIntoCookieStore(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const access_token = localStorage.getItem(LS_TOKEN);
    const refresh_token = localStorage.getItem(LS_REFRESH) ?? undefined;
    if (!access_token) return false;
    const { getBrowserSupabase } = await import('@/lib/supabase/browser');
    const supabase = getBrowserSupabase();
    if (!supabase) return false;
    const { error } = await supabase.auth.setSession({ access_token, refresh_token: refresh_token ?? '' });
    return !error;
  } catch {
    return false;
  }
}
