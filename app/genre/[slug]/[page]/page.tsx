import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GENRE_SORT_LABELS, genreHref, genrePage, genrePageStaticParams } from '@/lib/genre-pages';
import { GenreView } from '@/components/anime/GenreView';
import { JsonLd, breadcrumbsLd, itemListLd } from '@/components/system/JsonLd';
import { getProvidersConfig } from '@/lib/config/providers.config';

export const revalidate = 1800;

/**
 * Страница жанра с сортировкой и номером страницы в пути: /genre/comedy/pop-2.
 *
 * Аудит 2026-10 (ТЗ 2.2/3.2): раньше сортировка и пагинация жили в query (?sort=…,
 * из-за чего маршрут читал searchParams и становился динамическим — Vercel отдавал
 * 19,6 МБ HTML без кэша на каждый запрос, а Googlebot видел бесконечную сетку
 * из 3495 карточек. Сегменты пути + generateStaticParams дают ISR и нормальный
 * размер документа (60 карточек).
 */
export function generateStaticParams() {
  return genrePageStaticParams();
}

interface Props {
  params: Promise<{ slug: string; page: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page } = await params;
  const data = genrePage(slug, page);
  if (!data) notFound();
  const sortLabel = GENRE_SORT_LABELS[data.sort];
  const title = `Аниме жанра ${data.label} — ${sortLabel}, страница ${data.page} из ${data.pages}`;
  const description =
    `Страница ${data.page}: ${sortLabel} аниме жанра ${data.label} (всего ${data.total}). ` +
    `Рейтинг, число серий и расписание выхода. Смотреть онлайн на AniNova.`;
  const canonical = genreHref(slug, data.sort, data.page);
  return {
    title,
    description,
    alternates: {
      canonical,
      /* Явные prev/next — пагинация жанра не должна выглядеть как дубли. */
      ...(data.page > 1 ? { prev: genreHref(slug, data.sort, data.page - 1) } : {}),
      ...(data.page < data.pages ? { next: genreHref(slug, data.sort, data.page + 1) } : {}),
    },
    openGraph: {
      type: 'website',
      url: canonical,
      locale: 'ru_RU',
      siteName: 'AniNova',
      title,
      description,
      images: '/opengraph-image',
    },
    twitter: { card: 'summary_large_image', title, description, images: '/opengraph-image' },
    /* Хвосты пагинации не должны вытеснять сами тайтлы из индекса. */
    robots: { index: data.page <= 5, follow: true },
  };
}

export default async function GenrePaginatedPage({ params }: Props) {
  const { slug, page } = await params;
  const data = genrePage(slug, page);
  if (!data) notFound();
  const base = getProvidersConfig().site.url;

  return (
    <>
      <JsonLd
        data={breadcrumbsLd(base, [
          { name: 'Жанры', href: '/genres' },
          { name: data.label, href: `/genre/${slug}` },
          { name: `Страница ${data.page}` },
        ])}
      />
      <JsonLd data={itemListLd(data.items.map((t) => ({ href: `/anime/${t.slug}`, name: t.ru })), base)} />
      <GenreView {...data} />
    </>
  );
}
