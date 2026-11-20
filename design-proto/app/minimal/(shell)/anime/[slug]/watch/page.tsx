import type { Metadata } from 'next';
import { MinimalWatch } from '@/components/minimal/MinimalWatch';
import { getAnime } from '@/lib/mock';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Плеер — ${getAnime(slug).title}` };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MinimalWatch item={getAnime(slug)} />;
}
