import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadTitles } from '@/lib/catalog';
import { collectionTitles, COLLECTIONS } from '@/lib/collections';
import { PosterCard } from '@/components/anime/PosterCard';
import { JsonLd, breadcrumbsLd, itemListLd } from '@/components/system/JsonLd';
import { getProvidersConfig } from '@/lib/config/providers.config';

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = COLLECTIONS.find((x) => x.slug === slug);
  /* S3.2: canonical + description подборки */
  return {
    title: c ? `Подборка: ${c.title}` : 'Подборка',
    description: c ? `${c.title} — ${c.desc}` : undefined,
    alternates: { canonical: `/collections/${slug}` },
  };
}

/** Страница подборки (ТЗ 18.5): сетка тайтлов коллекции. */
export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = collectionTitles(slug, loadTitles());
  if (!res) notFound();
  const base = getProvidersConfig().site.url;
  return (
    <>
      {/* SEO-9: разметка подборки */}
      <JsonLd data={breadcrumbsLd(base, [{ name: 'Подборки', href: '/collections' }, { name: res.collection.title }])} />
      <JsonLd data={itemListLd(res.items.slice(0, 60).map((t) => ({ href: `/anime/${t.slug}`, name: t.ru })), base)} />
    <div className="container">
      <nav className="breadcrumbs" aria-label="Хлебные крошки">
        <Link href="/">Главная</Link> / <span>Подборки</span>
      </nav>
      <h1>{res.collection.title}</h1>
      <p className="collection-desc">{res.collection.desc}</p>
      <div className="poster-grid">
        {res.items.map((t) => (
          <PosterCard key={t.slug} title={t} />
        ))}
      </div>
    </div>
    </>
  );
}
