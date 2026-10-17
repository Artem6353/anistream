import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Инцидент GSC 2026-10-17: «Проверка кода» → 21 невалидный элемент rich-results
 * «Укажите ratingCount или reviewCount»: aggregateRating без счётчика оценок
 * больше не принимается Google. Контракт: нет реального ratingCount — блока
 * aggregateRating в JSON-LD нет вовсе.
 */

const h = vi.hoisted(() => ({ getTitle: vi.fn() }));

vi.mock('@/lib/catalog', () => ({
  getTitle: h.getTitle,
  loadTitles: () => [],
  similarTitles: () => [],
}));

vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));

function ldBlocks(tree: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    const html = (el.props?.dangerouslySetInnerHTML as { __html?: string } | undefined)?.__html;
    if (typeof html === 'string' && el.props?.type === 'application/ld+json') {
      out.push(JSON.parse(html.replace(/\\u003c/g, '<')) as Record<string, unknown>);
    }
    walk(el.props?.children);
  };
  walk(tree);
  return out;
}

const base = {
  slug: 'test-title',
  anilistId: 1,
  ru: 'Тест',
  romaji: 'Test',
  year: 2020,
  type: 'tv',
  status: 'finished',
  episodes: 12,
  score: 7.4,
  favourites: 100,
  genres: ['action'],
  poster: 'https://s4.anilist.co/x.jpg',
  description: 'Описание',
};

beforeEach(() => {
  h.getTitle.mockReset();
});

describe('JSON-LD aggregateRating: валидность rich-results', () => {
  it('score есть, ratingCount нет → aggregateRating НЕ публикуется', async () => {
    h.getTitle.mockReturnValue({ ...base });
    const page = await import('../app/anime/[slug]/page');
    const tree = await page.default({ params: Promise.resolve({ slug: 'test-title' }) } as never);
    const lds = ldBlocks(tree);
    const series = lds.find((l) => l['@type'] === 'TVSeries');
    expect(series).toBeDefined();
    expect(series?.aggregateRating).toBeUndefined();
  });

  it('score и ratingCount есть → aggregateRating с ratingCount', async () => {
    h.getTitle.mockReturnValue({ ...base, ratingCount: 1234 });
    const page = await import('../app/anime/[slug]/page');
    const tree = await page.default({ params: Promise.resolve({ slug: 'test-title' }) } as never);
    const series = ldBlocks(tree).find((l) => l['@type'] === 'TVSeries');
    const rating = series?.aggregateRating as Record<string, unknown>;
    expect(rating.ratingValue).toBe(7.4);
    expect(rating.ratingCount).toBe(1234);
  });
});
