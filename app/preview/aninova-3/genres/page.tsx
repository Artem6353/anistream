import type { Metadata } from 'next';
import Link from 'next/link';
import { genreStats } from '@/lib/catalog';
import { GENRE_LABELS } from '@/lib/labels';
import { plural } from '@/lib/format';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';

export const metadata: Metadata = {
  title: 'Жанры аниме',
  description: 'Все жанры каталога AniNova с реальным числом тайтлов и ссылками на подборки.',
  robots: { index: false, follow: false },
  alternates: { canonical: `${PREVIEW_ROOT}/genres` },
};

export default function PreviewGenresPage() {
  const stats = genreStats();
  return (
    <div className="a3-wrap a3-utility">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={PREVIEW_ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Жанры</span>
      </nav>
      <header className="a3-pagehead">
        <p className="a3-kicker">Каталог</p>
        <h1 className="a3-h1">Жанры аниме</h1>
        <p className="a3-pagehead__lead">Каждый жанр — отдельная серверная подборка с сортировкой и пагинацией.</p>
      </header>
      <ul className="a3-genre-grid">
        {stats.map((g) => (
          <li key={g.slug}>
            <Link className="a3-genre-card" href={`${PREVIEW_ROOT}/genre/${g.slug}`}>
              <span className="a3-genre-card__title">{GENRE_LABELS[g.slug] ?? g.slug}</span>
              <span className="a3-genre-card__count">
                {g.count} {plural(g.count, ['тайтл', 'тайтла', 'тайтлов'])}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
