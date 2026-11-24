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

const byId = new Map(Object.values(users).map((u) => [u.id, u]));
const byEmail = new Map(Object.values(users).map((u) => [u.email, u]));
const sessions = new Map(); // access_token -> user key

function tokenFor(user, suffix = '') {
  return `mock-${user.username}-${suffix || 'access'}`;
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
    const wantedId = params.get('user_id')?.replace(/^eq\./, '');
    const wantedName = params.get('username')?.replace(/^eq\./, '');
    if (wantedId && !user) return [];
    return rows.filter((r) => (!wantedId || r.user_id === wantedId) && (!wantedName || r.username === wantedName));
  }
  if (!user) return [];
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
      await readBody(req);
      const current = user || users.alice;
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
