'use client';

/**
 * Синхронизация профиля через Supabase Auth (email+password, REST без SDK) — ТЗ 2.2.
 * Локальные списки/история мержатся с таблицами profile_lists/profile_history.
 *
 * Токены в localStorage (задача refresh_token):
 *   anistream:supa_token   → access_token  (как раньше — обратная совместимость)
 *   anistream:supa_refresh → refresh_token (новое)
 *   anistream:supa_expires → timestamp (мс) истечения access_token (новое)
 *
 * rest()/whoami() автоматически обновляют access_token:
 *   • превентивно — если до истечения меньше 60 секунд;
 *   • реактивно — на 401: один refresh + повтор запроса.
 * Если refresh не удался — токены очищаются и бросается SessionExpiredError
 * («сессия кончилась, надо перелогиниться»).
 */
import type { HistoryEntry } from './types';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
// Поддержка обоих имён anon-ключа (Supabase в новых проектах выдаёт ..._URL_ANON_KEY)
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_URL_ANON_KEY ?? '';

const LS_TOKEN = 'anistream:supa_token';
const LS_REFRESH = 'anistream:supa_refresh';
const LS_EXPIRES = 'anistream:supa_expires';

/** Ошибка истёкшей сессии — UI показывает «Сессия истекла, войдите заново» и сбрасывает logged. */
export class SessionExpiredError extends Error {
  constructor(message = 'session expired') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export const syncConfigured = () => Boolean(SUPA_URL && SUPA_KEY);

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return lsGet(LS_TOKEN);
}

/**
 * true — если в localStorage есть валидный (не просроченный) access_token.
 * Без ключа expires (старая сессия до миграции) считаем валидным — 401 добьёт refresh.
 */
export function isSessionValid(): boolean {
  const token = lsGet(LS_TOKEN);
  if (!token) return false;
  const exp = Number(lsGet(LS_EXPIRES) ?? 0);
  if (!exp) return true;
  return Date.now() < exp;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number; // секунды
  user?: { id?: string };
}

/** Сохраняет полную тройку токенов из ответа Supabase auth. */
function saveTokens(j: TokenResponse) {
  try {
    localStorage.setItem(LS_TOKEN, j.access_token);
    if (j.refresh_token) localStorage.setItem(LS_REFRESH, j.refresh_token);
    if (typeof j.expires_in === 'number') localStorage.setItem(LS_EXPIRES, String(Date.now() + j.expires_in * 1000));
  } catch {
    /* приватный режим браузера — токены не сохранятся */
  }
}

/** Совместимость со старым кодом: пишет только access_token. */
export function saveToken(token: string) {
  try {
    localStorage.setItem(LS_TOKEN, token);
  } catch {
    /* ignore */
  }
}

/** Логаут: удаляет ВСЕ три ключа. */
export function clearToken() {
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_REFRESH);
    localStorage.removeItem(LS_EXPIRES);
  } catch {
    /* ignore */
  }
}

/**
 * Обмен refresh_token на новую пару токенов
 * (POST /auth/v1/token?grant_type=refresh_token, заголовок apikey).
 * Успех — обновляет все три ключа и возвращает новый access_token.
 * Ошибка (400/401/сеть) — очищает токены и возвращает null.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refresh = lsGet(LS_REFRESH);
  if (!refresh) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!r.ok) {
      clearToken();
      return null;
    }
    const j = (await r.json()) as TokenResponse;
    if (!j?.access_token) {
      clearToken();
      return null;
    }
    saveTokens(j);
    return j.access_token;
  } catch {
    return null;
  }
}

async function auth(path: string, body: Record<string, unknown>): Promise<TokenResponse> {
  const r = await fetch(`${SUPA_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as TokenResponse & { error?: string; error_description?: string; msg?: string };
  if (!r.ok) throw new Error(j.error_description ?? j.msg ?? j.error ?? 'auth error');
  // Ключевая правка: сохраняем ОБА токена + срок жизни (раньше refresh_token терялся)
  if (j.access_token) saveTokens(j);
  return j;
}

export const signUp = (email: string, password: string) => auth('signup', { email, password });
export const signIn = (email: string, password: string) => auth('token?grant_type=password', { email, password });

/** Гарантирует живой access_token: превентивный refresh, если до истечения < 60 с. */
async function ensureFresh(): Promise<string> {
  let token = getToken();
  const exp = Number(lsGet(LS_EXPIRES) ?? 0);
  if (token && exp && Date.now() > exp - 60_000) {
    token = await refreshAccessToken();
    if (!token) throw new SessionExpiredError();
  }
  if (!token) throw new SessionExpiredError();
  return token;
}

