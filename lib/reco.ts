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


/** Топ по одному жанру среди непросмотренного (автоподборки, ТЗ блок 21). */
export function topByGenre(genre: string, excludeSlugs: string[], limit = 10): Title[] {
  const seen = new Set(excludeSlugs);
  return loadTitles()
    .filter((t) => t.genres.includes(genre) && !seen.has(t.slug) && t.status !== 'upcoming')
    .sort((a, b) => b.favourites + b.score * 500 - (a.favourites + a.score * 500))
    .slice(0, limit);
}

/** Коллаборативная фильтрация (ТЗ блок 21): похожие пользователи по пересечению
    историй (profile_history всех пользователей, service key на стороне route).
    Возвращает веса slug → score по вкладу похожих пользователей. */
export function collaborativeScores(mySlugs: string[], otherHistories: Array<{ user_id: string; slug: string }>): Map<string, number> {
  const byUser = new Map<string, Set<string>>();
  for (const h of otherHistories) {
    if (!byUser.has(h.user_id)) byUser.set(h.user_id, new Set());
    byUser.get(h.user_id)!.add(h.slug);
  }
  const mine = new Set(mySlugs);
  const scores = new Map<string, number>();
  for (const [, slugs] of byUser) {
    let inter = 0;
    for (const s of slugs) if (mine.has(s)) inter++;
    if (inter < 2) continue; // похожими считаем от 2 общих тайтлов
    const sim = inter / Math.min(slugs.size, mine.size || 1);
    for (const s of slugs) {
      if (mine.has(s)) continue;
      scores.set(s, (scores.get(s) ?? 0) + sim);
    }
  }
  return scores;
}

/** Гибрид: контентная жанровая аффинность + коллаборативный буст (ТЗ блок 21). */
export function hybridReco(mySlugs: string[], collab: Map<string, number>, limit = 12): Title[] {
  const all = loadTitles();
  const bySlug = new Map(all.map((t) => [t.slug, t]));
  const weights = new Map<string, number>();
  for (const s of mySlugs) {
    const t = bySlug.get(s);
    if (!t) continue;
    for (const g of t.genres) weights.set(g, (weights.get(g) ?? 0) + 1);
  }
  const seen = new Set(mySlugs);
  return all
    .filter((t) => !seen.has(t.slug) && t.status !== 'upcoming')
    .map((t) => ({
      t,
      score: t.genres.reduce((a, g) => a + (weights.get(g) ?? 0), 0) * 10 + t.score + (collab.get(t.slug) ?? 0) * 200,
    }))
    .filter((x) => x.score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}
