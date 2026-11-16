import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Модерация: контракты admin-роутов и DB-режима скрытия тайтла.
 *
 * Аудит (P1-4/P1-5): здесь зафиксированы два регресса, которые ломали модерацию
 * на проде:
 *  1) DELETE /api/admin/manual падал в 500 (TypeError) при неизвестном slug/серии;
 *  2) скрытие тайтла писало только titles.json, а в DB-режиме (CATALOG_SOURCE=db)
 *     каталог читается из public.titles — флаг не применялся.
 *
 * Внешние сервисы не вызываются: next/headers и next/cache подменены, Supabase
 * REST мокается через vi.stubGlobal('fetch').
 */

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

async function adminRoute() {
  return import('@/app/api/admin/manual/route');
}

describe('DELETE /api/admin/manual: нет 500 на отсутствующих данных', () => {
  beforeEach(async () => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    const { makeAdminCookieValue } = await import('@/lib/admin-auth');
    state.cookie = makeAdminCookieValue().value;
  });

  afterEach(() => {
    state.cookie = undefined;
    delete process.env.ADMIN_TOKEN;
    vi.resetModules();
  });

  it('неизвестный slug → 404, а не TypeError/500', async () => {
    const { DELETE } = await adminRoute();
    const res = await DELETE(
      new Request('http://localhost/api/admin/manual?slug=no-such-title&episode=1&idx=0', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('не найден') });
  });

  it('idx вне диапазона → 404 (записи нет), без исключения', async () => {
    const { DELETE } = await adminRoute();
    const res = await DELETE(
      new Request('http://localhost/api/admin/manual?slug=no-such-title&episode=99&idx=5', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
  });

  it('без admin-cookie → 403 (поверхность закрыта)', async () => {
    state.cookie = undefined;
    const { DELETE } = await adminRoute();
    const res = await DELETE(new Request('http://localhost/api/admin/manual?slug=x&episode=1&idx=0', { method: 'DELETE' }));
    expect(res.status).toBe(403);
  });

  it('битый JSON в POST → 400, а не 500', async () => {
    const { POST } = await adminRoute();
    const res = await POST(
      new Request('http://localhost/api/admin/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('javascript:-URL в POST отклоняется (iframe получает src напрямую)', async () => {
    const { POST } = await adminRoute();
    const res = await POST(
      new Request('http://localhost/api/admin/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'one-piece', episode: 1, embedUrl: 'javascript:alert(1)' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('setTitleHidden: DB-режим пишет в public.titles, а не только в файл', () => {
  const SUPA = 'https://db.test.supabase.co';

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPA);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-test-key');
    vi.stubEnv('CATALOG_SOURCE', 'db');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('шлёт PATCH titles?slug=eq.<slug> и сообщает found: true', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return Response.json([{ slug: 'one-piece', hidden: true }]);
      }),
    );
    const { setTitleHidden } = await import('@/lib/catalog');
    const result = await setTitleHidden('one-piece', true);

    expect(result).toEqual({ source: 'db', found: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${SUPA}/rest/v1/titles?slug=eq.one-piece`);
    expect(calls[0].init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ hidden: true });
  });

  it('пустой ответ PostgREST → found: false (роут отвечает 404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    const { setTitleHidden } = await import('@/lib/catalog');
    await expect(setTitleHidden('no-such-title', true)).resolves.toEqual({ source: 'db', found: false });
  });

  it('ошибка Supabase пробрасывается (роут отдаёт 500 JSON, а не пустой 500)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const { setTitleHidden } = await import('@/lib/catalog');
    await expect(setTitleHidden('one-piece', true)).rejects.toThrow(/HTTP 500/);
  });
});
