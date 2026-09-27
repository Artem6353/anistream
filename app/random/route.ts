import { NextResponse } from 'next/server';
import { loadTitles } from '@/lib/catalog';

export const revalidate = 0;

/** «Случайный тайтл» (паттерн AnimeGO/AniLibria): рулетка из каталога. */
export async function GET(request: Request) {
  const titles = loadTitles();
  const pick = titles[Math.floor(Math.random() * titles.length)];
  return NextResponse.redirect(new URL(`/anime/${pick.slug}`, request.url), 307);
}
