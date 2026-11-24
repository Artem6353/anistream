import type { Metadata } from 'next';
import Link from 'next/link';
import { seasonCombos, seasonTitle } from '@/lib/editorial';
import { plural } from '@/lib/format';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

export const metadata: Metadata = {
  title: 'Сезоны аниме',
  description: 'Сезонные подборки аниме по годам: зима, весна, лето и осень с реальным числом тайтлов.',
  robots: { index: false, follow: false },
  alternates: { canonical: `${PREVIEW_ROOT}/season` },
};

export default function PreviewSeasonIndexPage() {
  const combos = seasonCombos();
  const byYear = new Map<number, typeof combos>();
  for (const c of combos) {
    const list = byYear.get(c.year) ?? [];
    list.push(c);
    byYear.set(c.year, list);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <div className="a3-wrap a3-utility">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={PREVIEW_ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Сезоны</span>
      </nav>
      <header className="a3-pagehead">
        <p className="a3-kicker">Календарь каталога</p>
        <h1 className="a3-h1">Сезоны аниме</h1>
        <p className="a3-pagehead__lead">Каждый сезон — реальная подборка тайтлов с редакционной сводкой и переходами к соседним сезонам.</p>
      </header>

      {years.map((year) => (
        <section className="a3-season-year" key={year} aria-labelledby={`season-year-${year}`}>
          <div className="a3-section__head">
            <h2 className="a3-h2" id={`season-year-${year}`}>{year}</h2>
          </div>
          <ul className="a3-season-grid">
            {byYear.get(year)!.map((c) => (
              <li key={c.slug}>
                <Link className="a3-season-card" href={`${PREVIEW_ROOT}/season/${c.slug}`}>
                  <span className="a3-season-card__title">Аниме {seasonTitle(c.season, c.year)}</span>
                  <span className="a3-season-card__count">{c.count} {plural(c.count, ['тайтл', 'тайтла', 'тайтлов'])}</span>
                  <span className="a3-season-card__arrow" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
