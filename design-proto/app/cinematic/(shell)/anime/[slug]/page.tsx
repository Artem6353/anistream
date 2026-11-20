import type { Metadata } from 'next';
import { CinematicAnime } from '@/components/cinematic/CinematicAnime';
import { getAnime } from '@/lib/mock';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getAnime(slug).title };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CinematicAnime item={getAnime(slug)} />;
}
