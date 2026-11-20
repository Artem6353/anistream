import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_COMICS } from '@/lib/aninova3/comics-demo';
import { A3Cover } from '@/components/aninova3/A3Cover';
import { A3ComicContinue } from '@/components/aninova3/A3ComicContinue';

export const metadata: Metadata = { title: 'Комиксы' };

const ROOT = '/preview/aninova-3';

export default async function A3ComicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const genre = typeof sp.genre === 'string' ? sp.genre : '';
  const items = genre ? DEMO_COMICS.filter((c) => c.genres.includes(genre)) : DEMO_COMICS;
  const genres = [...new Set(DEMO_COMICS.flatMap((c) => c.genres))];

  return (
    <div className="a3-wrap a3-comics">
      <header className="a3-pagehead">
        <p className="a3-kicker">Comics · только на русском</p>
        <h1 className="a3-h1">Комиксы</h1>
        <p className="a3-pagehead__lead">
          Отдельный каталог: плотный список, русские названия и главы, спокойная читалка. Без редакционной модели и журнальных обложек.
        </p>
        <p className="a3-demo-note">
          Демонстрационный каталог: произведения вымышлены, реальные права и главы не подключены. Правило «только RU» соблюдено в интерфейсе.
        </p>
      </header>

      <A3ComicContinue />

      <div className="a3-chips" aria-label="Жанры комиксов">
        <Link className={`a3-chip${!genre ? ' is-on' : ''}`} href={`${ROOT}/comics`} aria-current={!genre ? 'true' : undefined}>
          Все
        </Link>
        {genres.map((g) => (
          <Link
            key={g}
            className={`a3-chip${genre === g ? ' is-on' : ''}`}
            href={`${ROOT}/comics?genre=${encodeURIComponent(g)}`}
            aria-current={genre === g ? 'true' : undefined}
          >
            {g}
          </Link>
        ))}
      </div>

      <div className="a3-comics__toolbar">
        <p className="a3-muted">{items.length} историй · демо</p>
        <p className="a3-muted">Читалка: ← → и свайп</p>
      </div>

      <ul className="a3-comiclist">
        {items.map((comic) => (
          <li key={comic.slug}>
            <Link className="a3-comicrow" href={`${ROOT}/comics/${comic.slug}`} data-a3-focusable>
              <A3Cover comic={comic} size="sm" />
              <span className="a3-comicrow__body">
                <span className="a3-comicrow__title">{comic.title}</span>
                <span className="a3-comicrow__sub">{comic.subtitle}</span>
                <span className="a3-comicrow__meta">
                  {comic.status} · {comic.chapters} глав · {comic.year} · {comic.genres.join(', ')}
                </span>
              </span>
              <span className="a3-comicrow__lang" aria-label="Язык: русский">
                RU
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {!items.length ? (
        <div className="a3-empty">
          <p className="a3-empty__title">В этом жанре пока пусто</p>
          <Link className="a3-btn a3-btn--primary" href={`${ROOT}/comics`}>
            Все комиксы
          </Link>
        </div>
      ) : null}
    </div>
  );
}
