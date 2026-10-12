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
