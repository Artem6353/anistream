import { genreStats, titlesByGenre } from './catalog';
import { GENRE_LABELS } from './labels';
import { isGenreSlug, parseGenreSegment } from './genre-redirect';
import type { GenreSort } from './genre-redirect';
import { toCardTitle } from './catalog';
import type { CardTitle, Title } from './types';

/* Чистая (edge-safe) часть жанровых URL живёт в lib/genre-redirect.ts: её
   импортирует proxy.ts (edge-middleware), которому НЕЛЬЗЯ тянуть lib/catalog
   (node:fs недоступен в Edge Runtime — инцидент 2026-10-13: голые 500 на всех
   /api/* и /genre/*). Здесь остаются только хелперы, которым нужен каталог,
   плюс реэкспорт чистых — внешние импорты (страницы, компоненты, тесты)
   продолжают брать всё из '@/lib/genre-pages'. */
export {
  GENRE_MAX_REDIRECT_PAGE,
  GENRE_SORTS,
  GENRE_SORT_LABELS,
  genreHref,
  genreRedirectTarget,
  genreSegment,
  isGenreSlug,
  isGenreSort,
  parseGenreSegment,
} from './genre-redirect';
export type { GenreSort } from './genre-redirect';

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

export function genreSlugs(): string[] {
  return genreStats().map((g) => g.slug);
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
