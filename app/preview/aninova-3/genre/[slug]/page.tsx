import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { genrePage } from '@/lib/genre-pages';
import { titlesByGenre, toCardTitle } from '@/lib/catalog';
import { GENRE_LABELS, SORT_LABELS } from '@/lib/labels';
import { plural } from '@/lib/format';
import { A3Card } from '@/components/aninova3/A3Card';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';
import { previewCardTitle } from '@/lib/aninova3/public-title';

const PER_PAGE = 24;
const SORTS = ['pop', 'score', 'new', 'az'] as const;
type Sort = (typeof SORTS)[number];

function parseSort(value?: string): Sort {
  return value && SORTS.includes(value as Sort) ? (value as Sort) : 'pop';
}

function sortHref(slug: string, sort: Sort, page = 1) {
  const params = new URLSearchParams();
  if (sort !== 'pop') params.set('sort', sort);
  if (page > 1) params.set('page', String(page));
  const suffix = params.toString();
  return `${PREVIEW_ROOT}/genre/${slug}${suffix ? `?${suffix}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = genrePage(slug);
  if (!data) notFound();
  return {
    title: `Аниме жанра ${data.label}`,
    description: `${data.total} ${plural(data.total, ['тайтл', 'тайтла', 'тайтлов'])} жанра ${data.label} в каталоге AniNova.`,
    robots: { index: false, follow: false },
    alternates: { canonical: `${PREVIEW_ROOT}/genre/${slug}` },
  };
}

export default async function PreviewGenrePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string | string[]; page?: string | string[] }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const base = genrePage(slug);
  if (!base) notFound();
  const sort = parseSort(Array.isArray(sp.sort) ? sp.sort[0] : sp.sort);
  const rawPage = Number.parseInt(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? '1', 10);
  const all = titlesByGenre(slug, sort);
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, Math.trunc(rawPage)), pages) : 1;
  if (rawPage > pages) notFound();
  const items = all.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(toCardTitle).map(previewCardTitle);
  const label = GENRE_LABELS[slug] ?? base.label;

  return (
    <div className="a3-wrap a3-utility">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={PREVIEW_ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <Link href={`${PREVIEW_ROOT}/genres`}>Жанры</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{label}</span>
      </nav>
      <header className="a3-pagehead">
        <p className="a3-kicker">Подборка жанра</p>
        <h1 className="a3-h1">Аниме жанра {label}</h1>
        <p className="a3-pagehead__lead">
          {all.length} {plural(all.length, ['тайтл', 'тайтла', 'тайтлов'])}. Сортировка: {SORT_LABELS[sort] ?? sort}.
        </p>
      </header>

      <nav className="a3-chips a3-chips--inline a3-sortchips" aria-label="Сортировка жанра">
        {SORTS.map((s) => (
          <Link
            key={s}
            className={`a3-chip${s === sort ? ' is-on' : ''}`}
            href={sortHref(slug, s)}
            aria-current={s === sort ? 'page' : undefined}
          >
            {SORT_LABELS[s] ?? s}
          </Link>
        ))}
      </nav>

      {items.length ? (
        <div className="a3-grid">
          {items.map((title) => <A3Card key={title.slug} title={title} />)}
        </div>
      ) : (
        <div className="a3-empty">
          <h2 className="a3-empty__title">В этом жанре пока нет тайтлов</h2>
          <Link className="a3-link" href={`${PREVIEW_ROOT}/genres`}>Другие жанры →</Link>
        </div>
      )}

      {pages > 1 ? (
        <nav className="a3-pagination" aria-label="Страницы жанра">
          {page > 1 ? <Link className="a3-pagebtn" href={sortHref(slug, sort, page - 1)} rel="prev">← Назад</Link> : <span className="a3-pagebtn is-disabled" aria-disabled="true">← Назад</span>}
          <span className="a3-muted">Страница {page} из {pages}</span>
          {page < pages ? <Link className="a3-pagebtn" href={sortHref(slug, sort, page + 1)} rel="next">Вперёд →</Link> : <span className="a3-pagebtn is-disabled" aria-disabled="true">Вперёд →</span>}
        </nav>
      ) : null}
    </div>
  );
}
