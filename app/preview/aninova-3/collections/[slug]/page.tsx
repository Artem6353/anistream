import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLLECTIONS, collectionTitles } from '@/lib/collections';
import { loadTitles, toCardTitle } from '@/lib/catalog';
import { A3Card } from '@/components/aninova3/A3Card';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';
import { previewCardTitle } from '@/lib/aninova3/public-title';

interface Props { params: Promise<{ slug: string }>; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = COLLECTIONS.find((x) => x.slug === slug);
  if (!c) notFound();
  return {
    title: c.title,
    description: `${c.title} — ${c.desc}`,
    robots: { index: false, follow: false },
    alternates: { canonical: `${PREVIEW_ROOT}/collections/${slug}` },
  };
}

export default async function PreviewCollectionPage({ params }: Props) {
  const { slug } = await params;
  const res = collectionTitles(slug, loadTitles());
  if (!res) notFound();
  return (
    <div className="a3-wrap a3-utility">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={PREVIEW_ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <Link href={`${PREVIEW_ROOT}/collections`}>Подборки</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{res.collection.title}</span>
      </nav>
      <header className="a3-pagehead">
        <p className="a3-kicker">Подборка</p>
        <h1 className="a3-h1">{res.collection.title}</h1>
        <p className="a3-pagehead__lead">{res.collection.desc}</p>
      </header>
      {res.items.length ? (
        <div className="a3-grid">
          {res.items.map((t) => <A3Card key={t.slug} title={previewCardTitle(toCardTitle(t))} />)}
        </div>
      ) : (
        <div className="a3-empty">
          <h2 className="a3-empty__title">Подборка пока пуста</h2>
          <Link className="a3-link" href={`${PREVIEW_ROOT}/catalog`}>Открыть каталог →</Link>
        </div>
      )}
    </div>
  );
}
