import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Аудит 2026-11-12: DELETE /api/admin/manual падал с TypeError при удалении
 * несуществующего slug (`delete data[slug][ep]`, где data[slug] === undefined)
 * → голый 500. Контракт: 404 JSON. Плюс: битый JSON → 400, запись tmp+rename,
 * read-only ФС → 503 с понятной причиной, а не 500.
 */

const h = vi.hoisted(() => {
  const files = new Map<string, string>();
  return {
    files,
    cookie: { value: undefined as string | undefined },
    fs: {
      readFile: vi.fn(async (p: string) => {
        const v = files.get(String(p));
        if (v === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return v;
      }),
      writeFile: vi.fn(async (p: string, data: string) => {
        files.set(String(p), String(data));
      }),
      rename: vi.fn(async (a: string, b: string) => {
        const v = files.get(String(a));
        if (v === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        files.set(String(b), v);
        files.delete(String(a));
      }),
      unlink: vi.fn(async () => undefined),
    },
  };
});

vi.mock('node:fs', () => ({ promises: h.fs }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (h.cookie.value ? { value: h.cookie.value } : undefined) }),
}));

import { POST, DELETE } from '../app/api/admin/manual/route';
import { makeAdminCookieValue } from '@/lib/admin-auth';

const FILE = 'lib/data/manual-sources.json';

beforeEach(() => {
  vi.stubEnv('ADMIN_TOKEN', 'test-admin-token');
  h.cookie.value = makeAdminCookieValue().value;
  h.files.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const del = (qs: string) => DELETE(new Request(`https://aninova.test/api/admin/manual?${qs}`));
const post = (body: unknown) =>
  POST(new Request('https://aninova.test/api/admin/manual', { method: 'POST', body: JSON.stringify(body) }));

describe('/api/admin/manual', () => {
  it('DELETE несуществующего slug → 404 JSON (регрессия TypeError-краша)', async () => {
    const res = await del('slug=nope&episode=1&idx=0');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('DELETE последней записи чистит пустые ключи', async () => {
    h.files.set(FILE, JSON.stringify({ 'one-piece': { '1': [{ label: 'x', embedUrl: 'https://e.test/1' }] } }));
    const res = await del('slug=one-piece&episode=1&idx=0');
    expect(res.status).toBe(200);
    expect(JSON.parse(h.files.get(FILE)!)).toEqual({});
  });

  it('POST с битым JSON → 400, не 500', async () => {
    const res = await POST(new Request('https://aninova.test/api/admin/manual', { method: 'POST', body: '{oops' }));
    expect(res.status).toBe(400);
  });

  it('POST валидный → атомарная запись через tmp+rename', async () => {
    const res = await post({ slug: 'one-piece', episode: 1, embedUrl: 'https://e.test/1' });
    expect(res.status).toBe(200);
    expect(h.fs.rename).toHaveBeenCalled();
    const data = JSON.parse(h.files.get(FILE)!) as Record<string, Record<string, unknown[]>>;
    expect(data['one-piece']['1']).toHaveLength(1);
  });

  it('POST с http-ссылкой → 400 (embed только https)', async () => {
    const res = await post({ slug: 'x', episode: 1, embedUrl: 'http://e.test/1' });
    expect(res.status).toBe(400);
  });

  it('read-only ФС (EROFS) → 503 с причиной, не голый 500', async () => {
    h.fs.writeFile.mockRejectedValueOnce(Object.assign(new Error('EROFS'), { code: 'EROFS' }));
    const res = await post({ slug: 'x', episode: 1, embedUrl: 'https://e.test/1' });
    expect(res.status).toBe(503);
  });

  it('без admin-cookie → 403', async () => {
    h.cookie.value = undefined;
    const res = await del('slug=x&episode=1&idx=0');
    expect(res.status).toBe(403);
  });
});
