/**
 * Приёмка lib/sync.ts (задача refresh_token): in-process мок Supabase —
 * auth (grant_type=password / refresh_token / signup), /auth/v1/user и REST
 * profile_lists/profile_history с симуляцией RLS (строки видны/пишутся только
 * для своего user_id) и upsert по PK.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

let server: Server;
let baseUrl = '';
let refreshCalls = 0;

const users = new Map<string, string>(); // email → uid
const access = new Map<string, { uid: string; exp: number }>(); // access_token → сессия
const refreshOk = new Set<string>(); // валидные refresh_token
const listsDb = new Map<string, Record<string, unknown>>(); // `${uid}:${slug}` → row
const histDb = new Map<string, Record<string, unknown>>(); // `${uid}:${slug}:${ep}` → row

function issue(uid: string) {
  const rnd = Math.random().toString(36).slice(2, 10);
  const at = `AT-${uid}-${rnd}`;
  const rt = `RT-${uid}-${rnd}`;
  access.set(at, { uid, exp: Date.now() + 3600_000 });
  refreshOk.add(rt);
  return { access_token: at, refresh_token: rt, expires_in: 3600, user: { id: uid } };
}

function uidOf(req: IncomingMessage): string | null {
  const tok = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const s = access.get(tok);
  return s && s.exp > Date.now() ? s.uid : null;
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += String(c)));
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function json(res: ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const p = url.pathname;

  if (p === '/auth/v1/token' && req.method === 'POST') {
    const body = await readBody(req);
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const email = String(body.email ?? '');
      if (!email) return json(res, 400, { error: 'invalid_request' });
      let uid = users.get(email);
      if (!uid) {
        uid = `u${users.size}`;
        users.set(email, uid);
      }
      return json(res, 200, issue(uid));
    }
    if (grant === 'refresh_token') {
      refreshCalls++;
      const rt = String(body.refresh_token ?? '');
      if (!refreshOk.has(rt)) return json(res, 400, { error: 'invalid_grant' });
      refreshOk.delete(rt); // ротация, как в Supabase
      const uid = rt.split('-')[1];
      return json(res, 200, issue(uid));
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }

  if (p === '/auth/v1/signup' && req.method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email ?? '');
    let uid = users.get(email);
    if (!uid) {
      uid = `u${users.size}`;
      users.set(email, uid);
    }
    return json(res, 200, issue(uid));
  }

  if (p === '/auth/v1/user') {
    const uid = uidOf(req);
    if (!uid) return json(res, 401, { msg: 'invalid token' });
    return json(res, 200, { id: uid, email: 'x@y.z' });
  }

  if (p === '/rest/v1/profile_lists' || p === '/rest/v1/profile_history') {
    const uid = uidOf(req);
    if (!uid) return json(res, 401, { code: '401', message: 'JWT expired / invalid' });
    const isHist = p.endsWith('profile_history');
    const db = isHist ? histDb : listsDb;

    if (req.method === 'GET') {
      // RLS: только свои строки; явный фильтр user_id=eq.X тоже соблюдаем
      const filter = url.searchParams.get('user_id');
      let rows = [...db.values()].filter((r) => r.user_id === uid);
      if (filter && filter.startsWith('eq.')) rows = rows.filter((r) => r.user_id === filter.slice(3));
      return json(res, 200, rows);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const rowsIn = Array.isArray(body) ? body : [body];
      const saved: unknown[] = [];
      for (const row of rowsIn as Record<string, unknown>[]) {
        if (row.user_id !== uid) return json(res, 403, { code: '403', message: 'RLS with_check violation' });
        const key = isHist ? `${row.user_id}:${row.slug}:${row.episode}` : `${row.user_id}:${row.slug}`;
        db.set(key, { ...row }); // upsert по PK (merge-duplicates)
        saved.push(db.get(key));
      }
      return json(res, 201, saved); // Prefer: return=representation
    }
  }

  return json(res, 404, { error: 'not found' });
}

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

let sync: typeof import('../lib/sync');

beforeAll(async () => {
  server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('mock: no address');
  baseUrl = `http://127.0.0.1:${addr.port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = baseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  sync = await import('../lib/sync'); // env читается на уровне модуля — импорт ПОСЛЕ listen
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  localStorage.clear();
  refreshCalls = 0;
});

const LS_TOKEN = 'anistream:supa_token';
const LS_REFRESH = 'anistream:supa_refresh';
const LS_EXPIRES = 'anistream:supa_expires';

/** История newest-first — как её хранит library.saveProgress (unshift + cap 60). */
const mkHistory = (n: number, prefix = 'h') =>
  Array.from({ length: n }, (_, i) => ({
    slug: `${prefix}${String(i).padStart(2, '0')}`,
    episode: 1,
    position: 30 + i,
    duration: 1500,
    updatedAt: Date.now() - i * 1000,
  }));

