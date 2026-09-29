import type { CardTitle, CatalogQuery, CatalogResult, Title } from './types';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { genreLabel, LENGTH_BUCKETS } from './labels';

/**
 * Каталог читается из файла на рантайме (сервер-only): JSON на 5000+ тайтлов
 НЕ пакуется в webpack-бандл (иначе сборка упирается в память), а читается один
 * раз на процесс с проверкой mtime (dev-friendly).
 */
/* Аудит 30.09 (P2-15/16): кэш больше не смешивает варианты includeHidden —
   в памяти держим СЫРОЙ список, фильтрация выполняется на каждый вызов (дешёво),
   поэтому админское «скрыть тайтл» сразу видно и в каталоге, и в sitemap,
   и в similarTitles/heroSlides/schedule (раньше часть кода читала застывшую
   константу TITLES и продолжала показывать скрытое). */
let RAW: { mtime: number; titles: (Title & { hidden?: boolean })[] } | null = null;
const TITLES_FILE = () => path.join(process.cwd(), 'lib', 'data', 'titles.json');

function rawTitles(): (Title & { hidden?: boolean })[] {
  const mtime = statSync(TITLES_FILE()).mtimeMs;
  if (RAW && RAW.mtime === mtime) return RAW.titles;
  const titles = JSON.parse(readFileSync(TITLES_FILE(), 'utf8')) as (Title & { hidden?: boolean })[];
  RAW = { mtime, titles };
  return titles;
}

export function loadTitles(includeHidden = false): Title[] {
  const titles = rawTitles();
  return includeHidden ? titles : titles.filter((t) => !t.hidden);
}

/** @deprecated Используйте loadTitles(): константа не инвалидируется после записи
 *  titles.json (скрытие из админки). Сохранена для совместимости импортов. */
export const TITLES: Title[] = loadTitles();

export const PER_PAGE = 24;

let slugMapCache: { mtime: number; m: Map<string, Title> } | null = null;
let idMapCache: { mtime: number; m: Map<number, Title> } | null = null;
function mtimeNow(): number {
  // Всегда свежий stat: кэш устаревает после записи titles.json
  // (скрытие тайтла из админки), и карты slug/id должны инвалидироваться.
  return statSync(TITLES_FILE()).mtimeMs;
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
/* Аудит 30.09 (стиль-5): больше не фейковый Map через as unknown as —
   честный lookup-объект (get/has) с mtime-инвалидацией; watchOrder принимает TitleLookup. */
export const titleById: { get(id: number): Title | undefined; has(id: number): boolean } = {
  get: (id: number) => byIdMap().get(id),
  has: (id: number) => byIdMap().has(id),
};

export const getTitle = (slug: string) => bySlugMap().get(slug);

export function allTitles(): Title[] {
  return loadTitles();
}

/** Домашние подборки. S2.1 (аудит 28.09): рельсы главной урезаны 14→10, онгоинги —
    со 178+ (рендерились ВСЕ) до 10: вес SSR-HTML главной 1081→≤600 КБ, DOM/flight легче. */
export const HOME_RAIL_SIZE = 10;
export function homeRails() {
  const popular = [...loadTitles()].sort((a, b) => b.favourites - a.favourites).slice(0, HOME_RAIL_SIZE);
  const top = [...loadTitles()].sort((a, b) => b.score - a.score).slice(0, HOME_RAIL_SIZE);
  const fresh = [...loadTitles()]
    .filter((t) => t.year >= new Date().getFullYear() - 3)
    .sort((a, b) => b.year - a.year || b.favourites - a.favourites)
    .slice(0, HOME_RAIL_SIZE);
  const ongoing = loadTitles()
    .filter((t) => t.status === 'ongoing')
    .sort((a, b) => b.favourites - a.favourites)
    .slice(0, HOME_RAIL_SIZE);
  const movies = loadTitles().filter((t) => t.type === 'movie').sort((a, b) => b.score - a.score).slice(0, HOME_RAIL_SIZE);
  return { popular, top, fresh, ongoing, movies };
}

export function heroSlides(): Title[] {
  return [...loadTitles()]
    .filter((t) => t.banner)
    .sort((a, b) => b.favourites - a.favourites)
    .slice(0, 5);
}

/** S2.2: урезать Title до полей карточки перед передачей в PosterCard — иначе полный
    объект (описание/персонажи/airing, ~2.7 КБ) сериализуется в RSC-payload на каждую карточку. */
export function toCardTitle(t: Title): CardTitle {
  return {
    slug: t.slug,
    ru: t.ru,
    romaji: t.romaji,
    type: t.type,
    year: t.year,
    status: t.status,
    episodes: t.episodes,
    score: t.score,
    genres: t.genres.slice(0, 3),
    poster: t.poster,
  };
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

/** ТЗ Jikan блок 5: Jikan-тайтлы не вытесняют AniList из топов — пенальти 0.95. */
const effScore = (t: Title) => (t.metaSource === 'jikan' ? t.score * 0.95 : t.score);
const effPop = (t: Title) => (t.metaSource === 'jikan' ? t.favourites * 0.95 : t.favourites);

export function sortTitles(items: Title[], sort: CatalogQuery['sort'] = 'pop'): Title[] {
  const arr = [...items];
  switch (sort) {
    case 'score':
      return arr.sort((a, b) => effScore(b) - effScore(a) || effPop(b) - effPop(a));
    case 'new':
      return arr.sort((a, b) => b.year - a.year || b.favourites - a.favourites);
    case 'az':
      return arr.sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
    default:
      return arr.sort((a, b) => effPop(b) - effPop(a));
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
  /* Аудит 30.09 (P2-17): ?page=abc → Number()=NaN → slice(NaN,NaN)=[] — пустая
     выдача вместо первой страницы. Санитизируем до клампа. */
  const rawPage = query.page ?? 1;
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, Math.trunc(rawPage)), pages) : 1;
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
  return loadTitles().filter((t) => t.slug !== title.slug)
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
