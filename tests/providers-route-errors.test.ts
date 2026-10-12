import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ИНЦИДЕНТ 2026-10-13: /api/providers/[slug]/[episode] отвечал голым текстом
 * «Internal Server Error» (500), потому что getTitle() и maxEpisodeNumberDb()
 * стояли ВНЕ try/catch. Контракт: ЛЮБАЯ ошибка маршрута — это JSON с полем
 * message, по которому плеер и мониторинг понимают причину.
 *
 * Тяжёлые зависимости (каталог, БД, резолверы) замоканы: тестируем именно
 * контракт ответов маршрута, а не данные (ветка БД покрыта отдельно в
 * tests/providers-db-branch.test.ts).
 */

const h = vi.hoisted(() => ({
  getTitle: vi.fn(),
  maxEpisodeNumberDb: vi.fn(),
  resolveEpisodeSources: vi.fn(),
}));

vi.mock('@/lib/catalog', () => ({ getTitle: h.getTitle }));
vi.mock('@/lib/episode-route', () => ({ maxEpisodeNumberDb: h.maxEpisodeNumberDb }));
vi.mock('@/lib/providers', () => ({
  resolveEpisodeSources: h.resolveEpisodeSources,
  contextFromTitle: (title: { slug: string }, episode: number) => ({ slug: title.slug, episode }),
  providersWithAvailability: () => [],
}));
vi.mock('@/lib/providers/response-cache', () => ({
  providerResponseCacheControl: () => 'no-store',
}));

import { GET } from '../app/api/providers/[slug]/[episode]/route';

const TITLE = { slug: 'hunter-hunter-2011', anilistId: 11061, ru: 'Hunter x Hunter', romaji: 'Hunter x Hunter (2011)', year: 2011, type: 'tv', episodes: 148 };

function call(episode = '1') {
  return GET(new Request(`https://aninova.test/api/providers/hunter-hunter-2011/${episode}`), {
    params: Promise.resolve({ slug: 'hunter-hunter-2011', episode }),
  });
}

beforeEach(() => {
  h.getTitle.mockReset();
  h.maxEpisodeNumberDb.mockReset();
  h.resolveEpisodeSources.mockReset();
  h.getTitle.mockReturnValue(TITLE);
  h.maxEpisodeNumberDb.mockResolvedValue(148);
  h.resolveEpisodeSources.mockResolvedValue({ sources: [], sourcesUsed: [], fromCache: false });
});

describe('контракт ошибок /api/providers/[slug]/[episode]: всегда JSON с причиной', () => {
  it('getTitle бросает (например statSync ENOENT по titles.json) → 500 JSON, не голый текст', async () => {
    h.getTitle.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory, stat '/var/task/lib/data/titles.json'");
    });
    const res = await call();
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('catalog');
    expect(body.message).toContain('ENOENT');
  });

  it('maxEpisodeNumberDb rejects (Supabase недоступна и fallback сломан) → 500 JSON', async () => {
    h.maxEpisodeNumberDb.mockRejectedValue(new Error('fetch failed (episode_progress)'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('episode-boundary');
    expect(body.message).toContain('episode_progress');
  });

  it('неизвестный slug → 404 JSON', async () => {
    h.getTitle.mockReturnValue(undefined);
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'title not found' });
  });

  it('номер серии вне границы → 400 JSON с maxEpisode', async () => {
    const res = await call('9999');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad episode', maxEpisode: 148 });
  });

  it('resolve падает → 502 JSON upstream (поведение сохранено)', async () => {
    h.resolveEpisodeSources.mockRejectedValue(new Error('bridge timeout'));
    const res = await call();
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('upstream');
    expect(body.message).toBe('bridge timeout');
  });

  it('штатный резолв → 200 JSON', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { sources: unknown[] };
    expect(Array.isArray(body.sources)).toBe(true);
  });
});
