import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Публичные поверхности, закрытые аудитом:
 *  • `?live=1` на /api/providers (обход кэша = нагрузка на внешние бриджи);
 *  • Turnstile: невалидный токен обязан давать 403, а не «принять отзыв».
 *
 * Внешние сервисы не вызываются: каталог/резолвер провайдеров/эпизодная
 * граница подменены vi.mock, Supabase и Cloudflare — vi.stubGlobal('fetch').
 */

const state = vi.hoisted(() => ({ adminCookie: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (state.adminCookie ? { value: state.adminCookie } : undefined) }),
}));

vi.mock('@/lib/catalog', () => ({
  getTitle: (slug: string) =>
    slug === 'one-piece'
      ? { slug: 'one-piece', anilistId: 21, ru: 'Ван-Пис', romaji: 'ONE PIECE', year: 1999, type: 'tv', episodes: null, status: 'ongoing' }
      : undefined,
}));

vi.mock('@/lib/episode-route', () => ({ maxEpisodeNumberDb: async () => 24 }));

const resolveCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/lib/providers', () => ({
  contextFromTitle: () => ({ slug: 'one-piece', animeId: 21, episode: 1 }),
  providersWithAvailability: () => [{ id: 'kodik', configured: false }],
  resolveEpisodeSources: async () => {
    resolveCalls.count += 1;
    return { sources: [], sourcesUsed: [], fromCache: false };
  },
}));

async function providersRoute() {
  return import('@/app/api/providers/[slug]/[episode]/route');
}

const params = (slug = 'one-piece', episode = '1') => ({ params: Promise.resolve({ slug, episode }) });

describe('GET /api/providers: ?live=1 без прав → 403', () => {
  beforeEach(() => {
    resolveCalls.count = 0;
    vi.stubEnv('BACKFILL_TOKEN', 'backfill-secret');
  });

  afterEach(() => {
    state.adminCookie = undefined;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('анонимный ?live=1 не доходит до резолвера', async () => {
    const { GET } = await providersRoute();
    const res = await GET(new Request('http://localhost/api/providers/one-piece/1?live=1'), params());
    expect(res.status).toBe(403);
    expect(resolveCalls.count).toBe(0);
  });

  it('неверный BACKFILL_TOKEN → 403', async () => {
    const { GET } = await providersRoute();
    const res = await GET(
      new Request('http://localhost/api/providers/one-piece/1?live=1&token=wrong', {
        headers: { 'x-backfill-token': 'wrong' },
      }),
      params(),
    );
    expect(res.status).toBe(403);
    expect(resolveCalls.count).toBe(0);
  });

  it('верный BACKFILL_TOKEN (заголовок воркера) → 200', async () => {
    const { GET } = await providersRoute();
    const res = await GET(
      new Request('http://localhost/api/providers/one-piece/1?live=1', {
        headers: { 'x-backfill-token': 'backfill-secret' },
      }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(resolveCalls.count).toBe(1);
  });

  it('без ?live=1 резолвер работает как обычно (кэш-путь не тронут)', async () => {
    const { GET } = await providersRoute();
    const res = await GET(new Request('http://localhost/api/providers/one-piece/1'), params());
    expect(res.status).toBe(200);
    expect(resolveCalls.count).toBe(1);
  });
});

describe('POST /api/social/reviews: Turnstile-негатив', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-test-key');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'service-test-key');
    vi.stubEnv('TURNSTILE_SECRET', 'turnstile-test-secret');
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('невалидный токен Turnstile → 403 и запись в Supabase не создаётся', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return Response.json({ success: false, 'error-codes': ['invalid-input-response'] });
      }),
    );
    const { POST } = await import('@/app/api/social/reviews/route');
    const res = await POST(
      new Request('http://localhost/api/social/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'one-piece', text: 'Отзыв', rating: 9, turnstile: 'bad-token' }),
      }),
    );
    expect(res.status).toBe(403);
    expect(calls.some((url) => url.includes('siteverify'))).toBe(true);
    expect(calls.some((url) => url.includes('/rest/v1/reviews'))).toBe(false);
  });

  it('сетевой сбой проверки Turnstile → 403 (fail-closed), запись не создаётся', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('cloudflare unreachable');
      }),
    );
    const { POST } = await import('@/app/api/social/reviews/route');
    const res = await POST(
      new Request('http://localhost/api/social/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'one-piece', text: 'Отзыв', rating: 9, turnstile: 'token' }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
