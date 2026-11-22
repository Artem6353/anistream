import type { Metadata } from 'next';
import Link from 'next/link';
import { titleById } from '@/lib/catalog';
import { comicStore } from '@/lib/aninova3/comics/store';
import {
  CATALOG_ROLE_LABELS,
  CATALOG_SORTS,
  catalogHref,
  catalogIndex,
  queryCatalog,
  type CatalogEntry,
  type CatalogSort,
} from '@/lib/aninova3/comics/catalog';
import { COMIC_KIND_LABELS } from '@/lib/aninova3/comics/model';
import { comicDisplayTitle, pluralRu, volumeLine } from '@/lib/aninova3/comics/publication';
import { DEMO_COMICS } from '@/lib/aninova3/comics-demo';
import { A3Cover } from '@/components/aninova3/A3Cover';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconChevronRight } from '@/components/ui/icons';

export const metadata: Metadata = { title: 'Комиксы' };

const ROOT = '/preview/aninova-3';

const SORT_LABELS: Record<CatalogSort, string> = {
  title: 'По названию',
  year: 'По году',
  chapters: 'По объёму',
  anime: 'По связям с аниме',
};

const one = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');

export default async function A3ComicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = {
    q: one(sp.q),
    genre: one(sp.genre),
    kind: one(sp.kind),
    role: one(sp.role),
    sort: one(sp.sort),
    page: Number.parseInt(one(sp.page) || '1', 10),
  };

  const entries = catalogIndex(comicStore(), (id) => titleById.get(id));
  const result = queryCatalog(entries, query);
  const totalVerified = entries.length;
  const sort = (result.applied.sort as CatalogSort) ?? 'title';

  return (
    <div className="a3-wrap a3-comics">
      <header className="a3-pagehead">
        <p className="a3-kicker">Comics · только на русском</p>
        <h1 className="a3-h1">Комиксы</h1>
        <p className="a3-pagehead__lead">
          Произведения, связанные с аниме каталога, с русскими названиями и метаданными. Прав на публикацию и
          русских глав пока нет: карточки информационные, читалка закрыта.
        </p>
      </header>

      <form className="a3-comics__search" action={`${ROOT}/comics`} method="get" role="search">
        <label className="a3-visually-hidden" htmlFor="comics-q">
          Поиск по русским названиям
        </label>
        <input
          id="comics-q"
          className="a3-input"
          type="search"
          name="q"
          defaultValue={result.applied.q}
          placeholder="Поиск по русскому названию"
          data-a3-focusable
        />
        {result.applied.genre ? <input type="hidden" name="genre" value={result.applied.genre} /> : null}
        {result.applied.kind ? <input type="hidden" name="kind" value={result.applied.kind} /> : null}
        {result.applied.role ? <input type="hidden" name="role" value={result.applied.role} /> : null}
        {sort !== 'title' ? <input type="hidden" name="sort" value={sort} /> : null}
        <button className="a3-btn a3-btn--primary" type="submit" data-a3-focusable>
          Найти
        </button>
      </form>

      <nav className="a3-chips" aria-label="Роль произведения">
        <Link
          className={`a3-chip${!result.applied.role ? ' is-on' : ''}`}
          href={catalogHref(query, { role: '', page: 1 })}
          aria-current={!result.applied.role ? 'true' : undefined}
          data-a3-focusable
        >
          Все · {totalVerified}
        </Link>
        {result.facets.roles.map((role) => (
          <Link
            key={role.value}
            className={`a3-chip${result.applied.role === role.value ? ' is-on' : ''}`}
            href={catalogHref(query, { role: role.value, page: 1 })}
            aria-current={result.applied.role === role.value ? 'true' : undefined}
            data-a3-focusable
          >
            {CATALOG_ROLE_LABELS[role.value]} · {role.count}
          </Link>
        ))}
      </nav>

      {result.facets.kinds.length > 1 ? (
        <nav className="a3-chips a3-chips--sm" aria-label="Тип произведения">
          <Link
            className={`a3-chip a3-chip--sm${!result.applied.kind ? ' is-on' : ''}`}
            href={catalogHref(query, { kind: '', page: 1 })}
            aria-current={!result.applied.kind ? 'true' : undefined}
            data-a3-focusable
          >
            Любой тип
          </Link>
          {result.facets.kinds.map((kind) => (
            <Link
              key={kind.value}
              className={`a3-chip a3-chip--sm${result.applied.kind === kind.value ? ' is-on' : ''}`}
              href={catalogHref(query, { kind: kind.value, page: 1 })}
              aria-current={result.applied.kind === kind.value ? 'true' : undefined}
              data-a3-focusable
            >
              {COMIC_KIND_LABELS[kind.value as keyof typeof COMIC_KIND_LABELS] ?? kind.value} · {kind.count}
            </Link>
          ))}
        </nav>
      ) : null}

      {result.facets.genres.length ? (
        <nav className="a3-chips a3-chips--sm" aria-label="Жанры комиксов">
          <Link
            className={`a3-chip a3-chip--sm${!result.applied.genre ? ' is-on' : ''}`}
            href={catalogHref(query, { genre: '', page: 1 })}
            aria-current={!result.applied.genre ? 'true' : undefined}
            data-a3-focusable
          >
            Все жанры
          </Link>
          {result.facets.genres.slice(0, 14).map((genre) => (
            <Link
              key={genre.value}
              className={`a3-chip a3-chip--sm${result.applied.genre === genre.value ? ' is-on' : ''}`}
              href={catalogHref(query, { genre: genre.value, page: 1 })}
              aria-current={result.applied.genre === genre.value ? 'true' : undefined}
              data-a3-focusable
            >
              {genre.value}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="a3-comics__toolbar">
        <p className="a3-muted">
          {result.total} {pluralRu(result.total, ['произведение', 'произведения', 'произведений'])}
          {result.pages > 1 ? ` · страница ${result.page} из ${result.pages}` : ''}
        </p>
        <nav className="a3-chips a3-chips--sm" aria-label="Сортировка">
          {CATALOG_SORTS.map((value) => (
            <Link
              key={value}
              className={`a3-chip a3-chip--sm${sort === value ? ' is-on' : ''}`}
              href={catalogHref(query, { sort: value, page: 1 })}
              aria-current={sort === value ? 'true' : undefined}
              data-a3-focusable
            >
              {SORT_LABELS[value]}
            </Link>
          ))}
        </nav>
      </div>

      <ul className="a3-comiclist">
        {result.items.map((entry) => (
          <li key={entry.comic.id}>
            <CatalogRow entry={entry} />
          </li>
        ))}
      </ul>

      {!result.items.length ? (
        <div className="a3-empty">
          <p className="a3-empty__title">Ничего не найдено</p>
          <p className="a3-muted">Попробуйте другое название или сбросьте фильтры.</p>
          <Link className="a3-btn a3-btn--primary" href={`${ROOT}/comics`} data-a3-focusable>
            Все комиксы
          </Link>
        </div>
      ) : null}

      {result.pages > 1 ? (
        <nav className="a3-pager" aria-label="Страницы каталога">
          {result.page > 1 ? (
            <Link className="a3-btn" href={catalogHref(query, { page: result.page - 1 })} data-a3-focusable rel="prev">
              Назад
            </Link>
          ) : (
            <span className="a3-btn is-disabled" aria-disabled="true">
              Назад
            </span>
          )}
          <span className="a3-muted">
            {result.page} / {result.pages}
          </span>
          {result.page < result.pages ? (
            <Link className="a3-btn" href={catalogHref(query, { page: result.page + 1 })} data-a3-focusable rel="next">
              Дальше
            </Link>
          ) : (
            <span className="a3-btn is-disabled" aria-disabled="true">
              Дальше
            </span>
          )}
        </nav>
      ) : null}

      <section className="a3-comics__demo" aria-labelledby="comics-demo-title">
        <div className="a3-section__head a3-section__head--inline">
          <div>
            <h2 className="a3-h2" id="comics-demo-title">
              Демонстрационные примеры
            </h2>
            <p className="a3-muted">Вымышленные произведения для проверки читалки. Не часть каталога и не реальные права.</p>
          </div>
        </div>
        <p className="a3-demo-note">
          Демо B1-B: {DEMO_COMICS.length} примеров с пометкой «демо». Они не связаны с аниме и не попадают в основной список выше.
        </p>
        <ul className="a3-comiclist">
          {DEMO_COMICS.map((comic) => (
            <li key={comic.slug}>
              <Link className="a3-comicrow" href={`${ROOT}/comics/${comic.slug}`} data-a3-focusable>
                <A3Cover comic={comic} size="sm" />
                <span className="a3-comicrow__body">
                  <span className="a3-comicrow__title">{comic.title}</span>
                  <span className="a3-comicrow__sub">{comic.subtitle}</span>
                  <span className="a3-comicrow__meta">
                    демо · {comic.status} · {comic.chapters} глав
                  </span>
                </span>
                <span className="a3-comicrow__lang" aria-label="Демонстрационные данные">
                  демо
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CatalogRow({ entry }: { entry: CatalogEntry }) {
  const { comic } = entry;
  const title = comicDisplayTitle(comic);
  const volume = volumeLine(comic);
  const meta = [
    COMIC_KIND_LABELS[comic.kind],
    comic.year ? String(comic.year) : null,
    volume,
    entry.genres.slice(0, 2).join(', ') || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link className="a3-comicrow" href={`${ROOT}/comics/${comic.slug}`} data-a3-focusable>
      <span className="a3-comicrow__cover">
        <PosterArt src={comic.cover} seed={comic.slug} initials={title.text.slice(0, 1)} alt="" width={56} />
      </span>
      <span className="a3-comicrow__body">
        <span className="a3-comicrow__title">{title.text}</span>
        <span className="a3-comicrow__sub">{entry.roleLabel}</span>
        <span className="a3-comicrow__meta">{meta}</span>
      </span>
      <span className="a3-comicrow__lang" aria-label="Язык названия: русский">
        RU
      </span>
      <IconChevronRight size={16} />
    </Link>
  );
}
