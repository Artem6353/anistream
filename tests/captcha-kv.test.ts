import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';

/**
 * Аудит 30.09: регрессии исправленного —
 *  - капча (P0-3): fail-closed в production без секрета, приоритет CAPTCHA_SECRET,
 *    повышенная энтропия, истёкшие токены;
 *  - KV-кэш провайдеров (P0-5): cacheSet РЕАЛЬНО пишет в Upstash, cacheGet читает,
 *    индекс эпизодов питает cacheEntriesForSlug (раньше kvSet не вызывался нигде).
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('captcha (P0-3)', () => {
  it('в production без секрета — fail-closed (хардкод-фолбэк удалён)', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CAPTCHA_SECRET', '');
    vi.stubEnv('ADMIN_TOKEN', '');
    const { makeCaptcha, verifyCaptcha, captchaAvailable } = await import('@/lib/social-server');
    expect(captchaAvailable()).toBe(false);
    const c = makeCaptcha();
    expect(verifyCaptcha(c.token, c.answer)).toBe(false);
  });

  it('CAPTCHA_SECRET имеет приоритет над ADMIN_TOKEN', async () => {
    vi.resetModules();
    vi.stubEnv('CAPTCHA_SECRET', 'secret-a');
    vi.stubEnv('ADMIN_TOKEN', 'secret-b');
    const mod = await import('@/lib/social-server');
    const c = mod.makeCaptcha();
    expect(mod.verifyCaptcha(c.token, c.answer)).toBe(true);
    // тот же токен модулем с другим секретом (только ADMIN_TOKEN) не принимается
    vi.resetModules();
    vi.stubEnv('CAPTCHA_SECRET', '');
    const mod2 = await import('@/lib/social-server');
    expect(mod2.verifyCaptcha(c.token, c.answer)).toBe(false);
  });

  it('энтропия: ответ в диапазоне 11..108 (было 3..19)', async () => {
    vi.resetModules();
    vi.stubEnv('CAPTCHA_SECRET', 'x');
    const { makeCaptcha } = await import('@/lib/social-server');
    for (let i = 0; i < 50; i++) {
      const c = makeCaptcha();
      expect(c.answer).toBeGreaterThanOrEqual(11);
      expect(c.answer).toBeLessThanOrEqual(108);
    }
  });

  it('просроченный токен отклоняется', async () => {
    vi.resetModules();
    vi.stubEnv('CAPTCHA_SECRET', 'x');
    vi.useFakeTimers();
    const { makeCaptcha, verifyCaptcha } = await import('@/lib/social-server');
    const c = makeCaptcha();
    expect(verifyCaptcha(c.token, c.answer)).toBe(true);
    vi.advanceTimersByTime(11 * 60_000); // TTL токена 10 минут
    expect(verifyCaptcha(c.token, c.answer)).toBe(false);
    vi.useRealTimers();
  });
});

describe('providers cache: Upstash KV (P0-5)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://kv.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok');
    vi.stubEnv('PROVIDER_CACHE_ENABLED', 'true');
    vi.stubEnv('PROVIDER_CACHE_WRITE', 'true');
  });

  async function withKv() {
    const store = new Map<string, string>();
    const calls: unknown[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as unknown[];
        calls.push(body);
        const cmd = String(body[0]);
        const key = String(body[1]);
        if (cmd === 'SET') {
          store.set(key, String(body[2]));
          return { json: async () => ({ result: 'OK' }) };
        }
        if (cmd === 'GET') return { json: async () => ({ result: store.get(key) ?? null }) };
        return { json: async () => ({ result: null }) };
      }) as unknown as typeof fetch,
    );
    const mod = await import('@/lib/providers/cache');
    const types = await import('@/lib/providers/types');
    return { mod, types, store, calls };
  }

  it('cacheSet пишет в KV (SET), cacheGet читает, индекс эпизодов работает', async () => {
    const { mod, calls, store } = await withKv();
    const key = mod.cacheKey('kv-test-slug', 3);
    const sources = {
      sources: [
        {
          id: 'kodik:1:8',
          label: 'Test Voice',
          providerId: 'kodik',
          providerName: 'Kodik',
          kind: 'embed',
          embedUrl: 'https://x/1',
          voice: 'voice',
        },
      ],
      sourcesUsed: ['kodik'],
      fromCache: false,
    } as unknown as import('@/lib/providers/types').EpisodeSources;

    await mod.cacheSet(key, sources);
    expect(calls.some((c) => c[0] === 'SET' && String(c[1]) === `ep:${key}`)).toBe(true);
    expect(store.size).toBeGreaterThan(0);

    const got = await mod.cacheGet(key);
    expect(got?.sources.length).toBe(1);
    expect(got?.sources[0].providerId).toBe('kodik');

    const entries = await mod.cacheEntriesForSlug('kv-test-slug');
    expect(entries.map((e) => e.episode)).toContain(3);
  });

  it('demo-only источники в KV не пишутся', async () => {
    const { mod, calls } = await withKv();
    const sources = {
      sources: [{ id: 'demo:1', label: 'Demo', providerId: 'demo', providerName: 'Demo', kind: 'file', voice: 'voice' }],
      sourcesUsed: ['demo'],
      fromCache: false,
    } as unknown as import('@/lib/providers/types').EpisodeSources;
    await mod.cacheSet(mod.cacheKey('kv-demo', 1), sources);
    expect(calls.filter((c) => c[0] === 'SET').length).toBe(0);
    expect(await mod.cacheGet(mod.cacheKey('kv-demo', 1))).toBeNull();
  });
});
