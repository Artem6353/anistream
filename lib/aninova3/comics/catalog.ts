/**
 * Каталог Comics (B1-E).
 *
 * Источник — тот же реестр (`store.ts`) и relation-граф, что и у страниц аниме.
 * Здесь нет ни одного внешнего запроса: индексы строятся один раз на процесс.
 *
 * Правила:
 * 1. В каталог попадают только произведения с публично пригодным русским
 *    названием (`SOURCE_VERIFIED` или `EDITORIALLY_VERIFIED`).
 * 2. Роль произведения (первоисточник / комикс по аниме / связанное) считается по
 *    тому же правилу направления, что и на страницах аниме (B1-D.1), — каталог не
 *    может утверждать больше, чем страница произведения.
 * 3. Фильтрация, поиск, сортировка и пагинация — серверные: клиент не получает
 *    весь массив произведений.
 */
import type { Title } from '@/lib/types';
import type { ComicWork } from './model';
import { classifyAdaptationDirection, hasPublicRussianTitle } from './model';
import type { ComicStore } from './store';

export type CatalogRole = 'source' | 'comic-by-anime' | 'related';

export const CATALOG_ROLE_LABELS: Record<CatalogRole, string> = {
  source: 'Первоисточник аниме',
  'comic-by-anime': 'Комикс по аниме',
  related: 'Связанное произведение',
};

export interface CatalogEntry {
  comic: ComicWork;
  title: string;
  role: CatalogRole;
  roleLabel: string;
  genres: string[];
  /** Сколько аниме указывают на это произведение как на первоисточник (по графу). */
  sourceAnimeCount: number;
  /** Нормализованное название для поиска. */
  search: string;
}

