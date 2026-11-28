/**
 * B3-E: единый контракт параметров каталога Comics.
 *
 * Один и тот же разбор используют DB-каталог (/api/comics и preview-страница)
 * и прежний JSON-каталог, поэтому фильтры, сортировка и границы страницы не
 * расходятся между режимами. Значения валидируются: неизвестный kind/role/sort
 * не попадает в SQL-запрос и не превращается в ошибку 500.
 */
import type { ComicKind } from './model';
import { CATALOG_PAGE_SIZE, CATALOG_ROLE_LABELS, CATALOG_SORTS, type CatalogRole, type CatalogSort } from './catalog';

export const CATALOG_KINDS: readonly ComicKind[] = [
  'manga',
  'manhwa',
  'manhua',
  'webtoon',
  'comic',
  'one_shot',
  'unknown',
];

export const CATALOG_ROLES = Object.keys(CATALOG_ROLE_LABELS) as CatalogRole[];
export const CATALOG_MAX_QUERY_LENGTH = 120;
export const CATALOG_MAX_PAGE = 10_000;
export const CATALOG_MAX_PAGE_SIZE = 96;

export interface ComicsCatalogQuery {
  q: string;
  genre: string;
  kind: ComicKind | null;
  role: CatalogRole | null;
  sort: CatalogSort;
  page: number;
  pageSize: number;
}

export type SearchParamsInput = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** Убирает управляющие символы и метасимволы PostgREST, сохраняя текст запроса. */
export function sanitizeSearchTerm(value: string): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[,()*"{}\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CATALOG_MAX_QUERY_LENGTH);
}

function sanitizeFacetValue(value: string): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[,()*"{}\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function parseComicsCatalogQuery(input: SearchParamsInput = {}): ComicsCatalogQuery {
  const rawPage = Number.parseInt(single(input.page), 10);
  const rawPageSize = Number.parseInt(single(input.pageSize), 10);
  const kind = single(input.kind).trim();
  const role = single(input.role).trim();
  const sort = single(input.sort).trim();

  return {
    q: sanitizeSearchTerm(single(input.q)),
    genre: sanitizeFacetValue(single(input.genre)),
    kind: (CATALOG_KINDS as readonly string[]).includes(kind) ? (kind as ComicKind) : null,
    role: (CATALOG_ROLES as readonly string[]).includes(role) ? (role as CatalogRole) : null,
    sort: ((CATALOG_SORTS as readonly string[]).includes(sort) ? sort : 'title') as CatalogSort,
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, CATALOG_MAX_PAGE) : 1,
    pageSize:
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? Math.min(rawPageSize, CATALOG_MAX_PAGE_SIZE)
        : CATALOG_PAGE_SIZE,
  };
}
