import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Инцидент 2026-11-17: холодный старт serverless-функции ждал полной выборки
 * `episode_source_urls` (346k строк = 346 последовательных запросов), поэтому
 * прод не отвечал минутами. Теперь у загрузки есть общий дедлайн, страницы идут
 * параллельно, а объём ограничен maxRows.
 */
describe('dbLoadCache: дедлайн и параллельные страницы', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  /** PostgREST отдаёт не больше запрошенного диапазона — мок обязан вести себя так же. */
  const rangeLimit = (init?: RequestInit): number => {
    const range = (init?.headers as Record<string, string> | undefined)?.Range;
    if (!range) return 1000;
    const [start, end] = range.split('-').map(Number);
    return end - start + 1;
  };

  const row = (i: number) => ({
    anime_id: 1,
    provider: 'kodik',
    translation_id: '1',
    episode: i + 1,
    kind: 'embed',
    embed_url: `https://cdn.example/e${i}.m3u8`,
    checked_at: new Date().toISOString(),
  });

  it('укладывается в бюджет, даже если БД отдаёт страницы медленно', async () => {
    let served = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (url.includes('episode_sources?')) return { ok: true, json: async () => [] } as unknown as Response;
      const start = served;
      const limit = rangeLimit(init);
      served += limit;
      return { ok: true, json: async () => Array.from({ length: limit }, (_, i) => row(start + i)) } as unknown as Response;
    }));

    const { dbLoadCache } = await import('../lib/providers/cache-db');
    const startedAt = Date.now();
    const entries = await dbLoadCache(new Map([[1, 'one-piece']]), { maxRows: 1_000_000, budgetMs: 400 });
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(1600);
    // Дедлайн обязан остановить загрузку до полной выборки.
    expect(entries.length).toBeLessThanOrEqual(12_000);
  });

  it('maxRows ограничивает объём выборки', async () => {
    let served = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('episode_sources?')) return { ok: true, json: async () => [] } as unknown as Response;
      const start = served;
      const limit = rangeLimit(init);
      served += limit;
      return { ok: true, json: async () => Array.from({ length: limit }, (_, i) => row(start + i)) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { dbLoadCache } = await import('../lib/providers/cache-db');
    const entries = await dbLoadCache(new Map([[1, 'one-piece']]), { maxRows: 2500, budgetMs: 10_000 });

    expect(entries.length).toBe(2500);
    // Страниц немного: чтение останавливается, как только данные кончились.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it('одна упавшая страница не роняет загрузку', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('episode_sources?')) return { ok: true, json: async () => [] } as unknown as Response;
      const limit = rangeLimit(init);
      call += 1;
      if (call === 2) return { ok: false, status: 500, json: async () => [] } as unknown as Response;
      const start = (call - 1) * 1000;
      return { ok: true, json: async () => Array.from({ length: limit }, (_, i) => row(start + i)) } as unknown as Response;
    }));

    const { dbLoadCache } = await import('../lib/providers/cache-db');
    const entries = await dbLoadCache(new Map([[1, 'one-piece']]), { maxRows: 4000, budgetMs: 10_000 });

    expect(entries.length).toBe(1000);
  });
});
