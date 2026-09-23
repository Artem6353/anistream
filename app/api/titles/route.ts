import { NextResponse } from 'next/server';
import { getTitle } from '@/lib/catalog';

export const revalidate = 600;

/** Лёгкая выдача тайтлов для клиентских компонентов (профиль, «продолжить просмотр»). */
export async function GET(request: Request) {
  const slugs = (new URL(request.url).searchParams.get('slugs') ?? '').split(',').filter(Boolean).slice(0, 60);
  const items = slugs
    .map((slug) => getTitle(slug))
    .filter(Boolean)
    .map((t) => ({
      slug: t!.slug,
      ru: t!.ru,
      romaji: t!.romaji,
      type: t!.type,
      year: t!.year,
      episodes: t!.episodes,
      score: t!.score,
      poster: t!.poster,
      banner: t!.banner,
      genres: t!.genres.slice(0, 3),
      description: t!.description.slice(0, 200),
    }));
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, s-maxage=600' } });
}
