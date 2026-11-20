import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MinimalAnimePage } from '@/components/minimal/MinimalAnimePage';
import { anime, getAnime } from '@/lib/mock';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getAnime(slug).title };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!anime.some((a) => a.slug === slug)) notFound();
  return <MinimalAnimePage item={getAnime(slug)} />;
}
