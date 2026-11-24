import { searchTitles, toCardTitle } from '@/lib/catalog';
import type { CardTitle } from '@/lib/types';
import { previewCardTitle } from './public-title';

export const SEARCH_PER_PAGE = 24;
export const SEARCH_MAX_QUERY = 120;

export interface SearchResultPage {
  query: string;
  items: CardTitle[];
  total: number;
  page: number;
  pages: number;
}

/** B2-D: серверная страница результатов. Каталог не уезжает в браузер —
 *  наружу отдаём только текущую страницу лёгкой проекции. */
export function searchResults(rawQuery: string, rawPage = 1): SearchResultPage {
  const query = rawQuery.trim().slice(0, SEARCH_MAX_QUERY);
  if (!query) return { query: '', items: [], total: 0, page: 1, pages: 1 };
  const all = searchTitles(query, Number.MAX_SAFE_INTEGER);
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / SEARCH_PER_PAGE));
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, Math.trunc(rawPage)), pages) : 1;
  return {
    query,
    items: all.slice((page - 1) * SEARCH_PER_PAGE, page * SEARCH_PER_PAGE).map(toCardTitle).map(previewCardTitle),
    total,
    page,
    pages,
  };
}
