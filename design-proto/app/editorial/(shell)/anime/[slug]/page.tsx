import type { Metadata } from 'next';
import { EditorialAnime } from '@/components/editorial/EditorialAnime';
import { getAnime } from '@/lib/mock';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getAnime(slug).title };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EditorialAnime item={getAnime(slug)} />;
}
