import { loadTitles } from './catalog';
import type { Title } from './types';

/** Простая жанровая аффинность: веса жанров из тайтлов пользователя → топ непосмотренного. */
export function topByGenres(slugs: string[], limit = 12): Title[] {
  const all = loadTitles();
  const bySlug = new Map(all.map((t) => [t.slug, t]));
  const weights = new Map<string, number>();
  for (const s of slugs) {
    const t = bySlug.get(s);
    if (!t) continue;
    for (const g of t.genres) weights.set(g, (weights.get(g) ?? 0) + 1);
  }
  if (!weights.size) return [];
  const seen = new Set(slugs);
  return all
    .filter((t) => !seen.has(t.slug))
    .map((t) => ({ t, score: t.genres.reduce((a, g) => a + (weights.get(g) ?? 0), 0) * 10 + t.score }))
    .filter((x) => x.score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}

