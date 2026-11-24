/* B2-C test-only mock Supabase. Не production-код: запускается только
   playwright.auth.config.ts на 127.0.0.1:54321. Никаких реальных ключей. */
import http from 'node:http';

const PORT = Number(process.env.MOCK_SUPABASE_PORT || 54321);
const ORIGIN = process.env.MOCK_APP_ORIGIN || 'http://127.0.0.1:3202';
const PASSWORD = 'password123';
const ACH = ['first_episode', 'first_hour'];

const users = {
  alice: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alice@example.com',
    created_at: '2024-01-15T10:00:00.000Z',
    username: 'alice',
    bio: 'Смотрю сёнены и веду списки каждый сезон.',
    banner: 'grad:0',
    pinned: ACH,
    lists: [
      { slug: 'one-piece', status: 'watching', updated_at: '2026-01-20T10:00:00.000Z' },
      { slug: 'death-note', status: 'completed', updated_at: '2026-01-18T10:00:00.000Z' },
    ],
    history: [
      { slug: 'one-piece', episode: 3, position: 720, duration: 1440, updated_at: '2026-01-21T10:00:00.000Z' },
      { slug: 'death-note', episode: 1, position: 300, duration: 1380, updated_at: '2026-01-19T10:00:00.000Z' },
    ],
    followers: 12,
    following: 7,
  },
  bob: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'bob@example.com',
    created_at: '2025-06-01T10:00:00.000Z',
    username: 'bob',
    bio: 'Только законченные истории. Без спойлеров.',
    banner: 'grad:1',
    pinned: ['first_episode'],
    lists: [{ slug: 'shingeki-no-kyojin', status: 'completed', updated_at: '2026-01-10T10:00:00.000Z' }],
    history: [{ slug: 'shingeki-no-kyojin', episode: 25, position: 1400, duration: 1440, updated_at: '2026-01-11T10:00:00.000Z' }],
    followers: 1,
    following: 2,
  },
};

users.carol = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  email: 'carol@example.com',
  created_at: '2025-09-01T10:00:00.000Z',
  username: 'carol',
  bio: 'Тестовый третий участник для проверки RLS личных сообщений.',
  banner: 'grad:2',
  pinned: [],
  lists: [],
  history: [],
  followers: 0,
  following: 0,
};

const byId = new Map(Object.values(users).map((u) => [u.id, u]));
const byEmail = new Map(Object.values(users).map((u) => [u.email, u]));
const sessions = new Map(); // access_token -> user key

/* B2-D: только тестовые диалоги. Это не production-данные и не реальные люди. */
const DM_THREAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const dmThreads = [
  {
    id: DM_THREAD_ID,
    user_a: users.alice.id,
    user_b: users.bob.id,
    updated_at: '2026-01-22T12:05:00.000Z',
    created_at: '2026-01-20T09:00:00.000Z',
  },
];
const dmMessages = [
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', thread_id: DM_THREAD_ID, sender_id: users.alice.id, text: 'Привет! Это тестовый диалог B2-D.', ts: '2026-01-22T12:00:00.000Z', read_at: '2026-01-22T12:01:00.000Z' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', thread_id: DM_THREAD_ID, sender_id: users.bob.id, text: 'Привет, вижу сообщение. Проверяем список и отправку.', ts: '2026-01-22T12:05:00.000Z', read_at: null },
];

const initialDmThreads = structuredClone(dmThreads);
const initialDmMessages = structuredClone(dmMessages);

function resetDmFixtures() {
  dmThreads.splice(0, dmThreads.length, ...structuredClone(initialDmThreads));
  dmMessages.splice(0, dmMessages.length, ...structuredClone(initialDmMessages));
}

function isParticipant(thread, user) {
  return Boolean(user && thread && (thread.user_a === user.id || thread.user_b === user.id));
}

