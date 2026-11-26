import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CatalogReadConfigurationError,
  CatalogReadError,
  CatalogReadIncompleteError,
  MAX_ROWS,
  assertCompleteSelection,
  fetchAll,
  fetchCount,
  isCatalogReadConfigured,
} from '../lib/aninova3/comics/operations/repository';

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_KEY,
  roleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  if (savedEnv.key === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = savedEnv.key;
  if (savedEnv.roleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.roleKey;
});

function configure(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key';
}


function completeness(over: Partial<Parameters<typeof assertCompleteSelection>[0]> = {}) {
  return {
    table: 'comic_works',
    fetched: 500,
    total: 500,
    lastPageSize: 500,
    pageSize: 1000,
    maxRows: MAX_ROWS,
    ...over,
  };
}

describe('B3-D selection completeness', () => {
  it('rejects a reported total above MAX_ROWS', () => {
    expect(() => assertCompleteSelection(completeness({ total: MAX_ROWS + 1, fetched: MAX_ROWS })))
      .toThrow(CatalogReadIncompleteError);
  });

  it('accepts a known total exactly equal to MAX_ROWS when fully fetched', () => {
    expect(() => assertCompleteSelection(completeness({ total: MAX_ROWS, fetched: MAX_ROWS, lastPageSize: 1000 }))).not.toThrow();
  });

  it('rejects an unknown total that reached MAX_ROWS', () => {
    expect(() => assertCompleteSelection(completeness({ total: null, fetched: MAX_ROWS, lastPageSize: 1000 })))
      .toThrow(CatalogReadIncompleteError);
  });

  it('accepts a short page below the limit when total is unknown', () => {
    expect(() => assertCompleteSelection(completeness({ total: null, fetched: 250, lastPageSize: 250 }))).not.toThrow();
  });

  it('rejects a known total that was not fully fetched', () => {
    expect(() => assertCompleteSelection(completeness({ total: 501, fetched: 500 })))
      .toThrow(CatalogReadIncompleteError);
  });

  it('accepts an empty known selection', () => {
    expect(() => assertCompleteSelection(completeness({ total: 0, fetched: 0, lastPageSize: 0 }))).not.toThrow();
  });
});

describe('B3-D read-only repository adapter', () => {
  it('fails closed without a service key and never falls back to anon', async () => {
    configure();
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(isCatalogReadConfigured()).toBe(false);
    await expect(fetchAll('comic_works', 'id', 'id.asc')).rejects.toBeInstanceOf(CatalogReadConfigurationError);
  });

  it('uses GET only and sends a bounded Range plus count preference', async () => {
    configure();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify([{ id: 'w1' }]), {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-range': '0-0/1' },
      });
    });
    const rows = await fetchAll<{ id: string }>('comic_works', 'id,title_ru', 'id.asc', { publication_status: 'eq.draft' });
    expect(rows).toEqual([{ id: 'w1' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.method).toBe('GET');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.apikey).toBe('service-key');
    expect(headers.Prefer).toBe('count=exact');
    expect(headers.Range).toBe('0-999');
    expect(calls[0]?.url).toContain('/rest/v1/comic_works');
    expect(calls[0]?.url).toContain('select=id%2Ctitle_ru');
    expect(calls[0]?.url).toContain('publication_status=eq.draft');
  });

  it('reads an exact count from Content-Range without fetching all rows', async () => {
    configure();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response('[]', { status: 200, headers: { 'content-range': '*/42' } });
    });
    await expect(fetchCount('comic_source_observations', { is_conflict: 'eq.true' })).resolves.toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.url).toContain('is_conflict=eq.true');
  });

  it('surfaces HTTP failures and missing count metadata', async () => {
    configure();
    vi.stubGlobal('fetch', async () => new Response('permission denied', { status: 403 }));
    await expect(fetchAll('comic_works', 'id', 'id.asc')).rejects.toMatchObject({ name: 'CatalogReadError', status: 403 });
    vi.stubGlobal('fetch', async () => new Response('[]', { status: 200 }));
    await expect(fetchCount('comic_works')).rejects.toBeInstanceOf(CatalogReadError);
  });

  it('wraps invalid JSON as a read error', async () => {
    configure();
    vi.stubGlobal('fetch', async () => new Response('not-json', { status: 200, headers: { 'content-range': '0-0/1' } }));
    await expect(fetchAll('comic_works', 'id', 'id.asc')).rejects.toBeInstanceOf(CatalogReadError);
  });

  it('fails closed when fetchAll reports more rows than MAX_ROWS', async () => {
    configure();
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return new Response(JSON.stringify([{ id: 'w1' }]), {
        status: 200,
        headers: { 'content-range': `0-0/${MAX_ROWS + 1}` },
      });
    });
    await expect(fetchAll('comic_works', 'id', 'id.asc')).rejects.toMatchObject({
      name: 'CatalogReadIncompleteError',
      total: MAX_ROWS + 1,
    });
    expect(calls).toBe(1);
  });

  it('fails closed when a known total is not fully fetched', async () => {
    configure();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([{ id: 'w1' }]), {
      status: 200,
      headers: { 'content-range': '0-0/2' },
    }));
    await expect(fetchAll('comic_works', 'id', 'id.asc')).rejects.toMatchObject({
      name: 'CatalogReadIncompleteError',
      fetched: 1,
      total: 2,
    });
  });
});