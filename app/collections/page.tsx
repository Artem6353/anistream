import type { Metadata } from 'next';
import Link from 'next/link';
import { COLLECTIONS, collectionTitles } from '@/lib/collections';
import { loadTitles } from '@/lib/catalog';
import { PosterCard } from '@/components/anime/PosterCard';
import { JsonLd, breadcrumbsLd, itemListLd } from '@/components/system/JsonLd';
import { getProvidersConfig } from '@/lib/config/providers.config';

export const revalidate = 3600;

/* SEO-9 (01.10): индексная страница подборок — раньше /collections не существовал,
   хлебная крошка вело на несуществующий уровень, а подборки не имели хаба
   ни в sitemap, ни во внутренней перелинковке одним списком. */
export const metadata: Metadata = {
  title: 'Подборки аниме — курированные коллекции AniNova',
  description:
    'Готовые подборки аниме: что посмотреть новичку, коротко и мощно, поплакать, лёгкое на вечер, фэнтези и современная классика.',
  alternates: { canonical: '/collections' },
  openGraph: { type: 'website', url: '/collections', locale: 'ru_RU', siteName: 'AniNova' },
};

export default function CollectionsIndexPage() {
  const base = getProvidersConfig().site.url;
  const all = loadTitles();
  return (
    <>
      <JsonLd data={breadcrumbsLd(base, [{ name: 'Подборки' }])} />
      <JsonLd data={itemListLd(COLLECTIONS.map((c) => ({ href: `/collections/${c.slug}`, name: c.title })), base)} />
      <div className="container">
        <nav className="crumbs" aria-label="Хлебные крошки">
          <Link href="/">Главная</Link>
          <span>/</span>
          <span>Подборки</span>
        </nav>
        <header className="page-head">
          <h1>Подборки аниме</h1>
          <p>Курированные коллекции каталога: под настроение, длину и опыт просмотра.</p>
        </header>
        <div className="collections-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {COLLECTIONS.map((c) => {
            const res = collectionTitles(c.slug, all);
            const preview = res?.items.slice(0, 3) ?? [];
            return (
              <section key={c.slug} className="panel" style={{ padding: 14 }}>
                <h2 className="section-title" style={{ fontSize: 17 }}>
                  <Link href={`/collections/${c.slug}`}>{c.title}</Link>
                </h2>
                <p className="panel__note">{c.desc}</p>
                <p className="panel__note">{res?.items.length ?? 0} тайтлов в подборке.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {preview.map((t) => (
                    <div key={t.slug} style={{ width: 74, flex: '0 0 auto' }}>
                      <PosterCard title={t} showBadge={false} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
