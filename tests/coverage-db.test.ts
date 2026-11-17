import { describe, expect, it, vi } from 'vitest';

import {
  buildCoverageStore,
  fetchAllRows,
  readCoverageFromDb,
} from '../scripts/lib/coverage-db.mjs';

const titles = [
  { slug: 'one-piece', anilistId: 21, episodes: 5 },
  { slug: 'frieren', anilistId: 154587, episodes: 28 },
  { slug: 'no-sources', anilistId: 999, episodes: 12 },
  { slug: 'no-anilist', episodes: 12 },
];

const urlRow = (animeId: number, episode: number, provider = 'kodik', at = '2026-11-17T10:00:00Z') => ({
  anime_id: animeId,
  provider,
  episode,
  checked_at: at,
});

describe('coverage-db: сборка стора из строк Supabase', () => {
  it('раскладывает per-episode строки в ключи ep:<slug>:<episode> и суммирует провайдеров', () => {
    const { store, stats } = buildCoverageStore({
      titles,
      urlRows: [urlRow(21, 1), urlRow(21, 1, 'cvh'), urlRow(21, 2)],
      now: Date.parse('2026-11-17T12:00:00Z'),
      ttlMs: 86_400_000,
    });

    expect(Object.keys(store).sort()).toEqual(['ep:one-piece:1', 'ep:one-piece:2']);
    expect(store['ep:one-piece:1'].sources.sourcesUsed.sort()).toEqual(['cvh', 'kodik']);
    expect(store['ep:one-piece:1'].sources.sources).toHaveLength(2);
    expect(store['ep:one-piece:1'].ttlMs).toBe(86_400_000);
    expect(store['ep:one-piece:2'].sources.sourcesUsed).toEqual(['kodik']);
    expect(stats.perEpisodeRows).toBe(3);
    expect(stats.urlEpisodes).toBe(2);
    expect(stats.headerOnlyTitles).toBe(0);
  });

  it('добивает single-embed тайтлы из episode_sources до episodes_count', () => {
    const { store, stats } = buildCoverageStore({
      titles,
      headerRows: [{ anime_id: 154587, provider: 'aniboom', episodes_count: 3, checked_at: '2026-11-17T10:00:00Z' }],
      now: Date.parse('2026-11-17T12:00:00Z'),
    });

    expect(Object.keys(store).sort()).toEqual(['ep:frieren:1', 'ep:frieren:2', 'ep:frieren:3']);
    expect(store['ep:frieren:1'].sources.sources[0].providerId).toBe('aniboom');
    expect(stats.headerEpisodes).toBe(3);
    expect(stats.headerOnlyTitles).toBe(1);
  });

  it('не затирает точные ссылки шапкой и считает мусор/сирот', () => {
    const { store, stats } = buildCoverageStore({
      titles,
      urlRows: [urlRow(21, 1), { anime_id: 12345, provider: 'kodik', episode: 1 }, { anime_id: 21, provider: 'kodik', episode: 0 }],
      headerRows: [{ anime_id: 21, provider: 'aniboom', episodes_count: 99, checked_at: null }],
    });

    expect(Object.keys(store)).toEqual(['ep:one-piece:1']);
    expect(store['ep:one-piece:1'].sources.sourcesUsed).toEqual(['kodik']);
    expect(stats.orphanUrlRows).toBe(1);
    expect(stats.malformedUrlRows).toBe(1);
    expect(stats.headerOnlyTitles).toBe(0);
  });

  it('помечает устаревшие строки отдельным счётчиком, но не выбрасывает их', () => {
    const { store, stats } = buildCoverageStore({
      titles,
      urlRows: [
        urlRow(21, 1, 'kodik', '2026-01-01T00:00:00Z'),
        urlRow(21, 2, 'kodik', '2026-11-17T10:00:00Z'),
      ],
      ttlMs: Number.MAX_SAFE_INTEGER,
      stalenessMs: 86_400_000,
      now: Date.parse('2026-11-17T12:00:00Z'),
    });

    expect(Object.keys(store)).toHaveLength(2);
    expect(stats.staleEpisodes).toBe(1);
    expect(stats.newestCheckedAt).toBe('2026-11-17T10:00:00.000Z');
  });

  it('не создаёт записей для тайтлов без anilistId и без строк в БД', () => {
    const { store, stats } = buildCoverageStore({
      titles,
      urlRows: [urlRow(999, 1)],
      headerRows: [],
    });
    expect(Object.keys(store)).toEqual(['ep:no-sources:1']);
    expect(stats.titlesWithAnilistId).toBe(3);
  });
});

describe('coverage-db: пагинация PostgREST', () => {
  it('ходит по Range-страницам, пока не придёт неполная', async () => {
    const calls: Array<{ range: string; url: string }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const range = (init.headers as Record<string, string>).Range;
      calls.push({ range, url });
      const body = range.startsWith('0-')
        ? Array.from({ length: 2 }, (_, i) => urlRow(21, i + 1))
        : [urlRow(21, 3)];
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    });

    const rows = await fetchAllRows({
      baseUrl: 'https://example.supabase.co',
      key: 'service-key',
      table: 'episode_source_urls',
      select: 'anime_id,provider,episode,checked_at',
      filter: 'status=eq.ok',
      page: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(3);
    expect(calls).toHaveLength(2);
    expect(calls[0].range).toBe('0-1');
    expect(calls[1].range).toBe('2-3');
    expect(calls[0].url).toContain('status=eq.ok');
  });

  it('падает с понятной ошибкой на не-200 (не глотает 401/404)', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response);
    await expect(
      fetchAllRows({
        baseUrl: 'https://example.supabase.co',
        key: 'bad',
        table: 'episode_source_urls',
        select: 'anime_id',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('episode_source_urls HTTP 401');
  });
});

describe('coverage-db: readCoverageFromDb', () => {
  it('читает обе таблицы и собирает стор', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const table = url.includes('episode_source_urls') ? 'urls' : 'headers';
      const body = table === 'urls'
        ? [urlRow(21, 1), urlRow(21, 2)]
        : [{ anime_id: 154587, provider: 'cvh', episodes_count: 2, checked_at: '2026-11-17T09:00:00Z' }];
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    });

    const { store, stats } = await readCoverageFromDb({
      baseUrl: 'https://example.supabase.co',
      key: 'service-key',
      titles,
      now: Date.parse('2026-11-17T12:00:00Z'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(Object.keys(store).sort()).toEqual(['ep:frieren:1', 'ep:frieren:2', 'ep:one-piece:1', 'ep:one-piece:2']);
    expect(stats.perEpisodeRows).toBe(2);
    expect(stats.headerRows).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('требует креды', async () => {
    await expect(
      readCoverageFromDb({ baseUrl: '', key: '', titles }),
    ).rejects.toThrow('Supabase credentials');
  });
});
