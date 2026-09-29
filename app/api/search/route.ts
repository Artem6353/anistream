import { NextResponse } from 'next/server';
import { searchTitles } from '@/lib/catalog';

export const revalidate = 0;

/** JSON-поиск для командной палитры и внешних интеграций. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  /* Аудит 30.09 (P2-17): limit=abc → NaN → пустой ответ; sanitize + нижняя граница. */
  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '8', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(20, Math.max(1, rawLimit)) : 8;
  const items = searchTitles(q, limit).map((t) => ({
    slug: t.slug,
    ru: t.ru,
    romaji: t.romaji,
    year: t.year,
    score: t.score,
    poster: t.poster,
    href: `/anime/${t.slug}`,
  }));
  return NextResponse.json({ q, items });
}
