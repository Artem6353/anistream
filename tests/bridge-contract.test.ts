import { describe, expect, it, vi } from 'vitest';
import type { ProviderContext } from '../lib/providers/types';

/** P3-3: контракт-тесты нормализатора bridge — исторические формы ответов
    (sources[] / results[] + embed_url / link) не должны ломать плеер. */
const ctx: ProviderContext = {
  slug: 'test', anilistId: 1, malId: 1, shikimoriId: 1, title: 'Test', originalTitle: 'Test',
  year: 2024, format: 'tv', episodesCount: 12, isAdult: false, episode: 1, totalEpisodes: 12,
} as ProviderContext;

const mockFetch = (routes: Record<string, unknown>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/health')) return { ok: true, json: async () => ({ ok: true }) } as Response;
      const body = routes[u.includes('/resolve') ? 'resolve' : 'other'] ?? {};
      return { ok: true, json: async () => body } as Response;
    }),
  );
};

describe('bridge contract', () => {
  it('современная форма: sources[] с kind/embedUrl', async () => {
    mockFetch({ resolve: { sources: [{ label: 'AniDUB', kind: 'embed', embedUrl: 'https://x/e/1' }] } });
    const { bridgeResolve } = await import('../lib/providers/bridge');
    const r = await bridgeResolve({ baseUrl: 'http://b', timeoutMs: 1000 }, 'kodik', ctx);
    expect(r.sources.length).toBe(1);
    expect(r.sources[0].embedUrl).toContain('https://');
  });

  it('legacy-форма: results[] + embed_url', async () => {
    mockFetch({ resolve: { results: [{ dub: 'AniLibria', embed_url: 'https://x/e/2' }] } });
    const { bridgeResolve } = await import('../lib/providers/bridge');
    const r = await bridgeResolve({ baseUrl: 'http://b', timeoutMs: 1000 }, 'cvh', ctx);
    expect(r.sources.length).toBeGreaterThanOrEqual(1);
    expect(r.sources[0].kind).toBe('embed');
  });

  it('bridge offline (health-gate) → пустой ответ без таймаута', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }) as Response),
    );
    const { bridgeResolve } = await import('../lib/providers/bridge');
    const r = await bridgeResolve({ baseUrl: 'http://down', timeoutMs: 1000 }, 'kodik', ctx);
    expect(r.sources).toEqual([]);
    expect(r.error).toContain('health-gate');
  });
});
