import type { Metadata } from 'next';
import Link from 'next/link';
import { filterCatalog, genreStats, toCardTitle, yearsAvailable, PER_PAGE } from '@/lib/catalog';
import { GENRE_LABELS, LENGTH_BUCKETS, SORT_LABELS, STATUS_LABELS, TYPE_LABELS } from '@/lib/labels';
import { plural } from '@/lib/format';
import { A3Card } from '@/components/aninova3/A3Card';
import { A3FiltersPanel } from '@/components/aninova3/A3FiltersPanel';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconGrid, IconList, IconStar } from '@/components/ui/icons';
import { activeFilters, a3CatalogHref, A3_CATALOG_ROOT, parseA3CatalogQuery } from '@/lib/aninova3/catalog-query';

export const metadata: Metadata = { title: 'Каталог аниме' };

const ROOT = '/preview/aninova-3';

/** Годы сгруппированы в десятилетия: одна ссылка вместо двух селектов,
 *  одинаково удобно мышью, пальцем и пультом. */
const DECADES = [
  { key: '2020', label: '2020-е', from: '2020', to: '2029' },
  { key: '2010', label: '2010-е', from: '2010', to: '2019' },
  { key: '2000', label: '2000-е', from: '2000', to: '2009' },
  { key: '1990', label: '1990-е', from: '1990', to: '1999' },
  { key: 'older', label: 'до 1990', from: '', to: '1989' },
];

