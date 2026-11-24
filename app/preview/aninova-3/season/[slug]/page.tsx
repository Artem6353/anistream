import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { parseSeasonSlug, seasonCombos, seasonEditorial, seasonItems, seasonNeighbors, seasonTitle } from '@/lib/editorial';
import { toCardTitle } from '@/lib/catalog';
import { A3Card } from '@/components/aninova3/A3Card';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';
import { previewTitle } from '@/lib/aninova3/public-title';

interface Props { params: Promise<{ slug: string }>; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSeasonSlug(slug);
  if (!parsed) notFound();
  const items = seasonItems(parsed.season, parsed.year).map(previewTitle);
  if (!items.length) notFound();
  const ed = seasonEditorial(parsed.season, parsed.year, items);
  return {
    title: ed.metaTitle,
    description: ed.metaDesc,
    robots: { index: false, follow: false },
    alternates: { canonical: `${PREVIEW_ROOT}/season/${slug}` },
  };
}

export default async function PreviewSeasonPage({ params }: Props) {
  const { slug } = await params;
  const parsed = parseSeasonSlug(slug);
  if (!parsed) notFound();
  const items = seasonItems(parsed.season, parsed.year).map(previewTitle);
  if (!items.length) notFound();
  const ed = seasonEditorial(parsed.season, parsed.year, items);
  const { prev, next } = seasonNeighbors(slug, seasonCombos());
  const label = seasonTitle(parsed.season, parsed.year);

  return (
    <div className="a3-wrap a3-utility">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={PREVIEW_ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <Link href={`${PREVIEW_ROOT}/season`}>Сезоны</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{label}</span>
      </nav>
      <header className="a3-pagehead">
        <p className="a3-kicker">Сезонная подборка</p>
        <h1 className="a3-h1">Аниме {label}</h1>
        <div className="a3-season-editorial">
          {ed.paragraphs.map((p) => <p key={p}>{p}</p>)}
        </div>
      </header>

      <nav className="a3-season-nav" aria-label="Соседние сезоны">
        {prev ? <Link className="a3-pagebtn" href={`${PREVIEW_ROOT}/season/${prev.slug}`}>← {seasonTitle(prev.season, prev.year)}</Link> : <span />}
        {next ? <Link className="a3-pagebtn" href={`${PREVIEW_ROOT}/season/${next.slug}`}>{seasonTitle(next.season, next.year)} →</Link> : <span />}
      </nav>

      <div className="a3-grid">
        {items.map((t) => <A3Card key={t.slug} title={toCardTitle(t)} />)}
      </div>
    </div>
  );
}
