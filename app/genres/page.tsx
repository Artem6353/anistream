import type { Metadata } from 'next';
import Link from 'next/link';
import { genreStats } from '@/lib/catalog';
import { GENRE_LABELS } from '@/lib/labels';
import { hashStr, plural } from '@/lib/format';
import { JsonLd, breadcrumbsLd, itemListLd } from '@/components/system/JsonLd';
import { getProvidersConfig } from '@/lib/config/providers.config';

export const metadata: Metadata = {
  title: 'Жанры аниме — все категории каталога',
  description: 'Аниме по жанрам: экшен, романтика, комедия, фантастика, драма и другие категории — со счётчиками тайтлов в каждой.',
  alternates: { canonical: '/genres' },
  openGraph: { type: 'website', url: '/genres', locale: 'ru_RU', siteName: 'AniNova', images: '/opengraph-image' },
};

export default function GenresPage() {
  const stats = genreStats();
  const base = getProvidersConfig().site.url;
  return (
    <>
      {/* SEO-9: хаб жанров — крошки + ItemList жанровых страниц */}
      <JsonLd data={breadcrumbsLd(base, [{ name: 'Жанры' }])} />
      <JsonLd data={itemListLd(stats.map((g) => ({ href: `/genre/${g.slug}`, name: GENRE_LABELS[g.slug] ?? g.slug })), base)} />
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
            style={{ ['--dot-h' as string]: String(hashStr(g.slug) % 360) }}
          >
            <h3>{GENRE_LABELS[g.slug] ?? g.slug}</h3>
            <p>
              {g.count} {plural(g.count, ['тайтл', 'тайтла', 'тайтлов'])}
            </p>
          </Link>
        ))}
      </div>
    </div>
    </>
  );
}
