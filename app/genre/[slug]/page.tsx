import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GENRE_SORT_LABELS, genrePage, genreStaticParams } from '@/lib/genre-pages';
import { GenreView } from '@/components/anime/GenreView';
import { JsonLd, breadcrumbsLd, itemListLd } from '@/components/system/JsonLd';
import { getProvidersConfig } from '@/lib/config/providers.config';

export const revalidate = 1800;

/* Аудит 2026-10 (ТЗ 2.2): добавлен generateStaticParams — без него маршрут
 * оставался динамическим (ƒ) и Vercel отдавал его с cache-control: private, no-store. */
export function generateStaticParams() {
  return genreStaticParams();
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = genrePage(slug);
  if (!data) notFound();
  /* ТЗ 3.2.5: уникальный title/description с реальным числом тайтлов,
     а не общий шаблон на все страницы жанров. */
  const title = `Аниме жанра ${data.label} — ${GENRE_SORT_LABELS[data.sort]} (${data.total})`;
  const description =
    `${data.total} аниме жанра ${data.label}: онгоинги и завершённые тайтлы с рейтингом, ` +
    `числом серий и расписанием выхода. Список обновляется автоматически. Смотреть онлайн на AniNova.`;
  return {
    title,
    description,
    alternates: { canonical: `/genre/${slug}` },
    openGraph: {
      type: 'website',
      url: `/genre/${slug}`,
      locale: 'ru_RU',
      siteName: 'AniNova',
      title,
      description,
      images: '/opengraph-image',
    },
    twitter: { card: 'summary_large_image', title, description, images: '/opengraph-image' },
  };
}

export default async function GenreIndexPage({ params }: Props) {
  const { slug } = await params;
  const data = genrePage(slug);
  if (!data) notFound();
  const base = getProvidersConfig().site.url;

  return (
    <>
      <JsonLd data={breadcrumbsLd(base, [{ name: 'Жанры', href: '/genres' }, { name: data.label }])} />
      <JsonLd data={itemListLd(data.items.map((t) => ({ href: `/anime/${t.slug}`, name: t.ru })), base)} />
      <GenreView {...data} />
    </>
  );
}
