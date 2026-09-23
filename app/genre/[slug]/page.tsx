import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 1800;
import { titlesByGenre } from '@/lib/catalog';
import { GENRE_LABELS } from '@/lib/labels';
import { PosterCard } from '@/components/anime/PosterCard';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!GENRE_LABELS[slug]) notFound();
  return { title: `Аниме жанра ${GENRE_LABELS[slug]} — список тайтлов — AniStream`, alternates: { canonical: `/genre/${slug}` } };
}

export default async function GenrePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { sort } = await searchParams;
  if (!GENRE_LABELS[slug]) notFound();
  const items = titlesByGenre(slug, (sort as 'pop' | 'score' | 'new' | 'az') ?? 'pop');

  return (
    <div className="container">
      <nav className="crumbs" aria-label="Хлебные крошки">
        <Link href="/genres">Жанры</Link>
        <span>/</span>
        <span>{GENRE_LABELS[slug]}</span>
      </nav>
      <header className="page-head">
        <h1>{GENRE_LABELS[slug]}</h1>
        <p>{items.length} тайтлов в подборке.</p>
        <div className="chips">
          {(
            [
              ['pop', 'Популярные'],
              ['score', 'Высокий рейтинг'],
              ['new', 'Новые'],
              ['az', 'А–Я'],
            ] as const
          ).map(([key, label]) => (
            <Link key={key} className={`chip ${sort === key || (!sort && key === 'pop') ? 'is-active' : ''}`} href={`/genre/${slug}${key === 'pop' ? '' : `?sort=${key}`}`}>
              {label}
            </Link>
          ))}
        </div>
      </header>
      <div className="poster-grid">
        {items.map((t) => (
          <PosterCard key={t.slug} title={t} />
        ))}
      </div>
    </div>
  );
}
