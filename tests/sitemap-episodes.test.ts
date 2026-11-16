import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Регресс P1-7: в sitemap/3 не было НИ ОДНОЙ страницы серий у онгоингов с
 * необъявленным итогом (`episodes: null`) — включая «Ван-Пис» (episodes: null,
 * episodesReleased: 1134): граница бралась из поля «итог», а не из числа
 * вышедших серий. Тест фиксирует, что URL серий строятся по единому правилу
 * lib/episodes.ts (airing/epdates/episodesReleased).
 *
 * Внешние сервисы не вызываются: каталог и реестр источников подменены vi.mock.
 */

const title = vi.hoisted(() => ({
  anilistId: 21,
  slug: 'one-piece',
  ru: 'Ван-Пис (1999)',
  romaji: 'ONE PIECE',
  type: 'tv' as const,
  status: 'ongoing' as const,
  year: 1999,
  // Итог сезона не объявлен — главный кейс бага.
  episodes: null as number | null,
  episodesReleased: 1134,
  score: 8.7,
  favourites: 100000,
  genres: ['action'],
  poster: '',
  description: '',
  airing: Array.from({ length: 12 }, (_, i) => ({ ep: 1123 + i, at: 1_700_000_000_000 + i * 86_400_000 })),
}));

vi.mock('@/lib/catalog', () => ({
  allTitles: () => [title],
  genreStats: () => [],
  loadTitles: () => [title],
  similarTitles: () => [],
}));
vi.mock('@/lib/episode-sources', () => ({
  episodeSourcesDbConfigured: () => true,
  titleHasSources: async () => true,
}));

afterEach(() => {
  vi.resetModules();
});

describe('sitemap/3: страницы серий онгоингов с episodes: null', () => {
  it('строит URL по числу вышедших серий, а не по итогу', async () => {
    const { buildSitemap } = await import('@/lib/sitemap');
    const entries = await buildSitemap('3', 'https://aninova.example');
    expect(entries.length).toBe(50); // потолок на тайтл
    expect(entries[0].url).toBe('https://aninova.example/anime/one-piece/1');
    expect(entries[49].url).toBe('https://aninova.example/anime/one-piece/50');
  });

  it('без подтверждённых источников страницы серий не публикуются', async () => {
    vi.doMock('@/lib/episode-sources', () => ({
      episodeSourcesDbConfigured: () => true,
      titleHasSources: async () => false,
    }));
    vi.resetModules();
    const { buildSitemap } = await import('@/lib/sitemap');
    await expect(buildSitemap('3', 'https://aninova.example')).resolves.toEqual([]);
    vi.doUnmock('@/lib/episode-sources');
  });
});