function quotedList(value) {
  const inner = value.replace(/^in\.\(/, '').replace(/\)$/, '');
  return [...inner.matchAll(/(?:"([^"]+)"|([^,]+))/g)].map((m) => m[1] || m[2]).filter(Boolean);
}

function eqFilter(params, key) {
  return params.get(key)?.replace(/^eq\./, '') ?? null;
}

function filterDmThreads(rows, params, user) {
  let result = rows.filter((t) => isParticipant(t, user));
  const id = eqFilter(params, 'id');
  if (id) result = result.filter((t) => t.id === id);
  const a = eqFilter(params, 'user_a');
  const b = eqFilter(params, 'user_b');
  if (a) result = result.filter((t) => t.user_a === a);
  if (b) result = result.filter((t) => t.user_b === b);
  const or = params.get('or');
  if (or) {
    const allowed = [...or.matchAll(/(?:user_a|user_b)\.eq\.([0-9a-f-]+)/gi)].map((m) => m[1]);
    if (allowed.length) result = result.filter((t) => allowed.includes(t.user_a) || allowed.includes(t.user_b));
  }
  const order = params.get('order');
  if (order === 'updated_at.desc') result = [...result].sort((x, y) => y.updated_at.localeCompare(x.updated_at));
  return result;
}

function filterDmMessages(rows, params, user) {
  let result = rows.filter((m) => {
    const thread = dmThreads.find((t) => t.id === m.thread_id);
    return isParticipant(thread, user);
  });
  const rawThread = params.get('thread_id');
  const threadEq = rawThread?.startsWith('eq.') ? rawThread.slice(3) : null;
  const threadIn = rawThread?.startsWith('in.') ? quotedList(rawThread) : null;
  if (threadEq) result = result.filter((m) => m.thread_id === threadEq);
  if (threadIn) result = result.filter((m) => threadIn.includes(m.thread_id));
  const senderEq = eqFilter(params, 'sender_id');
  if (senderEq) result = result.filter((m) => m.sender_id === senderEq);
  if (params.get('sender_id')?.startsWith('neq.')) {
    const senderNeq = params.get('sender_id').slice(4);
    result = result.filter((m) => m.sender_id !== senderNeq);
  }
  if (params.get('read_at') === 'is.null') result = result.filter((m) => m.read_at == null);
  const order = params.get('order');
  if (order === 'ts.desc') result = [...result].sort((x, y) => y.ts.localeCompare(x.ts));
  else if (order === 'ts.asc') result = [...result].sort((x, y) => x.ts.localeCompare(y.ts));
  const limit = Number(params.get('limit') || 0);
  if (limit > 0) result = result.slice(0, limit);
  return result;
}

function tokenFor(user, suffix = '') {
  /* JWT-форма важна: клиент и lib/library читают sub из payload, чтобы
     разделять локальные данные аккаунтов. Подпись mock не проверяет. */
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: suffix || 'access',
    }),
  ).toString('base64url');
  return `${header}.${payload}.mock-signature`;
}

function authUser(user) {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: user.created_at,
    phone: '',
    confirmed_at: user.created_at,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { username: user.username },
    identities: [{ id: user.id, user_id: user.id, identity_id: user.id, provider: 'email', identity_data: { email: user.email, sub: user.id } }],
    created_at: user.created_at,
    updated_at: new Date().toISOString(),
  };
}

