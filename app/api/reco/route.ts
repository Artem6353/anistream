import { NextResponse } from 'next/server';
import { topByGenres } from '@/lib/reco';

export const revalidate = 600;

/** Персональные рекомендации: аффинность жанров по спискам/истории пользователя. */
export async function GET(request: Request) {
  const slugs = (new URL(request.url).searchParams.get('slugs') ?? '').split(',').filter(Boolean);
  return NextResponse.json({ items: topByGenres(slugs, 12) }, { headers: { 'Cache-Control': 'public, s-maxage=600' } });
}
