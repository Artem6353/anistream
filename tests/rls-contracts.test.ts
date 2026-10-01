import { describe, expect, it, beforeAll } from 'vitest';

/**
 * RLS-контракт-тесты (аудит 30.09, волна 2): write-путь политик Supabase.
 * ПРод-оракулы без записи живут в scripts/check-rls.mjs (CI: rls.yml, job prod-oracle);
 * здесь — полные контракты с мутациями, поэтому запускаются ТОЛЬКО против локального
 * стека `supabase start` (CI: job local-contracts), где ключи приходят из env:
 *   SUPA_TEST_URL / SUPA_TEST_ANON / SUPA_TEST_SERVICE.
 * Без SUPA_TEST_URL набор пропускается (чтобы `npm test` не падал локально).
 */
const URL = process.env.SUPA_TEST_URL ?? '';
const ANON = process.env.SUPA_TEST_ANON ?? '';
const SERVICE = process.env.SUPA_TEST_SERVICE ?? '';

const run = URL && ANON && SERVICE ? describe : describe.skip;

type Role = 'anon' | 'service' | string; // string = bearer-токен пользователя

function rest(role: Role, method: string, path: string, body?: unknown, prefer?: string) {
  const key = role === 'anon' ? ANON : role === 'service' ? SERVICE : ANON;
  const bearer = role === 'anon' || role === 'service' ? key : role;
  return fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const auth = (path: string, body: unknown) =>
  fetch(`${URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const DENIED = [401, 403];

run('RLS-контракты (локальный стек Supabase)', () => {
  let aliceTok = '';
  let bobTok = '';
  let aliceUid = '';
  let reviewId = '';
  const stamp = Date.now();

  beforeAll(async () => {
    const a = await auth('signup', { email: `alice-${stamp}@test.local`, password: 'passw0rd-123' });
    const aj = (await a.json()) as { access_token?: string; id?: string; user?: { id?: string } };
    aliceTok = aj.access_token ?? '';
    aliceUid = aj.id ?? aj.user?.id ?? '';
    const b = await auth('signup', { email: `bob-${stamp}@test.local`, password: 'passw0rd-123' });
    const bj = (await b.json()) as { access_token?: string };
    bobTok = bj.access_token ?? '';
    expect(aliceTok).toBeTruthy();
    expect(bobTok).toBeTruthy();
  });

  it('anon НЕ пишет реакции (010/012: insert только service_role)', async () => {
    const r = await rest('anon', 'POST', 'review_reactions', { review_id: '00000000-0000-0000-0000-000000000000', user_id: 'x', kind: 'like' });
    expect(DENIED).toContain(r.status);
  });

  it('anon НЕ пишет отзывы / подписки / обращения (service_role-only insert)', async () => {
    for (const [table, payload] of [
      ['reviews', { slug: 'x', name: 'x', text: 'x', ts: Date.now() }],
      ['push_subs', {}],
      ['dmca_requests', {}],
      ['source_reports', {}],
    ] as const) {
      const r = await rest('anon', 'POST', table, payload as unknown);
      expect(DENIED, table).toContain(r.status);
    }
  });

  it('service пишет отзыв; anon читает (публичная лента)', async () => {
    const ins = await rest('service', 'POST', 'reviews', { id: crypto.randomUUID(), slug: 'rls-contract', name: 'Alice', text: 'contract seed', ts: Date.now(), rating: 5, user_id: aliceUid }, 'return=representation');
    expect(ins.status).toBe(201);
    reviewId = ((await ins.json()) as Array<{ id: string }>)[0].id;
    const sel = await rest('anon', 'GET', `reviews?id=eq.${reviewId}&select=id,text`);
    expect(sel.status).toBe(200);
    expect(((await sel.json()) as unknown[]).length).toBe(1);
  });

  it('автор правит СВОЙ отзыв; чужой и анонимный — нет (010: reviews_update author-only)', async () => {
    const own = await rest(aliceTok, 'PATCH', `reviews?id=eq.${reviewId}`, { text: 'edited by owner' }, 'return=representation');
    expect(own.status).toBe(200);
    expect(((await own.json()) as Array<{ text: string }>)[0]?.text).toBe('edited by owner');

    const foreign = await rest(bobTok, 'PATCH', `reviews?id=eq.${reviewId}`, { text: 'hacked by bob' });
    expect([200, 204]).toContain(foreign.status); // 0 строк: USING отфильтровал
    const anon = await rest('anon', 'PATCH', `reviews?id=eq.${reviewId}`, { text: 'hacked by anon' });
    expect(DENIED).toContain(anon.status);

    const after = await rest('anon', 'GET', `reviews?id=eq.${reviewId}&select=text`);
    expect(((await after.json()) as Array<{ text: string }>)[0].text).toBe('edited by owner');
  });

  it('service пишет реакцию и читает её публично; anon удалять не может', async () => {
    const ins = await rest('service', 'POST', 'review_reactions', { review_id: reviewId, user_id: 'device-uid-1', kind: 'like' });
    expect(ins.status).toBe(201);
    const sel = await rest('anon', 'GET', `review_reactions?review_id=eq.${reviewId}&select=kind`);
    expect(sel.status).toBe(200);
    const del = await rest('anon', 'DELETE', `review_reactions?review_id=eq.${reviewId}&user_id=eq.device-uid-1`);
    expect(DENIED).toContain(del.status);
  });

  it('profile_history: видит только владелец (002: history_own), anon — пусто', async () => {
    const ins = await rest('service', 'POST', 'profile_history', { user_id: aliceUid, slug: 'rls-contract', episode: 1, updated_at: new Date().toISOString() });
    expect(ins.status).toBe(201);
    const anon = await rest('anon', 'GET', `profile_history?user_id=eq.${encodeURIComponent(aliceUid)}&select=slug`);
    expect(anon.status).toBe(200);
    expect(((await anon.json()) as unknown[]).length).toBe(0);
    const mine = await rest(aliceTok, 'GET', `profile_history?user_id=eq.${encodeURIComponent(aliceUid)}&select=slug`);
    expect(((await mine.json()) as unknown[]).length).toBeGreaterThan(0);
    const foreign = await rest(bobTok, 'GET', `profile_history?user_id=eq.${encodeURIComponent(aliceUid)}&select=slug`);
    expect(((await foreign.json()) as unknown[]).length).toBe(0);
  });
});
