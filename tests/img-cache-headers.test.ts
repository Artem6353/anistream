import { describe, expect, it } from 'vitest';
import { imageHeaders } from '../lib/img-cache';

/**
 * Инцидент 2026-11-17: постеры не грузились, потому что `/img` отдавал
 * `max-age` без `s-maxage` — CDN такой ответ не кэширует, и каждая картинка
 * стоила вызова функции (6–15 с на холодном инстансе).
 */
describe('imageHeaders', () => {
  it('неизменяемые картинки кэшируются и браузером, и краем', () => {
    const headers = imageHeaders();
    expect(headers['Cache-Control']).toContain('s-maxage=31536000');
    expect(headers['Cache-Control']).toContain('immutable');
    expect(headers['CDN-Cache-Control']).toContain('max-age=31536000');
    expect(headers['Vercel-CDN-Cache-Control']).toContain('stale-while-revalidate');
    expect(headers.Vary).toBeUndefined();
  });

  it('fmt=auto добавляет Vary: Accept, чтобы край различал webp/avif', () => {
    expect(imageHeaders({ vary: true }).Vary).toBe('Accept');
  });

  it('короткий TTL для ответов без ресайза остаётся коротким', () => {
    const headers = imageHeaders({ immutable: false });
    expect(headers['Cache-Control']).toContain('s-maxage=3600');
    expect(headers['Cache-Control']).not.toContain('31536000');
    expect(headers['CDN-Cache-Control']).toContain('max-age=3600');
  });
});
