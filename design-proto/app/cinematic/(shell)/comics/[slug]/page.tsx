import type { Metadata } from 'next';
import { CinematicComic } from '@/components/cinematic/CinematicComic';
import { getComic } from '@/lib/mock';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getComic(slug).title };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CinematicComic item={getComic(slug)} />;
}
