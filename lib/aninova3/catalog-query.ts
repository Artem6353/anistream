import type { CatalogQuery, SortKey, TitleStatus, TitleType } from '@/lib/types';
import { GENRE_LABELS, LENGTH_BUCKETS, STATUS_LABELS, TYPE_LABELS } from '@/lib/labels';

export const A3_CATALOG_ROOT = '/preview/aninova-3/catalog';

const asString = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Разбор query для preview-каталога: те же правила, что у production /catalog. */
export function parseA3CatalogQuery(sp: Record<string, string | string[] | undefined>): CatalogQuery {
  const pageRaw = Number.parseInt(asString(sp.page) || '1', 10);
  return {
    q: asString(sp.q),
    genres: sp.genre ? (Array.isArray(sp.genre) ? sp.genre : [sp.genre]) : [],
    type: asString(sp.type) as TitleType | '',
    status: asString(sp.status) as TitleStatus | '',
    year: asString(sp.year),
    yearFrom: asString(sp.year_from),
    yearTo: asString(sp.year_to),
    length: asString(sp.length) as CatalogQuery['length'],
    view: asString(sp.view) === 'grid' ? 'grid' : 'list',
    sort: (asString(sp.sort) as SortKey) || 'pop',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };
}

/** Собрать ссылку каталога, сохранив текущие фильтры и применив patch. */
export function a3CatalogHref(q: CatalogQuery, patch: Record<string, string | null | undefined> = {}): string {
  const p = new URLSearchParams();
  const put = (key: string, value: string | null | undefined) => {
    if (value) p.set(key, value);
  };
  put('q', q.q);
  q.genres?.forEach((g) => p.append('genre', g));
  put('type', q.type);
  put('status', q.status);
  put('year_from', q.yearFrom);
  put('year_to', q.yearTo);
  put('length', q.length);
  put('sort', q.sort && q.sort !== 'pop' ? q.sort : null);
  put('view', q.view === 'grid' ? 'grid' : null);
  if (q.page && q.page > 1) put('page', String(q.page));

  for (const [k, v] of Object.entries(patch)) {
    if (k === 'genre') {
      p.delete('genre');
      if (v) p.append('genre', v);
      continue;
    }
    if (k === 'genreAdd') {
      if (v) p.append('genre', v);
      continue;
    }
    if (k === 'genreDel') {
      const all = p.getAll('genre').filter((g) => g !== v);
      p.delete('genre');
      all.forEach((g) => p.append('genre', g));
      continue;
    }
    if (v) p.set(k, v);
    else p.delete(k);
  }
  // Любое изменение фильтра возвращает на первую страницу.
  if (!('page' in patch)) p.delete('page');
  const s = p.toString();
  return `${A3_CATALOG_ROOT}${s ? `?${s}` : ''}`;
}

/** Активные фильтры для строки «выбрано» — каждый со своей ссылкой снятия. */
export function activeFilters(q: CatalogQuery): { key: string; label: string; href: string }[] {
  const list: { key: string; label: string; href: string }[] = [];
  if (q.q) list.push({ key: 'q', label: `«${q.q}»`, href: a3CatalogHref(q, { q: null }) });
  for (const g of q.genres ?? []) list.push({ key: `genre-${g}`, label: GENRE_LABELS[g] ?? g, href: a3CatalogHref(q, { genreDel: g }) });
  if (q.type) list.push({ key: 'type', label: TYPE_LABELS[q.type], href: a3CatalogHref(q, { type: null }) });
  if (q.status) list.push({ key: 'status', label: STATUS_LABELS[q.status], href: a3CatalogHref(q, { status: null }) });
  if (q.yearFrom || q.yearTo) {
    list.push({ key: 'years', label: `годы: ${q.yearFrom || '…'}–${q.yearTo || '…'}`, href: a3CatalogHref(q, { year_from: null, year_to: null }) });
  }
  if (q.length) list.push({ key: 'length', label: LENGTH_BUCKETS[q.length]?.label ?? q.length, href: a3CatalogHref(q, { length: null }) });
  return list;
}
