import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { parseSeasonSlug, seasonEditorial, seasonItems, seasonCombos, seasonNeighbors, seasonTitle } from '@/lib/editorial';
import { PosterCard } from '@/components/anime/PosterCard';
import { JsonLd, breadcrumbsLd, itemListLd } from '@/components/system/JsonLd';
import { getProvidersConfig } from '@/lib/config/providers.config';

export const revalidate = 3600;

/* SEO-9 (01.10): сезон-хабы «аниме сезона весна-2026» — интент «список сезона»,
   уникальная редакционная сводка из данных + перелинковка пред/след сезон. */

export function generateStaticParams() {
  return seasonCombos().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSeasonSlug(slug);
  if (!parsed) notFound();
  const items = seasonItems(parsed.season, parsed.year);
  if (!items.length) notFound();
  const ed = seasonEditorial(parsed.season, parsed.year, items);
  return {
    title: ed.metaTitle,
    description: ed.metaDesc,
    alternates: { canonical: `/season/${slug}` },
    openGraph: { type: 'website', url: `/season/${slug}`, locale: 'ru_RU', siteName: 'AniNova' },
  };
}

export default async function SeasonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = parseSeasonSlug(slug);
  if (!parsed) notFound();
  const items = seasonItems(parsed.season, parsed.year);
  if (!items.length) notFound();
  const ed = seasonEditorial(parsed.season, parsed.year, items);
  const base = getProvidersConfig().site.url;
  const { prev, next } = seasonNeighbors(slug, seasonCombos());
  const label = seasonTitle(parsed.season, parsed.year);

  return (
    <>
      <JsonLd data={breadcrumbsLd(base, [{ name: 'Сезоны аниме', href: '/season' }, { name: `Аниме ${label}` }])} />
      <JsonLd data={itemListLd(items.slice(0, 60).map((t) => ({ href: `/anime/${t.slug}`, name: t.ru })), base)} />
      <div className="container">
        <nav className="crumbs" aria-label="Хлебные крошки">
          <Link href="/">Главная</Link>
          <span>/</span>
          <Link href="/season">Сезоны</Link>
          <span>/</span>
          <span>{label}</span>
        </nav>
        <header className="page-head">
          <h1>Аниме {label} — список сезона</h1>
          <div className="season-nav" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {prev ? (
              <Link className="btn btn--outline btn--sm" href={`/season/${prev.slug}`}>
                ← {seasonTitle(prev.season, prev.year)}
              </Link>
            ) : null}
            {next ? (
              <Link className="btn btn--outline btn--sm" href={`/season/${next.slug}`}>
                {seasonTitle(next.season, next.year)} →
              </Link>
            ) : null}
          </div>
        </header>
        {/* Редполитика: уникальная сводка сезона из данных каталога */}
        <section className="panel editorial" aria-label="Редакционная сводка сезона">
          {ed.paragraphs.map((p, i) => (
            <p key={i} className="editorial__p">
              {p}
            </p>
          ))}
        </section>
        <div className="poster-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginTop: 14 }}>
          {items.map((t) => (
            <PosterCard key={t.slug} title={t} />
          ))}
        </div>
      </div>
    </>
  );
}
