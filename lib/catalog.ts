import type { CatalogQuery, CatalogResult, Title } from './types';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { genreLabel, LENGTH_BUCKETS } from './labels';

/**
 * Каталог читается из файла на рантайме (сервер-only): JSON на 5000+ тайтлов
 НЕ пакуется в webpack-бандл (иначе сборка упирается в память), а читается один
 * раз на процесс с проверкой mtime (dev-friendly).
 */
let CACHE: { mtime: number; titles: Title[] } | null = null;
export function loadTitles(includeHidden = false): Title[] {
  const file = path.join(process.cwd(), 'lib', 'data', 'titles.json');
  const mtime = statSync(file).mtimeMs;
  if (CACHE && CACHE.mtime === mtime) return CACHE.titles;
  const titles = (JSON.parse(readFileSync(file, 'utf8')) as (Title & { hidden?: boolean })[]).filter((t) => includeHidden || !t.hidden);
  CACHE = { mtime, titles };
  return titles;
}

export const TITLES: Title[] = loadTitles();

export const PER_PAGE = 24;

let slugMapCache: { mtime: number; m: Map<string, Title> } | null = null;
let idMapCache: { mtime: number; m: Map<number, Title> } | null = null;
function mtimeNow(): number {
  // Всегда свежий stat: CACHE.mtime устаревает после записи titles.json
  // (скрытие тайтла из админки), и карты slug/id должны инвалидироваться.
  return statSync(path.join(process.cwd(), 'lib', 'data', 'titles.json')).mtimeMs;
}
function bySlugMap(): Map<string, Title> {
  const mt = mtimeNow();
  if (!slugMapCache || slugMapCache.mtime !== mt) slugMapCache = { mtime: mt, m: new Map(loadTitles().map((t) => [t.slug, t])) };
  return slugMapCache.m;
}
function byIdMap(): Map<number, Title> {
  const mt = mtimeNow();
  if (!idMapCache || idMapCache.mtime !== mt) idMapCache = { mtime: mt, m: new Map(loadTitles().map((t) => [t.anilistId, t])) };
  return idMapCache.m;
}
export const titleById = { get: (id: number) => byIdMap().get(id) } as unknown as Map<number, Title>;

export const getTitle = (slug: string) => bySlugMap().get(slug);

export function allTitles(): Title[] {
  return loadTitles();
}

/** Домашние подборки. */
export function homeRails() {
  const popular = [...loadTitles()].sort((a, b) => b.favourites - a.favourites).slice(0, 14);
  const top = [...loadTitles()].sort((a, b) => b.score - a.score).slice(0, 14);
  const fresh = [...loadTitles()]
    .filter((t) => t.year >= new Date().getFullYear() - 3)
    .sort((a, b) => b.year - a.year || b.favourites - a.favourites)
    .slice(0, 14);
  const ongoing = loadTitles().filter((t) => t.status === 'ongoing').sort((a, b) => b.favourites - a.favourites);
  const movies = loadTitles().filter((t) => t.type === 'movie').sort((a, b) => b.score - a.score).slice(0, 14);
  return { popular, top, fresh, ongoing, movies };
}

export function heroSlides(): Title[] {
  return [...TITLES]
    .filter((t) => t.banner)
    .sort((a, b) => b.favourites - a.favourites)
    .slice(0, 5);
}

export function genreStats(): { slug: string; count: number }[] {
  const map = new Map<string, number>();
  for (const t of loadTitles()) for (const g of t.genres) map.set(g, (map.get(g) ?? 0) + 1);
  return [...map.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .filter((g) => genreLabel(g.slug) !== g.slug || g.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function titlesByGenre(genre: string, sort: CatalogQuery['sort'] = 'pop'): Title[] {
  return sortTitles(loadTitles().filter((t) => t.genres.includes(genre)), sort);
}

export function sortTitles(items: Title[], sort: CatalogQuery['sort'] = 'pop'): Title[] {
  const arr = [...items];
  switch (sort) {
    case 'score':
      return arr.sort((a, b) => b.score - a.score || b.favourites - a.favourites);
    case 'new':
      return arr.sort((a, b) => b.year - a.year || b.favourites - a.favourites);
    case 'az':
      return arr.sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
    default:
      return arr.sort((a, b) => b.favourites - a.favourites);
  }
}

export function searchTitles(q: string, limit = 24): Title[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const terms = query.split(/\s+/);
  const scored: { t: Title; s: number }[] = [];
  for (const t of loadTitles()) {
    const ru = t.ru.toLowerCase();
    const shikiRu = (t.shikimori?.ru ?? '').toLowerCase();
    const rom = t.romaji.toLowerCase();
    const en = (t.en ?? '').toLowerCase();
    const genres = t.genres.map((g) => genreLabel(g).toLowerCase()).join(' ');
    let s = 0;
    for (const term of terms) {
      if (ru.startsWith(term)) s += 6;
      else if (ru.includes(term)) s += 4;
      if (shikiRu && shikiRu.includes(term)) s += 4;
      if (rom.startsWith(term)) s += 5;
      else if (rom.includes(term)) s += 3;
      if (en.includes(term)) s += 2;
      if (genres.includes(term)) s += 1;
      if (String(t.year) === term) s += 2;
    }
    if (s > 0) scored.push({ t, s: s + Math.log10(t.favourites + 1) });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t);
}

export function filterCatalog(query: CatalogQuery): CatalogResult {
  let items = loadTitles();
  if (query.q) items = searchTitles(query.q, 500);
  if (query.genres?.length) items = items.filter((t) => query.genres!.every((g) => t.genres.includes(g)));
  if (query.type) items = items.filter((t) => t.type === query.type);
  if (query.status) items = items.filter((t) => t.status === query.status);
  if (query.year) items = items.filter((t) => String(t.year) === query.year);
  if (query.yearFrom) items = items.filter((t) => t.year >= Number(query.yearFrom));
  if (query.yearTo) items = items.filter((t) => t.year <= Number(query.yearTo));
  if (query.length) {
    const bucket = LENGTH_BUCKETS[query.length];
    if (bucket) items = items.filter((t) => bucket.test(t.episodes));
  }
  items = sortTitles(items, query.sort);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(Math.max(1, query.page ?? 1), pages);
  return { items: items.slice((page - 1) * PER_PAGE, page * PER_PAGE), total, page, pages };
}

export function topTitles(limit = 250): Title[] {
  return [...loadTitles()].filter((t) => t.score > 0).sort((a, b) => b.score - a.score || b.favourites - a.favourites).slice(0, limit);
}

export function yearsAvailable(): number[] {
  return [...new Set(loadTitles().map((t) => t.year).filter((y) => y > 0))].sort((a, b) => b - a);
}

/** Похожие тайтлы: пересечение жанров + близкий год. */
export function similarTitles(title: Title, limit = 12): Title[] {
  return TITLES.filter((t) => t.slug !== title.slug)
    .map((t) => ({
      t,
      s:
        t.genres.filter((g) => title.genres.includes(g)).length * 2 +
        (t.type === title.type ? 1 : 0) -
        Math.min(3, Math.abs(t.year - title.year) / 5),
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t);
}
