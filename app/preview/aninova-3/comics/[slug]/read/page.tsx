import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findDemoComic } from '@/lib/aninova3/comics-demo';
import { A3Reader } from '@/components/aninova3/A3Reader';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const comic = findDemoComic(slug);
  return { title: comic ? `${comic.title} — чтение` : 'Читалка', robots: { index: false, follow: false } };
}

/**
 * B1-C: читалка открывается только для демо B1-B и для произведений, у которых есть
 * реальные разрешённые русские страницы (chapter.pageImages). Иностранные главы не
 * подставляются, отсутствующие страницы не генерируются: без источника — notFound.
 */
export default async function A3ReadPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const comic = findDemoComic(slug);
  /* Реальный первоисточник без подключённых страниц не открывается: CTA чтения для
     него не показывается (см. canOpenReader), а прямой заход даёт 404 — без
     фиктивных глав и без подстановки иностранных изданий. */
  if (!comic) notFound();
  const chapterRaw = Number.parseInt(typeof sp.chapter === 'string' ? sp.chapter : '1', 10);
  const chapter = Number.isFinite(chapterRaw) && chapterRaw > 0 ? Math.min(chapterRaw, comic.chapters) : 1;
  const pageRaw = Number.parseInt(typeof sp.page === 'string' ? sp.page : '1', 10);
  const initialPage = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return <A3Reader slug={comic.slug} comicTitle={comic.title} chapter={chapter} initialPage={initialPage} />;
}
