import { NextResponse } from 'next/server';
import { searchTitles } from '@/lib/catalog';
import { previewPublicTitle } from '@/lib/aninova3/public-title';

export const revalidate = 0;

/** JSON-поиск для командной палитры и внешних интеграций. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  /* B2-D: preview-клиент запрашивает сокращённую проекцию без ромадзи.
     Production-контракт (romaji, href, limit=8) не меняется. */
  const preview = url.searchParams.get('preview') === '1';
  /* Аудит 30.09 (P2-17): limit=abc → NaN → пустой ответ; sanitize + нижняя граница. */
  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '8', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(20, Math.max(1, rawLimit)) : 8;
  const items = searchTitles(q, limit).map((t) =>
    preview
      ? { slug: t.slug, ru: previewPublicTitle(t.ru), year: t.year, score: t.score, poster: t.poster, href: `/preview/aninova-3/anime/${t.slug}` }
      : { slug: t.slug, ru: t.ru, romaji: t.romaji, year: t.year, score: t.score, poster: t.poster, href: `/anime/${t.slug}` },
  );
  return NextResponse.json({ q, items });
}