export interface CatalogQuery {
  q?: string;
  genre?: string;
  kind?: string;
  role?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface CatalogResult {
  items: CatalogEntry[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  facets: {
    genres: { value: string; count: number }[];
    kinds: { value: string; count: number }[];
    roles: { value: CatalogRole; label: string; count: number }[];
  };
  applied: { q: string; genre: string; kind: string; role: string; sort: string };
}

export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_SORTS = ['title', 'year', 'chapters', 'anime'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Нормализация для поиска: регистр, ё→е, пунктуация схлопывается. */
export function normalizeQuery(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();
}

/** Роль произведения по графу и тем же правилам направления, что на страницах. */
export function catalogRoleFor(comic: ComicWork, getTitle: TitleLookupFn): CatalogRole {
  let adaptsAnime = false;
  for (const animeId of comic.animeIds) {
    const anime = getTitle(animeId);
    if (!anime) continue;
    const evidence = classifyAdaptationDirection({
      animeSource: anime.source,
      animeYear: anime.year,
      comicYear: comic.year,
    });
    if (evidence.direction === 'comic-is-source' && evidence.confidence !== 'unknown') return 'source';
    if (evidence.direction === 'comic-adapts-anime' && evidence.confidence !== 'unknown') adaptsAnime = true;
  }
  return adaptsAnime ? 'comic-by-anime' : 'related';
}

export type TitleLookupFn = (id: number) => Title | undefined;

export function buildCatalogIndex(store: ComicStore, getTitle: TitleLookupFn): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const comic of store.list) {
    if (comic.isDemo) continue;
    if (!hasPublicRussianTitle(comic.verification)) continue;
    if (!comic.titleRu) continue;
    const role = catalogRoleFor(comic, getTitle);
    entries.push({
      comic,
      title: comic.titleRu,
      role,
      roleLabel: CATALOG_ROLE_LABELS[role],
      genres: comic.genres,
      sourceAnimeCount: comic.animeIds.length,
      /* B3-E: поиск — только по названию (в DB-режиме ещё и по подтверждённым",
         русским алиасам). Жанры ищутся фильтром, а не текстом: иначе одинаковый
         запрос в JSON- и DB-режиме давал бы разные результаты. */
      search: normalizeQuery(comic.titleRu),
    });
  }
  entries.sort(
    (a, b) =>
      a.title.localeCompare(b.title, 'ru') || (a.comic.externalIds.anilist ?? 0) - (b.comic.externalIds.anilist ?? 0),
  );
  return entries;
}

let INDEX_CACHE: { store: ComicStore; entries: CatalogEntry[] } | null = null;

export function catalogIndex(store: ComicStore, getTitle: TitleLookupFn): CatalogEntry[] {
  if (INDEX_CACHE && INDEX_CACHE.store === store) return INDEX_CACHE.entries;
  const entries = buildCatalogIndex(store, getTitle);
  INDEX_CACHE = { store, entries };
  return entries;
}

/** Только для тестов: сбросить кэш индекса. */
export function resetCatalogCache(): void {
  INDEX_CACHE = null;
}

function facetOf(entries: CatalogEntry[], pick: (entry: CatalogEntry) => string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const value of pick(entry)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ru'));
}

/**
 * Серверная выборка: поиск по русскому названию, фильтры по жанру/типу/роли,
 * сортировка и страница. Фасеты считаются по выборке без пагинации, чтобы фильтры
 * показывали реальные числа.
 */
export function queryCatalog(entries: CatalogEntry[], query: CatalogQuery = {}): CatalogResult {
  const pageSize = Math.min(96, Math.max(1, query.pageSize ?? CATALOG_PAGE_SIZE));
  const q = normalizeQuery(query.q ?? '');
  const genre = (query.genre ?? '').trim();
  const kind = (query.kind ?? '').trim();
  const role = (query.role ?? '').trim();
  const sort = (CATALOG_SORTS as readonly string[]).includes(query.sort ?? '') ? (query.sort as CatalogSort) : 'title';

  let items = entries;
  if (q) items = items.filter((entry) => entry.search.includes(q));
  if (genre) items = items.filter((entry) => entry.genres.includes(genre));
  if (kind) items = items.filter((entry) => entry.comic.kind === kind);
  if (role) items = items.filter((entry) => entry.role === role);

  const sorted = [...items];
  if (sort === 'year') sorted.sort((a, b) => (b.comic.year ?? 0) - (a.comic.year ?? 0) || a.title.localeCompare(b.title, 'ru'));
  else if (sort === 'chapters')
    sorted.sort((a, b) => (b.comic.totalChaptersKnown ?? 0) - (a.comic.totalChaptersKnown ?? 0) || a.title.localeCompare(b.title, 'ru'));
  else if (sort === 'anime') sorted.sort((a, b) => b.sourceAnimeCount - a.sourceAnimeCount || a.title.localeCompare(b.title, 'ru'));

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, query.page ?? 1));
  const start = (page - 1) * pageSize;

  const roleCounts = new Map<CatalogRole, number>();
  for (const entry of items) roleCounts.set(entry.role, (roleCounts.get(entry.role) ?? 0) + 1);

  return {
    items: sorted.slice(start, start + pageSize),
    total,
    page,
    pages,
    pageSize,
    facets: {
      genres: facetOf(items, (entry) => entry.genres),
      kinds: facetOf(items, (entry) => [entry.comic.kind]),
      roles: (Object.keys(CATALOG_ROLE_LABELS) as CatalogRole[]).map((value) => ({
        value,
        label: CATALOG_ROLE_LABELS[value],
        count: roleCounts.get(value) ?? 0,
      })),
    },
    applied: { q: query.q?.trim() ?? '', genre, kind, role, sort },
  };
}

/** Ссылка каталога с сохранением фильтров (пагинация и чипы не теряют состояние). */
export function catalogHref(
  query: CatalogQuery,
  patch: Partial<CatalogQuery>,
  base = '/preview/aninova-3/comics',
): string {
  const merged: CatalogQuery = { ...query, ...patch };
  const params = new URLSearchParams();
  if (merged.q) params.set('q', merged.q);
  if (merged.genre) params.set('genre', merged.genre);
  if (merged.kind) params.set('kind', merged.kind);
  if (merged.role) params.set('role', merged.role);
  if (merged.sort && merged.sort !== 'title') params.set('sort', merged.sort);
  if (merged.page && merged.page > 1) params.set('page', String(merged.page));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
