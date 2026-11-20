import type { Metadata } from 'next';
import { EditorialWatch } from '@/components/editorial/EditorialWatch';
import { getAnime } from '@/lib/mock';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Кинозал — ${getAnime(slug).title}` };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EditorialWatch item={getAnime(slug)} />;
}
