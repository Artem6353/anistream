import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Аудит 2026-11-12: endpoint подписки — URL, который сервер дёргает с ключами.
 * Контракт: только https известных push-сервисов; битый JSON → 400, не 500.
 * Supabase намеренно не настроен (env пустые до импорта роута) → валидный
 * endpoint доходит до 503, а не уходит в реальную сеть.
 */

let POST: (r: Request) => Promise<Response>;
let DELETE: (r: Request) => Promise<Response>;

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  const mod = await import('../app/api/push/subscribe/route');
  POST = mod.POST;
  DELETE = mod.DELETE;
});

const post = (body: unknown) =>
  POST(new Request('https://aninova.test/api/push/subscribe', { method: 'POST', body: JSON.stringify(body) }));

describe('/api/push/subscribe: валидация endpoint', () => {
  it('битый JSON → 400', async () => {
    const res = await POST(new Request('https://aninova.test/api/push/subscribe', { method: 'POST', body: '{' }));
    expect(res.status).toBe(400);
  });

  it('не-https endpoint → 400', async () => {
    expect((await post({ endpoint: 'http://fcm.googleapis.com/x' })).status).toBe(400);
  });

  it('чужой хост → 400', async () => {
    expect((await post({ endpoint: 'https://evil.example.com/x' })).status).toBe(400);
  });

  it('javascript: → 400', async () => {
    expect((await post({ endpoint: 'javascript:alert(1)' })).status).toBe(400);
  });

  it('валидный FCM проходит валидацию (без Supabase дальше 503)', async () => {
    const res = await post({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' });
    expect(res.status).toBe(503);
  });

  it('DELETE без endpoint → 400', async () => {
    const res = await DELETE(new Request('https://aninova.test/api/push/subscribe'));
    expect(res.status).toBe(400);
  });

  it('DELETE с чужим хостом → 400', async () => {
    const res = await DELETE(new Request('https://aninova.test/api/push/subscribe?endpoint=' + encodeURIComponent('https://evil.example.com/x')));
    expect(res.status).toBe(400);
  });
});
