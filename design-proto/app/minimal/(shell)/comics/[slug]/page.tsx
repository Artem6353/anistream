import type { Metadata } from 'next';
import { MinimalComicPage } from '@/components/minimal/MinimalComicPage';
import { comics, getComic } from '@/lib/mock';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getComic(slug).title };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  void comics;
  return <MinimalComicPage item={getComic(slug)} />;
}
