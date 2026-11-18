'use client';

/**
 * Мост между cookie-сессией Supabase (новая система входа) и legacy-слоем
 * `lib/sync.ts`, который исторически читал access_token из localStorage.
 *
 * Зачем мост, а не полный переезд: на legacy-слой завязаны списки/история,
 * достижения, DM и SyncSection (и они же работают у гостей). Новый вход хранит
 * сессию в cookies (@supabase/ssr) — без зеркалирования человек, вошедший через
 * /auth, выглядел бы «гостем» для старых виджетов: рассинхрон состояний в одном UI.
 *
 * Важно: токены НЕ дублируются в localStorage. Они живут в памяти таба
 * (`setMirroredSession`), а на диск не попадают — localStorage читается любым
 * XSS, а cookie-сессию SDK восстанавливает сам при загрузке страницы.
 */

import { clearToken, getMirroredSession, getToken, setMirroredSession, type MirrorableSession } from '@/lib/sync';

const LS_COMPAT_KEYS = ['anistream:supa_token', 'anistream:supa_refresh', 'anistream:supa_expires', 'anistream:supa_verifier'];

/** Легаси-ключи, оставшиеся от старой модалки входа: секретов на диске быть не должно. */
function dropLegacyTokenCopies(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of LS_COMPAT_KEYS) localStorage.removeItem(key);
  } catch {
    /* приватный режим/квота */
  }
}

/** Переносит токены cookie-сессии в legacy-слой (в память, idempotent, безопасен при null). */
export function mirrorSessionToLegacy(session: MirrorableSession | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (!session?.access_token) {
    clearLegacySession();
    return;
  }
  setMirroredSession(session);
  dropLegacyTokenCopies();
}

/** Выход: чистим и память, и возможные старые копии на диске. */
export function clearLegacySession(): void {
  if (typeof window === 'undefined') return;
  clearToken();
  dropLegacyTokenCopies();
}

/**
 * Обратный мост: легаси-вход (модалка → lib/sync.ts) держит токены в localStorage,
 * но новый кабинет и proxy читают cookie-сессию. Здесь мы «переселяем» их в SDK,
 * чтобы человек, вошедший через модалку, сразу попадал в /profile без второго входа,
 * а на диске после этого ничего не остаётся.
 */
export async function adoptLegacySessionIntoCookieStore(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const mirrored = getMirroredSession();
    const access_token = mirrored?.access_token ?? readLegacy('anistream:supa_token');
    const refresh_token = mirrored?.refresh_token ?? readLegacy('anistream:supa_refresh') ?? undefined;
    if (!access_token) return false;
    const { getBrowserSupabase } = await import('@/lib/supabase/browser');
    const supabase = getBrowserSupabase();
    if (!supabase) return false;
    const { error } = await supabase.auth.setSession({ access_token, refresh_token: refresh_token ?? '' });
    if (!error) dropLegacyTokenCopies();
    return !error;
  } catch {
    return false;
  }
}

function readLegacy(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** true, если legacy-слой видит живую сессию (память или старые ключи). */
export function legacySessionActive(): boolean {
  return Boolean(getToken());
}
