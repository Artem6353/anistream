import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Инцидент 2026-11-17: прайм каталога из БД шёл батчами по 20 с таймаута каждый,
 * поэтому при медленном Supabase фоновая загрузка жила минутами и подвешивала
 * serverless-инстанс. Теперь у прайма общий бюджет (CATALOG_DB_PRIME_BUDGET_MS).
 */
describe('primeCatalogFromDb: общий бюджет времени', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.CATALOG_SOURCE = 'db';
    process.env.CATALOG_DB_PRIME_BUDGET_MS = '100';
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it('обрывает зависший запрос по таймауту и остаётся на файле', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      // Запрос, который никогда не отвечает: спасать должен AbortSignal.
      const signal = init.signal as AbortSignal;
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
      throw new Error('unreachable');
    }));

    const { primeCatalogFromDb } = await import('../lib/catalog');
    const startedAt = Date.now();
    const rows = await primeCatalogFromDb();

    expect(rows).toBe(0);
    expect(Date.now() - startedAt).toBeLessThan(2500);
  });

  it('останавливается, когда общий бюджет батчей исчерпан', async () => {
    const page = Array.from({ length: 2000 }, (_, i) => ({
      id: i + 1,
      slug: 'title-' + i,
      anilist_id: i + 1,
      mal_id: null,
      shikimori_id: null,
      title_ru: 'Тайтл ' + i,
      title_en: null,
      title_romaji: null,
      format: null,
      status: 'finished',
      year: 2020,
      season: null,
      episodes_total: 12,
      episodes_released: 12,
      score: 7,
      popularity: 1,
      genres: [],
      poster: '',
      banner: null,
      description_ru: null,
      description_alt: null,
      trailer: null,
      studios: [],
      source: null,
      duration: null,
      is_adult: false,
      meta_source: 'anilist',
      hidden: false,
    }));
    // Первая страница тянется дольше бюджета → вторая не запрашивается.
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { ok: true, json: async () => page } as unknown as Response;
    }));

    const { primeCatalogFromDb } = await import('../lib/catalog');
    const startedAt = Date.now();
    const rows = await primeCatalogFromDb();
    const fetchCalls = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    expect(rows).toBe(0);
    // Бюджет 1000 мс и 300 мс на страницу: страниц не может быть много.
    expect(fetchCalls).toBeLessThanOrEqual(4);
    expect(Date.now() - startedAt).toBeLessThan(2500);
  });

  it('не ходит в БД вовсе, если источник файловый', async () => {
    process.env.CATALOG_SOURCE = 'file';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { primeCatalogFromDb } = await import('../lib/catalog');
    expect(await primeCatalogFromDb()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