export default async function A3CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = parseA3CatalogQuery(sp);
  const result = filterCatalog(q);
  const genres = genreStats().slice(0, 14);
  const years = yearsAvailable();
  const view = q.view ?? 'list';
  const chips = activeFilters(q);
  const from = result.total ? (result.page - 1) * PER_PAGE + 1 : 0;
  const to = Math.min(result.total, result.page * PER_PAGE);
  const decade = DECADES.find((d) => d.from === q.yearFrom && d.to === q.yearTo);

  const group = (title: string, items: { key: string; label: string; active: boolean; href: string }[]) => (
    <div className="a3-filtergroup" role="group" aria-label={title}>
      <p className="a3-filtergroup__title">{title}</p>
      <div className="a3-filtergroup__items">
        {items.map((it) => (
          <Link key={it.key} className={`a3-chip a3-chip--sm${it.active ? ' is-on' : ''}`} href={it.href} aria-current={it.active ? 'true' : undefined}>
            {it.label}
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <div className="a3-wrap a3-cat">
      <header className="a3-pagehead">
        <p className="a3-kicker">Каталог · {result.total.toLocaleString('ru-RU')} тайтлов</p>
        <h1 className="a3-h1">Найти своё</h1>
        <p className="a3-pagehead__lead">
          Плотный список, фильтры в один клик, серверная выдача. В браузер не грузится весь каталог: на странице {PER_PAGE} записей.
        </p>
      </header>

      <form className="a3-searchbar" method="get" action={A3_CATALOG_ROOT} role="search">
        <label className="a3-sr" htmlFor="a3-cat-q">
          Поиск по каталогу
        </label>
        <input id="a3-cat-q" className="a3-input" type="search" name="q" defaultValue={q.q} placeholder="Название, жанр, год…" />
        {q.genres?.map((g) => (
          <input key={g} type="hidden" name="genre" value={g} />
        ))}
        {q.type ? <input type="hidden" name="type" value={q.type} /> : null}
        {q.status ? <input type="hidden" name="status" value={q.status} /> : null}
        {q.yearFrom ? <input type="hidden" name="year_from" value={q.yearFrom} /> : null}
        {q.yearTo ? <input type="hidden" name="year_to" value={q.yearTo} /> : null}
        {q.length ? <input type="hidden" name="length" value={q.length} /> : null}
        {q.sort !== 'pop' ? <input type="hidden" name="sort" value={q.sort} /> : null}
        {view === 'grid' ? <input type="hidden" name="view" value="grid" /> : null}
        <button className="a3-btn a3-btn--primary" type="submit">
          Найти
        </button>
      </form>

      <div className="a3-chips" aria-label="Жанры">
        {genres.map((g) => {
          const active = q.genres?.includes(g.slug);
          return (
            <Link
              key={g.slug}
              className={`a3-chip${active ? ' is-on' : ''}`}
              href={a3CatalogHref(q, active ? { genreDel: g.slug } : { genreAdd: g.slug })}
              aria-current={active ? 'true' : undefined}
            >
              {GENRE_LABELS[g.slug] ?? g.slug}
              <span className="a3-chip__count">{g.count}</span>
            </Link>
          );
        })}
        <Link className="a3-chip a3-chip--ghost" href={A3_CATALOG_ROOT}>
          Все жанры
        </Link>
      </div>

      {chips.length ? (
        <div className="a3-activefilters" aria-label="Выбранные фильтры">
          <span className="a3-muted">Выбрано:</span>
          {chips.map((c) => (
            <Link key={c.key} className="a3-activefilters__chip" href={c.href}>
              {c.label} <span aria-hidden>×</span>
              <span className="a3-sr">снять фильтр</span>
            </Link>
          ))}
          <Link className="a3-link" href={A3_CATALOG_ROOT}>
            Сбросить всё
          </Link>
        </div>
      ) : null}

      <div className="a3-cat__body">
        <A3FiltersPanel summary={`Фильтры${chips.length ? ` · ${chips.length}` : ''}`}>
          <div className="a3-filters__form">
            {group('Тип', [
              { key: 'all', label: 'Все', active: !q.type, href: a3CatalogHref(q, { type: null }) },
              ...Object.entries(TYPE_LABELS).map(([value, label]) => ({
                key: value,
                label,
                active: q.type === value,
                href: a3CatalogHref(q, { type: q.type === value ? null : value }),
              })),
            ])}
            {group('Статус', [
              { key: 'all', label: 'Все', active: !q.status, href: a3CatalogHref(q, { status: null }) },
              ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
                key: value,
                label,
                active: q.status === value,
                href: a3CatalogHref(q, { status: q.status === value ? null : value }),
              })),
            ])}
            {group('Длина', [
              { key: 'all', label: 'Любая', active: !q.length, href: a3CatalogHref(q, { length: null }) },
              ...Object.entries(LENGTH_BUCKETS).map(([value, bucket]) => ({
                key: value,
                label: bucket.label.replace(/\s*\(.*\)/, ''),
                active: q.length === value,
                href: a3CatalogHref(q, { length: q.length === value ? null : value }),
              })),
            ])}
            {group('Годы', [
              { key: 'all', label: 'Все', active: !q.yearFrom && !q.yearTo, href: a3CatalogHref(q, { year_from: null, year_to: null }) },
              ...DECADES.map((d) => ({
                key: d.key,
                label: d.label,
                active: decade?.key === d.key,
                href: a3CatalogHref(q, { year_from: q.yearFrom === d.from ? null : d.from, year_to: q.yearTo === d.to ? null : d.to }),
              })),
            ])}
            {years.length ? (
              <p className="a3-muted a3-filters__years">
                Доступны годы: {years[years.length - 1]}–{years[0]}. Точный год — через поиск или ссылку с <code>year=</code>.
              </p>
            ) : null}
            <div className="a3-filters__actions">
              <Link className="a3-btn a3-btn--ghost" href={A3_CATALOG_ROOT}>
                Сбросить фильтры
              </Link>
            </div>
          </div>
        </A3FiltersPanel>

        <div className="a3-results">
          <div className="a3-results__bar">
            <p className="a3-muted">
              {result.total ? `${from}–${to} из ${result.total.toLocaleString('ru-RU')} ${plural(result.total, ['тайтла', 'тайтлов', 'тайтлов'])}` : 'Ничего не найдено'}
            </p>
            <div className="a3-results__tools">
              <div className="a3-sortchips" role="group" aria-label="Сортировка">
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <Link
                    key={value}
                    className={`a3-chip a3-chip--sm${q.sort === value ? ' is-on' : ''}`}
                    href={a3CatalogHref({ ...q, sort: value as typeof q.sort })}
                    aria-current={q.sort === value ? 'true' : undefined}
                  >
                    {label}
                  </Link>
                ))}
              </div>
              <div className="a3-viewtoggle" role="group" aria-label="Вид каталога">
                <Link
                  className={`a3-iconbtn a3-iconbtn--sm${view === 'list' ? ' is-on' : ''}`}
                  href={a3CatalogHref({ ...q, view: 'list' })}
                  aria-label="Списком"
                  aria-current={view === 'list' ? 'true' : undefined}
                >
                  <IconList size={18} />
                </Link>
                <Link
                  className={`a3-iconbtn a3-iconbtn--sm${view === 'grid' ? ' is-on' : ''}`}
                  href={a3CatalogHref({ ...q, view: 'grid' })}
                  aria-label="Сеткой"
                  aria-current={view === 'grid' ? 'true' : undefined}
                >
                  <IconGrid size={18} />
                </Link>
              </div>
            </div>
          </div>

          {!result.items.length ? (
            <div className="a3-empty">
              <p className="a3-empty__title">По этим фильтрам ничего нет</p>
              <p className="a3-muted">Попробуйте убрать год или длину — или начните с полного каталога.</p>
              <Link className="a3-btn a3-btn--primary" href={A3_CATALOG_ROOT}>
                Сбросить фильтры
              </Link>
            </div>
          ) : view === 'grid' ? (
            <div className="a3-grid">
              {result.items.map((t) => (
                <A3Card key={t.slug} title={toCardTitle(t)} />
              ))}
            </div>
          ) : (
            <ul className="a3-list">
              {result.items.map((t) => (
                <li key={t.slug}>
                  <Link className="a3-row" href={`${ROOT}/anime/${t.slug}`} data-a3-focusable>
                    <span className="a3-row__art">
                      <PosterArt src={t.poster} seed={t.slug} initials={t.ru || '?'} alt={`Постер: ${t.ru}`} width={56} />
                    </span>
                    <span className="a3-row__body">
                      <span className="a3-row__title">{t.ru}</span>
                      <span className="a3-row__meta">
                        {t.year} · {TYPE_LABELS[t.type]} · {STATUS_LABELS[t.status]}
                        {t.genres.slice(0, 2).map((g) => ` · ${GENRE_LABELS[g] ?? g}`).join('')}
                      </span>
                      <span className="a3-row__desc">{t.description}</span>
                    </span>
                    <span className="a3-row__side">
                      {t.score > 0 ? (
                        <span className="a3-score">
                          <IconStar size={12} /> {t.score.toFixed(1)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {result.pages > 1 ? (
            <nav className="a3-pagination" aria-label="Страницы каталога">
              {result.page > 1 ? (
                <Link className="a3-pagebtn" href={a3CatalogHref(q, { page: String(result.page - 1) })} rel="prev">
                  ← Назад
                </Link>
              ) : null}
              <span className="a3-muted">
                Страница {result.page} из {result.pages}
              </span>
              {result.page < result.pages ? (
                <Link className="a3-pagebtn" href={a3CatalogHref(q, { page: String(result.page + 1) })} rel="next">
                  Вперёд →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
