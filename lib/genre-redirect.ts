import { GENRE_LABELS } from './labels';

/**
 * Чистая (edge-safe) часть логики жанровых URL: сортировки/пагинация/редиректы.
 *
 * ВЫДЕЛЕНО ИЗ lib/genre-pages.ts ПОСЛЕ ИНЦИДЕНТА 2026-10-13: proxy.ts (edge-
 * middleware, matcher ['/api/:path*', '/genre/:path*']) импортировал
 * genreRedirectTarget из lib/genre-pages, а тот модуль сверху тянет lib/catalog
 * (node:fs + statSync/readFileSync в module-scope: `export const TITLES =
 * loadTitles()`). В Edge Runtime node:fs не существует — module-scope middleware
 * падал с TypeError, и Vercel отвечал голым «Internal Server Error» (500) на весь
 * matcher: все /api/* (включая /api/providers/[slug]/[episode]) и /genre/*,
 * пока статика/ISR без matcher продолжали отдавать 200.
 *
 * Правило: этот файл НЕ имеет права импортировать ничего, что транзитивно
 * достаёт node:*-модули или lib/catalog (проверка — tests/edge-import-guard.test.ts).
 * Всё содержимое — чистые функции и константы из lib/labels.
 */

export type GenreSort = 'pop' | 'score' | 'new' | 'az';

export const GENRE_SORTS: GenreSort[] = ['pop', 'score', 'new', 'az'];

export const GENRE_SORT_LABELS: Record<GenreSort, string> = {
  pop: 'популярные',
  score: 'с высоким рейтингом',
  new: 'новые',
  az: 'по алфавиту',
};

export function isGenreSlug(slug: string): boolean {
  return Boolean(GENRE_LABELS[slug]);
}

/** «score-2» → { sort: 'score', page: 2 }; пустое/мусорное → первая страница по популярности. */
export function parseGenreSegment(raw: string | undefined): { sort: GenreSort; page: number } {
  if (!raw) return { sort: 'pop', page: 1 };
  const m = raw.match(/^(pop|score|new|az)-(\d+)$/);
  if (!m) return { sort: 'pop', page: 1 };
  const page = Number(m[2]);
  return { sort: m[1] as GenreSort, page: Number.isFinite(page) && page > 1 ? page : 1 };
}

export function genreSegment(sort: GenreSort, page: number): string | null {
  if (page <= 1 && sort === 'pop') return null;
  return `${sort}-${page}`;
}

export function genreHref(slug: string, sort: GenreSort, page: number): string {
  const seg = genreSegment(sort, page);
  return seg ? `/genre/${slug}/${seg}` : `/genre/${slug}`;
}

/* ---------------------------------------------------------------------------
 * Редиректы со старых URL жанров (аудит 2026-10, задача 3).
 *
 * Сортировка и пагинация переехали из query в сегменты пути, а ссылки вида
 * /genre/comedy?sort=score&page=2 остались в индексе Google и во внешних ссылках.
 * Правило считается здесь (чистая функция, покрыта тестами), а применяется в
 * proxy.ts — страницы жанров searchParams не читают и остаются статическими.
 * ------------------------------------------------------------------------- */

/** Потолок номера страницы в редиректе: за ним честно отдаём 404, а не базовый URL. */
export const GENRE_MAX_REDIRECT_PAGE = Number(process.env.GENRE_MAX_REDIRECT_PAGE ?? 200);

export function isGenreSort(value: string | null | undefined): value is GenreSort {
  return value === 'pop' || value === 'score' || value === 'new' || value === 'az';
}

/**
 * Куда редиректить старый URL жанра. null — редирект не нужен.
 *
 *  /genre/comedy?sort=pop&page=2 → /genre/comedy/pop-2
 *  /genre/comedy?sort=score      → /genre/comedy/score-1   (номер 1 обязателен:
 *                                   /genre/comedy — это всегда «популярные», стр. 1)
 *  /genre/comedy?page=1          → /genre/comedy           (базовый URL)
 *  /genre/comedy?sort=bad        → /genre/comedy           (неизвестная сортировка;
 *                                   page из того же URL учитывается: ?sort=bad&page=2
 *                                   → /genre/comedy/pop-2, а не потеря номера страницы)
 *  /genre/comedy?page=abc        → /genre/comedy           (нечисло)
 *  /genre/comedy?page=0|-3|99999 → /genre/comedy           (вне диапазона)
 *  /genre/comedy                 → null                   (уже чистый, редирект не нужен)
 *  /genre/comedy?utm_source=tg   → /genre/comedy           (query сбрасывается)
 *  /genre/comedy/pop-2?sort=new  → null                   (сегмент пути важнее query)
 *  utm и прочие параметры отбрасываются: целевой URL собирается с нуля.
 */
export function genreRedirectTarget(pathname: string, search: URLSearchParams | Record<string, string | undefined>): string | null {
  const parts = pathname.split('/').filter(Boolean); // ['genre', slug, segment?]
  if (parts.length < 2 || parts[0] !== 'genre') return null;
  const slug = parts[1];
  if (!isGenreSlug(slug)) return null; // 404 обработает страница, не прокси
  if (parts.length > 2) return null; // уже новый формат — не трогаем

  const get = (key: string): string | null => {
    const v = search instanceof URLSearchParams ? search.get(key) : (search[key] ?? null);
    return v === null || v === '' ? null : v;
  };
  /* Любой query на каноническом URL жанра — уже повод для редиректа: даже когда
     целевой путь совпадает (?page=1, ?sort=bad, ?utm_source…), параметры нужно
     сбросить, иначе одна страница остаётся доступной по десятку адресов. */
  const hadQuery = [...searchKeys(search)].length > 0;

  const rawSort = get('sort');
  const rawPage = get('page');
  if (rawSort === null && rawPage === null) return hadQuery ? `/genre/${slug}` : null;

  const sort: GenreSort = isGenreSort(rawSort) ? rawSort : 'pop';
  let page = 1;
  if (rawPage !== null) {
    if (!/^\d+$/.test(rawPage)) return `/genre/${slug}`; // нечисло → базовый
    const parsed = Number(rawPage);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > GENRE_MAX_REDIRECT_PAGE) return `/genre/${slug}`;
    page = parsed;
  }

  const segment = genreSegment(sort, page);
  const target = segment ? `/genre/${slug}/${segment}` : `/genre/${slug}`;
  /* Совпало с исходным путём — редирект всё равно нужен, если был query.
     Без query это тот же адрес: возвращаем null, чтобы не создать цикл. */
  return target === pathname && !hadQuery ? null : target;
}

function* searchKeys(search: URLSearchParams | Record<string, string | undefined>): Generator<string> {
  if (search instanceof URLSearchParams) {
    for (const key of search.keys()) yield key;
    return;
  }
  for (const [key, value] of Object.entries(search)) if (value !== undefined && value !== '') yield key;
}
