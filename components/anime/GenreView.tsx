import Link from 'next/link';
import type { CardTitle } from '@/lib/types';
import { GENRE_LABELS } from '@/lib/labels';
import { PosterCard } from '@/components/anime/PosterCard';
import { plural } from '@/lib/format';
import {
  GENRE_PER_PAGE,
  GENRE_SORTS,
  GENRE_SORT_LABELS,
  genreHref,
  type GenreSort,
} from '@/lib/genre-pages';

/**
 * Представление страницы жанра (аудит 2026-10, ТЗ 2.2/3.3).
 *
 * Вынесено из app/genre/[slug]/page.tsx, потому что маршрутов теперь два:
 * /genre/[slug] (первая страница) и /genre/[slug]/[page] (пагинация и сортировки).
 * Оба должны выглядеть одинаково — иначе расхождение верстки между страницами.
 *
 * Пагинация обязательна: без неё /genre/comedy отдавал 19,6 МБ HTML (3495 карточек)
 * за 3,5–4,2 секунды и без кэша.
 */
export function GenreView({
  slug,
  label,
  items,
  total,
  page,
  pages,
  sort,
}: {
  slug: string;
  label: string;
  items: CardTitle[];
  total: number;
  page: number;
  pages: number;
  sort: GenreSort;
}) {
  const window: number[] = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, from + 4);
  for (let p = from; p <= to; p++) window.push(p);

  return (
    <div className="container">
      <nav className="crumbs" aria-label="Хлебные крошки">
        <Link href="/">Главная</Link>
        <span>/</span>
        <Link href="/genres">Жанры</Link>
        <span>/</span>
        <span>{label}</span>
      </nav>
      <header className="page-head">
        <h1>{label}</h1>
        <p>
          {total} {plural(total, ['тайтл', 'тайла', 'тайтлов'])} в подборке
          {pages > 1 ? ` · страница ${page} из ${pages}` : ''}.
        </p>
        <div className="chips">
          {GENRE_SORTS.map((key) => (
            <Link key={key} className={`chip ${sort === key ? 'is-active' : ''}`} href={genreHref(slug, key, 1)}>
              {GENRE_SORT_LABELS[key]}
            </Link>
          ))}
        </div>
      </header>

      <div className="poster-grid">
        {items.map((t) => (
          <PosterCard key={t.slug} title={t} />
        ))}
      </div>

      {!items.length ? (
        <p className="panel__note">
          В этом жанре пока нет тайтлов. Загляните в <Link href="/catalog">каталог</Link> или{' '}
          <Link href="/genres">список жанров</Link>.
        </p>
      ) : null}

      {pages > 1 ? (
        <nav className="pagination genre-pagination" aria-label="Страницы жанра">
          {page > 1 ? (
            <Link className="btn btn--outline btn--md" href={genreHref(slug, sort, page - 1)} rel="prev">
              ← Назад
            </Link>
          ) : (
            <span />
          )}
          <span className="pagination__pages">
            {window[0] > 1 ? (
              <>
                <Link className="chip" href={genreHref(slug, sort, 1)}>
                  1
                </Link>
                {window[0] > 2 ? <span className="pagination__gap">…</span> : null}
              </>
            ) : null}
            {window.map((p) => (
              <Link key={p} className={`chip ${p === page ? 'is-active' : ''}`} href={genreHref(slug, sort, p)} aria-current={p === page ? 'page' : undefined}>
                {p}
              </Link>
            ))}
            {window[window.length - 1] < pages ? (
              <>
                {window[window.length - 1] < pages - 1 ? <span className="pagination__gap">…</span> : null}
                <Link className="chip" href={genreHref(slug, sort, pages)}>
                  {pages}
                </Link>
              </>
            ) : null}
          </span>
          {page < pages ? (
            <Link className="btn btn--outline btn--md" href={genreHref(slug, sort, page + 1)} rel="next">
              Вперёд →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      <p className="panel__note genre-more">
        Нужны более точные фильтры (год, тип, статус, длина)? Откройте{' '}
        <Link href={`/catalog?genre=${encodeURIComponent(slug)}`}>каталог с фильтром «{label}»</Link>.
        Показаны первые {Math.min(total, GENRE_PER_PAGE * pages)} из {total}.
      </p>

      <p className="panel__note genre-related">
        Другие жанры:{' '}
        {Object.entries(GENRE_LABELS)
          .filter(([g]) => g !== slug)
          .slice(0, 8)
          .map(([g, name], i) => (
            <span key={g}>
              {i ? ', ' : ''}
              <Link href={`/genre/${g}`}>{name}</Link>
            </span>
          ))}
        .
      </p>
    </div>
  );
}
