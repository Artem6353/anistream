import type { Metadata } from 'next';
import { CinematicWatch } from '@/components/cinematic/CinematicWatch';
import { getAnime } from '@/lib/mock';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Кинозал — ${getAnime(slug).title}` };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CinematicWatch item={getAnime(slug)} />;
}
