import type { Metadata } from 'next';
import Link from 'next/link';
import { A3Card } from '@/components/aninova3/A3Card';
import { IconSearch } from '@/components/ui/icons';
import { genreStats } from '@/lib/catalog';
import { GENRE_LABELS } from '@/lib/labels';
import { plural } from '@/lib/format';
import { searchResults } from '@/lib/aninova3/search';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

export const metadata: Metadata = {
  title: 'Поиск по каталогу',
  description: 'Поиск аниме по русскому названию, жанру и году. Результаты из каталога AniNova.',
  robots: { index: false, follow: false },
  alternates: { canonical: `${PREVIEW_ROOT}/search` },
};

const ROOT = PREVIEW_ROOT;

function pageHref(q: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const suffix = params.toString();
  return `${ROOT}/search${suffix ? `?${suffix}` : ''}`;
}

function pageNumbers(page: number, pages: number): number[] {
  const set = new Set<number>([1, pages, page - 1, page, page + 1]);
  return [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
}

export default async function PreviewSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const rawPage = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const result = searchResults(rawQ ?? '', Number.parseInt(rawPage ?? '1', 10));
  const genres = genreStats().slice(0, 8);
  const itemsLabel = `${result.total} ${plural(result.total, ['результат', 'результата', 'результатов'])}`;

  return (
    <div className="a3-wrap a3-searchpage">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Поиск</span>
      </nav>

      <header className="a3-pagehead">
        <p className="a3-kicker">Каталог</p>
        <h1 className="a3-h1">Поиск по каталогу</h1>
        <p className="a3-pagehead__lead">
          Русские названия, жанры и годы. Оригинальные названия используются только внутри поиска и не показываются в выдаче.
        </p>
      </header>

      <form className="a3-searchform" role="search" action={`${ROOT}/search`} method="get">
        <label className="a3-sr" htmlFor="a3-search-page-q">Поисковый запрос</label>
        <span className="a3-searchform__icon" aria-hidden="true"><IconSearch size={18} /></span>
        <input
          id="a3-search-page-q"
          className="a3-input a3-searchform__input"
          type="search"
          name="q"
          defaultValue={result.query}
          placeholder="Например: Фрирен, романтика, 2024"
          autoComplete="off"
          maxLength={120}
        />
        <button className="a3-btn a3-btn--primary" type="submit">Найти</button>
        {result.query ? <Link className="a3-searchform__reset" href={`${ROOT}/search`}>Сбросить</Link> : null}
      </form>

      {!result.query ? (
        <div className="a3-searchpage__intro">
          <section className="a3-empty" aria-labelledby="search-start-title">
            <h2 className="a3-empty__title" id="search-start-title">Начните с названия или жанра</h2>
            <p className="a3-muted">Минимум два символа. Поиск работает по реальному каталогу, без демо-выдачи.</p>
            <div className="a3-chips a3-chips--inline">
              {genres.map((g) => (
                <Link key={g.slug} className="a3-chip" href={`${ROOT}/genre/${g.slug}`}>
                  {GENRE_LABELS[g.slug] ?? g.slug} <span className="a3-chip__count">{g.count}</span>
                </Link>
              ))}
            </div>
            <Link className="a3-link" href={`${ROOT}/top`}>Или откройте ТОП-250 →</Link>
          </section>
        </div>
      ) : (
        <section className="a3-searchpage__results" aria-labelledby="search-results-title" aria-live="polite">
          <div className="a3-section__head a3-section__head--inline">
            <div>
              <p className="a3-kicker">Результаты</p>
              <h2 className="a3-h1 a3-searchpage__h2" id="search-results-title">
                {result.total ? itemsLabel : 'Ничего не найдено'}
              </h2>
              <p className="a3-muted">Запрос: «{result.query}»</p>
            </div>
            {result.pages > 1 ? (
              <p className="a3-muted">Страница {result.page} из {result.pages}</p>
            ) : null}
          </div>

          {result.total ? (
            <>
              <div className="a3-grid">
                {result.items.map((title) => <A3Card key={title.slug} title={title} />)}
              </div>
              {result.pages > 1 ? (
                <nav className="a3-pagination" aria-label="Страницы результатов">
                  {result.page > 1 ? (
                    <Link className="a3-pagebtn" href={pageHref(result.query, result.page - 1)} rel="prev">← Назад</Link>
                  ) : <span className="a3-pagebtn is-disabled" aria-disabled="true">← Назад</span>}
                  <span className="a3-muted">
                    {pageNumbers(result.page, result.pages).map((n, i, arr) => (
                      <span key={n}>
                        {i > 0 && arr[i - 1] !== n - 1 ? ' … ' : ' '}
                        {n === result.page ? (
                          <span aria-current="page">{n}</span>
                        ) : (
                          <Link className="a3-link" href={pageHref(result.query, n)}>{n}</Link>
                        )}
                      </span>
                    ))}
                  </span>
                  {result.page < result.pages ? (
                    <Link className="a3-pagebtn" href={pageHref(result.query, result.page + 1)} rel="next">Вперёд →</Link>
                  ) : <span className="a3-pagebtn is-disabled" aria-disabled="true">Вперёд →</span>}
                </nav>
              ) : null}
            </>
          ) : (
            <div className="a3-empty">
              <h2 className="a3-empty__title">По запросу «{result.query}» ничего нет</h2>
              <p className="a3-muted">Попробуйте короче, проверьте раскладку или откройте жанры.</p>
              <div className="a3-chips a3-chips--inline">
                {genres.slice(0, 5).map((g) => (
                  <Link key={g.slug} className="a3-chip" href={`${ROOT}/genre/${g.slug}`}>
                    {GENRE_LABELS[g.slug] ?? g.slug}
                  </Link>
                ))}
              </div>
              <Link className="a3-link" href={`${ROOT}/search`}>Искать другое →</Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
