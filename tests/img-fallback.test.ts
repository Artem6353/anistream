import { describe, expect, it, vi } from 'vitest';

/**
 * ИНЦИДЕНТ 2026-10-15 (Netlify): import sharp падал на платформах без нативного
 * бинаря в бандле → 502 на /img → все постеры/кадры в фолбэках. Контракт:
 * нет sharp → 302 на исходный URL разрешённого CDN (картинки живые везде,
 * просто без ресайза); sharp есть → транскод как прежде.
 */

vi.mock('sharp', () => {
  throw new Error('Cannot find module sharp (simulated missing native binary)');
});

import { GET } from '../app/img/route';

describe('/img без sharp (деградация платформы)', () => {
  it('302 на исходный URL разрешённого CDN', async () => {
    const res = await GET(
      new Request('http://localhost/img?url=https%3A%2F%2Fs4.anilist.co%2Ffile%2Fanilistcdn%2Fmedia%2Fanime%2Fcover%2Fmedium%2Fbx21.jpg&w=96&fmt=auto'),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('netlify-vary')).toBe('query=url|w|q|fmt,header=Accept');
    expect(res.headers.get('location')).toBe(
      'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21.jpg',
    );
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
  });

  it('fmt=orig sharp не требует: проксирует и без него… но редирект только для транскода', async () => {
    /* fmt=orig идёт через прокси без sharp: upstream мокнем. */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })),
    );
    const res = await GET(
      new Request('http://localhost/img?url=https%3A%2F%2Fs4.anilist.co%2Ffile%2Fx.jpg&fmt=orig'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('netlify-vary')).toBe('query=url|w|q|fmt,header=Accept');
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    vi.unstubAllGlobals();
  });

  it('403 для хостов вне allowlist сохранён', async () => {
    const res = await GET(new Request('http://localhost/img?url=https%3A%2F%2Fevil.example%2Fx.jpg'));
    expect(res.status).toBe(403);
  });
});