function sessionFor(user, suffix = '') {
  const access = tokenFor(user, suffix);
  sessions.set(access, user);
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${user.username}`,
    user: authUser(user),
  };
}

function profileRow(user) {
  return {
    user_id: user.id,
    username: user.username,
    avatar_url: null,
    banner_url: user.banner,
    bio: user.bio,
    pinned_achievements: user.pinned,
    updated_at: '2026-01-21T10:00:00.000Z',
  };
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS,HEAD');
  res.setHeader('access-control-allow-headers', 'authorization,apikey,content-type,prefer,x-client-info,x-supabase-api-version,accept,range');
  res.setHeader('access-control-expose-headers', 'content-range,content-profile');
  res.setHeader('access-control-max-age', '600');
}

function json(res, status, body, headers = {}) {
  cors(res);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function tokenFrom(req) {
  const h = String(req.headers.authorization || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || '';
}

function userFrom(req) {
  const token = tokenFrom(req);
  if (sessions.has(token)) return sessions.get(token);
  for (const user of Object.values(users)) {
    if (token === `mock-${user.username}-access` || token === `mock-${user.username}-pkce`) return user;
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}

function countFor(table, params) {
  if (table !== 'follows') return 0;
  const followingId = params.get('following_id')?.replace(/^eq\./, '');
  const followerId = params.get('follower_id')?.replace(/^eq\./, '');
  if (followingId) return byId.get(followingId)?.followers ?? 0;
  if (followerId) return byId.get(followerId)?.following ?? 0;
  return 0;
}

function restRows(path, params, user) {
  if (path === 'profiles') {
    const rows = Object.values(users).map(profileRow);
    const rawId = params.get('user_id');
    const wantedIds = rawId?.startsWith('in.') ? quotedList(rawId) : rawId ? [rawId.replace(/^eq\./, '')] : [];
    const wantedName = params.get('username')?.replace(/^eq\./, '');

    if (wantedIds.length && !user) return [];
    return rows.filter(
      (r) =>
        (!wantedIds.length || wantedIds.includes(r.user_id)) &&
        (!wantedName || r.username === wantedName),
    );
  }
  if (!user) return [];
  if (path === 'dm_threads') return filterDmThreads(dmThreads, params, user);
  if (path === 'dm_messages') return filterDmMessages(dmMessages, params, user);
  if (path === 'profile_lists') {
    const wanted = params.get('user_id')?.replace(/^eq\./, '');
    return !wanted || wanted === user.id ? user.lists : [];
  }
  if (path === 'profile_history') {
    const wanted = params.get('user_id')?.replace(/^eq\./, '');
    return !wanted || wanted === user.id ? user.history : [];
  }
  if (path === 'follows') return [];
  return [];
}

async function handle(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const path = url.pathname;
  const params = url.searchParams;

  if (path === '/health') return json(res, 200, { ok: true });
  if (path === '/__test/reset' && req.method === 'POST') {
    resetDmFixtures();
    return json(res, 200, { ok: true });
  }

  if (path === '/auth/v1/token') {
    const grant = params.get('grant_type');
    const body = await readBody(req);
    if (grant === 'password') {
      const user = byEmail.get(String(body.email || '').toLowerCase());
      if (!user || body.password !== PASSWORD) {
        return json(res, 400, {
          code: 'invalid_credentials',
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
          msg: 'Invalid login credentials',
        });
      }
      const delay = user.email.startsWith('slow') ? 1200 : 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return json(res, 200, sessionFor(user));
    }
    if (grant === 'pkce') {
      const user = users.alice;
      return json(res, 200, sessionFor(user, 'pkce'));
    }
    if (grant === 'refresh_token') {
      const user = users.alice;
      return json(res, 200, sessionFor(user));
    }
    return json(res, 400, { error: 'unsupported_grant_type', error_description: 'Unsupported grant type' });
  }

  if (path === '/auth/v1/signup') {
    const body = await readBody(req);
    const email = String(body.email || '').toLowerCase();
    if (byEmail.has(email)) {
      return json(res, 200, { ...authUser(byEmail.get(email)), identities: [] });
    }
    return json(res, 200, {
      id: '33333333-3333-4333-8333-333333333333',
      aud: 'authenticated',
      role: 'authenticated',
      email,
      email_confirmed_at: null,
      confirmed_at: null,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { username: String(body.data?.username || '') },
      identities: [{ id: 'new', user_id: '33333333-3333-4333-8333-333333333333', provider: 'email' }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  if (path === '/auth/v1/user') {
    const user = userFrom(req);
    if (!user) return json(res, 401, { message: 'invalid JWT' });
    return json(res, 200, authUser(user));
  }

  if (path === '/auth/v1/logout') {
    const token = tokenFrom(req);
    sessions.delete(token);
    res.writeHead(204);
    res.end();
    return;
  }

  if (path === '/auth/v1/authorize') {
    const redirectTo = params.get('redirect_to') || `${ORIGIN}/auth/callback`;
    const target = new URL(redirectTo);
    target.searchParams.set('code', 'mock-oauth-code');
    cors(res);
    res.writeHead(302, { location: target.toString() });
    res.end();
    return;
  }

  if (path.startsWith('/storage/v1/object/avatars/')) {
    cors(res);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ Key: path.replace('/storage/v1/object/', '') }));
    return;
  }

  if (path.startsWith('/storage/v1/object/public/')) {
    cors(res);
    res.writeHead(404);
    res.end();
    return;
  }

  if (path.startsWith('/rest/v1/')) {
    const table = path.slice('/rest/v1/'.length);
    const user = userFrom(req);

    if (req.method === 'GET' || req.method === 'HEAD') {
      const rows = restRows(table, params, user);
      const isCount = String(req.headers.prefer || '').includes('count=exact');
      const wantObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
      const total = isCount ? countFor(table, params) : rows.length;
      const contentRange = total ? `0-${total - 1}/${total}` : '*/0';
      const headers = { 'content-range': contentRange };
      if (req.method === 'HEAD') {
        cors(res);
        res.writeHead(200, headers);
        res.end();
        return;
      }
      if (wantObject) {
        if (!rows.length) {
          return json(res, 406, {
            code: 'PGRST116',
            details: 'The result contains 0 rows',
            hint: null,
            message: 'JSON object requested, multiple (or no) rows returned',
          });
        }
        return json(res, 200, rows[0], headers);
      }
      return json(res, 200, rows, headers);
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = await readBody(req);
      const current = user;
      if (!current) return json(res, 401, { message: 'JWT required' });

      if (table === 'dm_threads' && req.method === 'POST') {
        const a = String(body.user_a || '');
        const b = String(body.user_b || '');
        if (![a, b].includes(current.id) || !byId.has(a) || !byId.has(b) || a === b) {
          return json(res, 400, { message: 'invalid participants' });
        }
        const existing = dmThreads.find((t) => (t.user_a === a && t.user_b === b) || (t.user_a === b && t.user_b === a));
        if (existing) return json(res, 200, [existing]);
        const now = new Date().toISOString();
        const row = { id: crypto.randomUUID(), user_a: a, user_b: b, updated_at: now, created_at: now };
        dmThreads.push(row);
        return json(res, 201, [row], { 'content-range': '0-0/1' });
      }

      if (table === 'dm_messages' && req.method === 'POST') {
        const thread = dmThreads.find((t) => t.id === body.thread_id);
        if (!isParticipant(thread, current)) return json(res, 403, { message: 'not a participant' });
        const text = String(body.text || '').trim().slice(0, 2000);
        if (!text) return json(res, 400, { message: 'text required' });
        const row = { id: crypto.randomUUID(), thread_id: thread.id, sender_id: current.id, text, ts: new Date().toISOString(), read_at: null };
        dmMessages.push(row);
        return json(res, 201, [row], { 'content-range': '0-0/1' });
      }

      if (table === 'dm_threads' && req.method === 'PATCH') {
        const wanted = eqFilter(params, 'id');
        const thread = dmThreads.find((t) => t.id === wanted);
        if (!isParticipant(thread, current)) return json(res, 403, { message: 'not a participant' });
        if (body.updated_at) thread.updated_at = String(body.updated_at);
        return json(res, 200, [thread]);
      }

      if (table === 'dm_messages' && req.method === 'PATCH') {
        const thread = dmThreads.find((t) => t.id === eqFilter(params, 'thread_id'));
        if (!isParticipant(thread, current)) return json(res, 403, { message: 'not a participant' });
        const rows = filterDmMessages(dmMessages, params, current);
        for (const m of rows) m.read_at = String(body.read_at || new Date().toISOString());
        return json(res, 200, rows);
      }

      const row = profileRow(current);
      return json(res, 201, row, { 'content-range': '0-0/1' });
    }
    return json(res, 200, []);
  }

  return json(res, 404, { error: 'not_found', path });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    json(res, 500, { error: 'mock_failure', message: String(err?.message || err) });
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`mock-supabase listening on http://127.0.0.1:${PORT}`));