/** REST-запрос к Supabase: pre-check истечения + один refresh-and-retry на 401. */
async function rest(method: string, path: string, rows?: unknown): Promise<Response> {
  const send = (token: string) =>
    fetch(`${SUPA_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: rows ? JSON.stringify(rows) : undefined,
    });

  let r = await send(await ensureFresh());
  if (r.status === 401) {
    const fresh = await refreshAccessToken();
    if (!fresh) throw new SessionExpiredError();
    r = await send(fresh);
    if (r.status === 401) throw new SessionExpiredError();
  }
  if (!r.ok) throw new Error(`${path.split('?')[0]}: HTTP ${r.status}`);
  return r;
}

/** id текущего пользователя (/auth/v1/user) с refresh+retry на 401. */
async function whoami(): Promise<string> {
  const call = (token: string) =>
    fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` } });

  let r = await call(await ensureFresh());
  if (r.status === 401) {
    const fresh = await refreshAccessToken();
    if (!fresh) throw new SessionExpiredError();
    r = await call(fresh);
    if (r.status === 401) throw new SessionExpiredError();
  }
  if (!r.ok) throw new Error(`whoami: HTTP ${r.status}`);
  const j = (await r.json()) as { id?: string };
  if (!j.id) throw new Error('whoami: no id');
  return j.id;
}

/** Сколько записей истории максимум льём в облако (в localStorage хранится 60). */
const HISTORY_CLOUD_LIMIT = 50;

/**
 * Push локальных списков/истории в облако.
 * Upsert через Prefer: resolution=merge-duplicates — PK в схеме есть:
 * profile_lists(user_id, slug), profile_history(user_id, slug, episode).
 * Строки истории приводятся к колонкам таблицы (updated_at ← updatedAt)
 * и берутся самые свежие HISTORY_CLOUD_LIMIT штук.
 * Возвращает число отправленных строк (для тоста «Сохранено N записей»).
 */
export async function pushLocal(lists: Record<string, string>, history: HistoryEntry[]): Promise<number> {
  const userId = await whoami();
  const listRows = Object.entries(lists).map(([slug, status]) => ({ user_id: userId, slug, status }));
  // history в library лежит newest-first — берём первые (самые свежие) 50
  const histRows = history.slice(0, HISTORY_CLOUD_LIMIT).map((h) => ({
    user_id: userId,
    slug: h.slug,
    episode: h.episode,
    position: h.position,
    duration: h.duration,
    updated_at: new Date(h.updatedAt).toISOString(),
  }));

  let saved = 0;
  if (listRows.length) {
    await rest('POST', 'profile_lists', listRows);
    saved += listRows.length;
  }
  if (histRows.length) {
    await rest('POST', 'profile_history', histRows);
    saved += histRows.length;
  }
  return saved;
}

/**
 * Pull облачных списков/истории. Явный фильтр user_id=eq.<me> (страховка
 * поверх RLS), история — newest-first. Возвращает данные + общее число строк.
 */
export async function pullRemote(): Promise<{ lists: Record<string, string>; history: HistoryEntry[]; count: number }> {
  const userId = await whoami();
  const uid = encodeURIComponent(userId);
  const [listsRes, historyRes] = await Promise.all([
    rest('GET', `profile_lists?user_id=eq.${uid}&select=slug,status,updated_at`),
    rest('GET', `profile_history?user_id=eq.${uid}&select=slug,episode,position,duration,updated_at&order=updated_at.desc`),
  ]);
  const listRows = (await listsRes.json()) as { slug: string; status: string }[];
  const histRows = (await historyRes.json()) as {
    slug: string;
    episode: number;
    position: number;
    duration: number;
    updated_at: string;
  }[];

  const history: HistoryEntry[] = histRows.map((h) => ({
    slug: h.slug,
    episode: h.episode,
    position: h.position ?? 0,
    duration: h.duration ?? 0,
    updatedAt: Date.parse(h.updated_at) || Date.now(),
  }));

  return {
    lists: Object.fromEntries(listRows.map((x) => [x.slug, x.status])),
    history,
    count: listRows.length + histRows.length,
  };
}
