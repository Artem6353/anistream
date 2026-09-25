import type { Metadata } from 'next';
import Link from 'next/link';
import { filterCatalog, genreStats, yearsAvailable } from '@/lib/catalog';
import type { CatalogQuery, SortKey, TitleStatus, TitleType } from '@/lib/types';
import { GENRE_LABELS, LENGTH_BUCKETS, SORT_LABELS, STATUS_LABELS, TYPE_LABELS } from '@/lib/labels';
import { PosterCard } from '@/components/anime/PosterCard';
import { PosterRow } from '@/components/anime/PosterRow';
import { Pagination } from '@/components/anime/Pagination';
import { SortSelect } from '@/components/anime/SortSelect';
import { IconGrid, IconList } from '@/components/ui/icons';

export const revalidate = 1800;
export const metadata: Metadata = {
  title: 'Каталог аниме онлайн — все тайтлы, фильтры и жанры — AniNova',
  alternates: { canonical: '/catalog' },
  description: 'Полный каталог аниме: фильтры по годам, жанрам, типу, статусу и длине; виды «сетка» и «список».',
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const asString = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CatalogPage({ searchParams }: Props) {
  const sp = await searchParams;
  const query: CatalogQuery = {
    q: asString(sp.q) ?? '',
    genres: sp.genre ? (Array.isArray(sp.genre) ? sp.genre : [sp.genre]) : [],
    type: (asString(sp.type) as TitleType) ?? '',
    status: (asString(sp.status) as TitleStatus) ?? '',
    year: asString(sp.year) ?? '',
    yearFrom: asString(sp.year_from) ?? '',
    yearTo: asString(sp.year_to) ?? '',
    length: (asString(sp.length) as CatalogQuery['length']) ?? '',
    view: asString(sp.view) === 'list' ? 'list' : 'grid',
    sort: (asString(sp.sort) as SortKey) ?? 'pop',
    page: Number(asString(sp.page) ?? 1),
  };
  const result = filterCatalog(query);
  const years = yearsAvailable();
  const genres = genreStats();

  const href = (page: number) => {
    const p = new URLSearchParams();
    if (query.q) p.set('q', query.q);
    query.genres?.forEach((g) => p.append('genre', g));
    if (query.type) p.set('type', query.type);
    if (query.status) p.set('status', query.status);
    if (query.yearFrom) p.set('year_from', query.yearFrom);
    if (query.yearTo) p.set('year_to', query.yearTo);
    if (query.length) p.set('length', query.length);
    if (query.view === 'list') p.set('view', 'list');
    if (query.sort && query.sort !== 'pop') p.set('sort', query.sort);
    if (page > 1) p.set('page', String(page));
    const s = p.toString();
    return `/catalog${s ? `?${s}` : ''}`;
  };

  const chipHref = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merge: Record<string, string | null> = {
      q: query.q || null,
      type: query.type || null,
      status: query.status || null,
      year_from: query.yearFrom || null,
      year_to: query.yearTo || null,
      length: query.length || null,
      view: query.view === 'list' ? 'list' : null,
      sort: query.sort !== 'pop' ? query.sort ?? null : null,
      ...patch,
    };
    for (const [k, v] of Object.entries(merge)) if (v) p.set(k, v);
    for (const g of query.genres ?? []) p.append('genre', g);
    if (patch.genreAdd) {
      p.append('genre', patch.genreAdd);
      p.delete('genreAdd');
    }
    if (patch.genreDel) {
      const all = p.getAll('genre').filter((g) => g !== patch.genreDel);
      p.delete('genre');
      all.forEach((g) => p.append('genre', g));
      p.delete('genreDel');
    }
    const s = p.toString();
    return `/catalog${s ? `?${s}` : ''}`;
  };

  return (
    <div className="container catalog-layout">
      <div className="catalog-main">
        <header className="page-head">
          <h1>Список аниме</h1>
          <p>
            Найдено: {result.total} · серверные фильтры, ссылкой можно делиться. Вид:{' '}
            <Link className={query.view === 'grid' ? 'is-active-link' : ''} href={chipHref({ view: null })} aria-label="Сетка">
              <IconGrid size={14} />
            </Link>{' '}
            /{' '}
            <Link className={query.view === 'list' ? 'is-active-link' : ''} href={chipHref({ view: 'list' })} aria-label="Список">
              <IconList size={14} />
            </Link>
          </p>
          <form method="GET" action="/catalog" className="catalog-searchrow">
            <input className="input" type="search" name="q" defaultValue={query.q} placeholder="Название, жанр, год…" />
            {query.genres?.map((g) => (
              <input key={g} type="hidden" name="genre" value={g} />
            ))}
            {query.view === 'list' ? <input type="hidden" name="view" value="list" /> : null}
            <button className="btn btn--primary btn--md" type="submit">
              Найти
            </button>
          </form>
        </header>

        {result.items.length ? (
          query.view === 'list' ? (
            <div className="rows">
              {result.items.map((t) => (
                <PosterRow key={t.slug} title={t} />
              ))}
            </div>
          ) : (
            <div className="poster-grid">
              {result.items.map((t) => (
                <PosterCard key={t.slug} title={t} />
              ))}
            </div>
          )
        ) : (
          <div className="empty-state">
            <h2>Ничего не нашлось</h2>
            <p>Ослабьте фильтры: снимите жанры или расширьте годы.</p>
            <a className="btn btn--primary btn--md" href="/catalog">
              Сбросить фильтры
            </a>
          </div>
        )}

        <Pagination page={result.page} pages={result.pages} href={href} />
      </div>

      <aside className="catalog-side" aria-label="Фильтры">
        <form method="GET" action="/catalog" className="filters-side">
          {query.view === 'list' ? <input type="hidden" name="view" value="list" /> : null}
          <div className="filters-side__block">
            <span className="field__label">Годы</span>
            <div className="years-row">
              <input className="input" type="number" name="year_from" defaultValue={query.yearFrom} placeholder={String(years[years.length - 1] ?? 1960)} min="1950" max="2100" aria-label="Год с" />
              <input className="input" type="number" name="year_to" defaultValue={query.yearTo} placeholder={String(years[0] ?? 2026)} min="1950" max="2100" aria-label="Год по" />
            </div>
          </div>

          <div className="filters-side__block">
            <span className="field__label">Тип</span>
            <div className="checks checks--2col">
              {(Object.keys(TYPE_LABELS) as TitleType[]).map((t) => (
                <label key={t} className="check">
                  <input type="radio" name="type" value={t} defaultChecked={query.type === t} />
                  <span>{TYPE_LABELS[t]}</span>
                </label>
              ))}
              <label className="check">
                <input type="radio" name="type" value="" defaultChecked={!query.type} />
                <span>Все</span>
              </label>
            </div>
          </div>

          <div className="filters-side__block">
            <span className="field__label">Статус</span>
            <div className="checks checks--2col">
              {(Object.keys(STATUS_LABELS) as TitleStatus[]).map((s) => (
                <label key={s} className="check">
                  <input type="radio" name="status" value={s} defaultChecked={query.status === s} />
                  <span>{STATUS_LABELS[s]}</span>
                </label>
              ))}
              <label className="check">
                <input type="radio" name="status" value="" defaultChecked={!query.status} />
                <span>Любой</span>
              </label>
            </div>
          </div>

          <div className="filters-side__block">
            <span className="field__label">Количество серий</span>
            <div className="checks">
              {Object.entries(LENGTH_BUCKETS).map(([key, b]) => (
                <label key={key} className="check">
                  <input type="radio" name="length" value={key} defaultChecked={query.length === key} />
                  <span>{b.label}</span>
                </label>
              ))}
              <label className="check">
                <input type="radio" name="length" value="" defaultChecked={!query.length} />
                <span>Любое</span>
              </label>
            </div>
          </div>

          <details className="filters-side__block filters-side__genres" open={Boolean(query.genres?.length)}>
            <summary className="field__label">Жанры {query.genres?.length ? `· ${query.genres.length}` : ''}</summary>
            <div className="checks">
              {genres.slice(0, 30).map((g) => (
                <label key={g.slug} className="check">
                  <input type="checkbox" name="genre" value={g.slug} defaultChecked={query.genres?.includes(g.slug)} />
                  <span>
                    {GENRE_LABELS[g.slug] ?? g.slug} <em>{g.count}</em>
                  </span>
                </label>
              ))}
            </div>
          </details>

          <div className="filters-side__block">
            <span className="field__label">Сортировка</span>
            <SortSelect value={query.sort ?? 'pop'} labels={SORT_LABELS} />
          </div>

          <div className="filters-side__actions">
            <button className="btn btn--primary btn--md" type="submit">
              Применить
            </button>
            <a className="btn btn--ghost btn--md" href={query.view === 'list' ? '/catalog?view=list' : '/catalog'}>
              Сброс
            </a>
          </div>
        </form>

        {query.genres?.length ? (
          <div className="chips" style={{ marginTop: 12 }}>
            {query.genres.map((g) => (
              <Link key={g} className="chip is-active" href={chipHref({ genreDel: g })}>
                {GENRE_LABELS[g] ?? g} ✕
              </Link>
            ))}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
