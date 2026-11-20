import type { Metadata } from 'next';
import { ComicReader } from '@/components/proto/ComicReader';
import { getComic, readerPages } from '@/lib/mock';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Чтение — ${getComic(slug).title}` };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comic = getComic(slug);
  return (
    <main id="content">
      <ComicReader
        title={comic.title}
        comicHref={`/minimal/comics/${comic.slug}`}
        chapter={comic.progress?.chapter ?? 1}
        pages={readerPages}
        startPage={0}
      />
    </main>
  );
}
