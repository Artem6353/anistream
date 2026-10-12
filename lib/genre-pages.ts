import { genreStats, titlesByGenre } from './catalog';
import { GENRE_LABELS } from './labels';
import { toCardTitle } from './catalog';
import type { CardTitle, Title } from './types';

/**
 * Страницы жанров (аудит 2026-10, ТЗ 2.2/3.2).
 *
 * Общие хелперы для маршрутов /genre/[slug] и /genre/[slug]/[page]: сортировка и
 * пагинация живут В ПУТИ, а не в query-параметрах. Причина — техническая: страница,
 * читающая searchParams, в App Router становится динамической, и Vercel отдаёт её
 * с cache-control: private, no-store. /genre/comedy из-за этого рендерился заново
 * на каждый запрос (3,5–4,2 с, 19,6 МБ HTML на 3495 карточек).
 */

/** Тайтлов на одной странице жанра: 60 — как ItemList в JSON-LD. */
export const GENRE_PER_PAGE = 60;

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

export function genreSlugs(): string[] {
  return genreStats().map((g) => g.slug);
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

export interface GenrePageData {
  slug: string;
  label: string;
  sort: GenreSort;
  page: number;
  pages: number;
  total: number;
  /** Тайтлы текущей страницы в лёгкой проекции CardTitle (не все — иначе 19 МБ HTML,
      и не полным Title — иначе описание/персонажи уезжают в RSC-payload каждой карточки). */
  items: CardTitle[];
  /** Все тайтлы жанра в выбранной сортировке — для JSON-LD ItemList (режется до 60). */
  all: Title[];
}

export function genrePage(slug: string, segment?: string): GenrePageData | null {
  if (!isGenreSlug(slug)) return null;
  const { sort, page } = parseGenreSegment(segment);
  const all = titlesByGenre(slug, sort);
  const pages = Math.max(1, Math.ceil(all.length / GENRE_PER_PAGE));
  const current = Math.min(Math.max(1, page), pages);
  return {
    slug,
    label: GENRE_LABELS[slug],
    sort,
    page: current,
    pages,
    total: all.length,
    items: all.slice((current - 1) * GENRE_PER_PAGE, current * GENRE_PER_PAGE).map(toCardTitle),
    all,
  };
}

/** Полный набор путей для generateStaticParams обоих маршрутов. */
export function genreStaticParams(): { slug: string }[] {
  return genreSlugs().map((slug) => ({ slug }));
}

/** Предрендер только пагинации по популярности (~400 страниц вместо ~1600):
 *  остальные сортировки Next дорисует on-demand и закэширует через ISR.
 *  Полный набор взорвал бы время сборки на раннере Vercel. */
export function genrePageStaticParams(): { slug: string; page: string }[] {
  const out: { slug: string; page: string }[] = [];
  for (const slug of genreSlugs()) {
    const pages = Math.max(1, Math.ceil(titlesByGenre(slug, 'pop').length / GENRE_PER_PAGE));
    for (let p = 2; p <= pages; p++) out.push({ slug, page: `pop-${p}` });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Редиректы со старых URL жанров (аудит 2026-10, задача 3).
 *
 * Сортировка и пагинация переехали из query в сегменты пути, а ссылки вида
 * /genre/comedy?sort=score&page=2 остались в индексе и во внешних ссылках.
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
     целевой путь совпадает (?page=1, ?sort=bad, ?utm_source=…), параметры нужно
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