describe('refresh_token: приёмка lib/sync.ts', () => {
  it('логин сохраняет все три ключа (token, refresh, expires)', async () => {
    await sync.signIn('a@mail.ru', 'pass1234');
    expect(localStorage.getItem(LS_TOKEN)).toMatch(/^AT-/);
    expect(localStorage.getItem(LS_REFRESH)).toMatch(/^RT-/);
    const exp = Number(localStorage.getItem(LS_EXPIRES));
    expect(exp).toBeGreaterThan(Date.now() + 3_500_000);
    expect(exp).toBeLessThan(Date.now() + 3_601_000);
    expect(sync.isSessionValid()).toBe(true);
  });

  it('signUp тоже сохраняет refresh_token и expires', async () => {
    await sync.signUp('j@mail.ru', 'pass1234');
    expect(localStorage.getItem(LS_REFRESH)).toMatch(/^RT-/);
    expect(Number(localStorage.getItem(LS_EXPIRES))).toBeGreaterThan(Date.now());
    expect(sync.isSessionValid()).toBe(true);
  });

  it('pushLocal: 3 истории + 2 списка → строки со своим user_id и колонкой updated_at', async () => {
    await sync.signIn('b@mail.ru', 'pass1234');
    const n = await sync.pushLocal({ 'sousou-no-frieren': 'watching', 'one-piece': 'planned' }, mkHistory(3));
    expect(n).toBe(5);
    const uid = users.get('b@mail.ru')!;
    const own = [...histDb.values()].filter((r) => r.user_id === uid);
    expect(own).toHaveLength(3);
    for (const row of own) {
      expect(row.updated_at).toBeTypeOf('string'); // snake_case, как колонка таблицы
      expect(row.updatedAt).toBeUndefined(); // старый баг: camelCase ломал POST
    }
    expect([...listsDb.values()].filter((r) => r.user_id === uid)).toHaveLength(2);
  });

  it('повторный push не плодит строки (upsert по PK)', async () => {
    await sync.signIn('c@mail.ru', 'pass1234');
    await sync.pushLocal({ x: 'watching' }, mkHistory(3, 'c'));
    await sync.pushLocal({ x: 'watching' }, mkHistory(3, 'c'));
    const uid = users.get('c@mail.ru')!;
    expect([...histDb.values()].filter((r) => r.user_id === uid)).toHaveLength(3);
    expect([...listsDb.values()].filter((r) => r.user_id === uid)).toHaveLength(1);
  });

  it('история > 50 → в облако уходят только 50 самых свежих', async () => {
    await sync.signIn('d@mail.ru', 'pass1234');
    const n = await sync.pushLocal({}, mkHistory(60, 'd'));
    expect(n).toBe(50);
    const uid = users.get('d@mail.ru')!;
    const own = [...histDb.values()].filter((r) => r.user_id === uid);
    expect(own).toHaveLength(50);
    const slugs = new Set(own.map((r) => r.slug));
    expect(slugs.has('d00')).toBe(true);
    expect(slugs.has('d49')).toBe(true);
    expect(slugs.has('d50')).toBe(false);
    expect(slugs.has('d59')).toBe(false);
  });

  it('pullRemote возвращает сохранённые строки (явный фильтр user_id)', async () => {
    await sync.signIn('e@mail.ru', 'pass1234');
    await sync.pushLocal({ 'sousou-no-frieren': 'watching' }, mkHistory(3, 'e'));
    const remote = await sync.pullRemote();
    expect(remote.lists).toEqual({ 'sousou-no-frieren': 'watching' });
    expect(remote.history).toHaveLength(3);
    expect(remote.count).toBe(4);
    for (const h of remote.history) {
      expect(h.updatedAt).toBeTypeOf('number'); // обратно в форму HistoryEntry
      expect(h.slug).toMatch(/^e\d{2}$/);
    }
  });

  it('expires в прошлом → авто-refresh, запрос проходит (POST grant_type=refresh_token)', async () => {
    await sync.signIn('f@mail.ru', 'pass1234');
    const oldAccess = localStorage.getItem(LS_TOKEN);
    const oldRefresh = localStorage.getItem(LS_REFRESH);
    localStorage.setItem(LS_EXPIRES, String(Date.now() - 1000)); // «просрочен»
    const n = await sync.pushLocal({}, mkHistory(1, 'f'));
    expect(n).toBe(1);
    expect(refreshCalls).toBe(1);
    expect(localStorage.getItem(LS_TOKEN)).not.toBe(oldAccess);
    expect(localStorage.getItem(LS_REFRESH)).not.toBe(oldRefresh); // ротация
    expect(sync.isSessionValid()).toBe(true);
  });

  it('мусорный refresh_token → ошибка session expired, все токены очищены', async () => {
    await sync.signIn('g@mail.ru', 'pass1234');
    localStorage.setItem(LS_REFRESH, 'garbage-refresh-token');
    localStorage.setItem(LS_EXPIRES, String(Date.now() - 1000));
    await expect(sync.pushLocal({}, mkHistory(1, 'g'))).rejects.toThrow(/session expired/i);
    expect(localStorage.getItem(LS_TOKEN)).toBeNull();
    expect(localStorage.getItem(LS_REFRESH)).toBeNull();
    expect(localStorage.getItem(LS_EXPIRES)).toBeNull();
    expect(sync.isSessionValid()).toBe(false);
  });

  it('401 от auth/user → один refresh + retry, без перелогина', async () => {
    await sync.signIn('h@mail.ru', 'pass1234');
    localStorage.setItem(LS_TOKEN, 'AT-bogus-invalid'); // access-токен испорчен, expires в будущем
    const n = await sync.pushLocal({ q: 'watching' }, mkHistory(1, 'h'));
    expect(n).toBe(2);
    expect(refreshCalls).toBe(1);
    expect(localStorage.getItem(LS_TOKEN)).toMatch(/^AT-/);
  });

  it('logout удаляет все три ключа', async () => {
    await sync.signIn('i@mail.ru', 'pass1234');
    expect(localStorage.getItem(LS_TOKEN)).toBeTruthy();
    sync.clearToken();
    expect(localStorage.getItem(LS_TOKEN)).toBeNull();
    expect(localStorage.getItem(LS_REFRESH)).toBeNull();
    expect(localStorage.getItem(LS_EXPIRES)).toBeNull();
    expect(sync.isSessionValid()).toBe(false);
  });
});
