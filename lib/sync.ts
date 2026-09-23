'use client';

/**
 * Синхронизация профиля через Supabase Auth (email+password, REST без SDK) — ТЗ 2.2.
 * Локальные списки/история мержатся с таблицами profile_lists/profile_history.
 */
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LS_TOKEN = 'anistream:supa_token';

export const syncConfigured = () => Boolean(SUPA_URL && SUPA_KEY);

export function getToken(): string | null {
  try {
    return localStorage.getItem(LS_TOKEN);
  } catch {
    return null;
  }
}

async function auth(path: string, body: Record<string, unknown>) {
  const r = await fetch(`${SUPA_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? j.msg ?? j.error ?? 'auth error');
  return j as { access_token: string };
}

export const signUp = (email: string, password: string) => auth('signup', { email, password });
export const signIn = (email: string, password: string) => auth('token?grant_type=password', { email, password });

export function saveToken(token: string) {
  localStorage.setItem(LS_TOKEN, token);
}

export function clearToken() {
  localStorage.removeItem(LS_TOKEN);
}

async function rest(method: string, table: string, rows?: unknown, query = '') {
  const token = getToken();
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: rows ? JSON.stringify(rows) : undefined,
  });
  if (!r.ok) throw new Error(`${table}: ${r.status}`);
  return r;
}

/** Push локальных списков/истории в облако (upsert по PK). */
export async function pushLocal(lists: Record<string, string>, history: unknown[]) {
  const userId = await whoami();
  if (!userId) throw new Error('no session');
  await rest('POST', 'profile_lists', Object.entries(lists).map(([slug, status]) => ({ user_id: userId, slug, status })));
  await rest(
    'POST',
    'profile_history',
    (history as { slug: string; episode: number; position: number; duration: number }[]).map((h) => ({ ...h, user_id: userId })),
  );
}

/** Pull облачных списков/истории и мерж в localStorage-стор. */
export async function pullRemote(): Promise<{ lists: Record<string, string>; history: unknown[] }> {
  const token = getToken();
  const [lists, history] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/profile_lists?select=slug,status`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    fetch(`${SUPA_URL}/rest/v1/profile_history?select=slug,episode,position,duration,updated_at`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` } }).then((r) => r.json()),
  ]);
  return {
    lists: Object.fromEntries((lists as { slug: string; status: string }[]).map((x) => [x.slug, x.status])),
    history: history as unknown[],
  };
}

async function whoami(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const j = (await r.json()) as { id?: string };
  return j.id ?? null;
}
