import type { Metadata } from 'next';
import Link from 'next/link';
import { genreStats } from '@/lib/catalog';
import { GENRE_LABELS } from '@/lib/labels';
import { hashStr, plural } from '@/lib/format';

export const metadata: Metadata = { title: 'Жанры' };

export default function GenresPage() {
  const stats = genreStats();
  return (
    <div className="container">
      <header className="page-head">
        <h1>Жанры</h1>
        <p>Каждый жанр — это серверная подборка каталога с собственной сортировкой.</p>
      </header>
      <div className="genre-grid">
        {stats.map((g) => (
          <Link
            key={g.slug}
            className="genre-card"
            href={`/genre/${g.slug}`}
            style={{ ['--dot' as string]: `hsl(${hashStr(g.slug) % 360} 80% 65%)` }}
          >
            <h3>{GENRE_LABELS[g.slug] ?? g.slug}</h3>
            <p>
              {g.count} {plural(g.count, ['тайтл', 'тайтла', 'тайтлов'])}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
