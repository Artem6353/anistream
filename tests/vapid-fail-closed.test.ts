import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Аудит 2026-11-12: /api/push/vapid без env-ключей генерировал НОВЫЕ ключи на
 * каждом serverless-инстансе → подписки ломались (VAPID mismatch при рассылке).
 * Контракт: production без ключей → 503; dev — генерация работает.
 */

const h = vi.hoisted(() => ({
  fs: {
    readFile: vi.fn(async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  },
}));

vi.mock('node:fs', () => ({ promises: h.fs }));

import { GET } from '../app/api/push/vapid/route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('/api/push/vapid', () => {
  it('production без VAPID-ключей → 503 (эфемерные ключи ломали подписки)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VAPID_PUBLIC', '');
    vi.stubEnv('VAPID_PRIVATE', '');
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it('env-ключи отдаются как есть', async () => {
    vi.stubEnv('VAPID_PUBLIC', 'pub-123');
    vi.stubEnv('VAPID_PRIVATE', 'priv-123');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicKey: 'pub-123' });
  });

  it('dev без ключей — генерация не падает', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VAPID_PUBLIC', '');
    vi.stubEnv('VAPID_PRIVATE', '');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { publicKey: string };
    expect(typeof body.publicKey).toBe('string');
    expect(body.publicKey.length).toBeGreaterThan(10);
  });
});
