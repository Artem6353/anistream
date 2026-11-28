import { NextResponse } from 'next/server';
import {
  ComicsCatalogUnavailableError,
  readComicBySlug,
} from '@/lib/aninova3/comics/public-catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OK_HEADERS = { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' };
const ERROR_HEADERS = { 'Cache-Control': 'no-store' };

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  try {
    const result = await readComicBySlug(slug);
    if (result.status === 'moved') {
      return NextResponse.json(
        { error: 'moved', slug: result.slug },
        { status: 308, headers: { Location: `/api/comics/${result.slug}`, 'Cache-Control': 'no-store' } },
      );
    }
    if (result.status === 'not-found') {
      return NextResponse.json(
        { error: 'not-found', message: 'Произведение не найдено в публичном каталоге.' },
        { status: 404, headers: ERROR_HEADERS },
      );
    }

    const { entry, chapters, adaptations, source, notice } = result;
    return NextResponse.json(
      {
        source,
        notice,
        work: entry.comic,
        role: entry.role,
        roleLabel: entry.roleLabel,
        sourceAnimeCount: entry.sourceAnimeCount,
        chapters: chapters.map((chapter) => ({
          id: chapter.id,
          number: chapter.number,
          titleRu: chapter.titleRu,
          language: chapter.language,
          pages: chapter.pages,
          publishedAt: chapter.publishedAt ?? null,
          readingUrl: chapter.readingUrl ?? null,
          sourceName: chapter.sourceName ?? null,
        })),
        adaptations: adaptations.map((link) => ({
          animeId: link.anime.anilistId,
          slug: link.anime.slug,
          title: link.anime.ru,
          year: link.anime.year,
          type: link.anime.type,
          poster: link.anime.poster,
          role: link.role,
          primary: link.primary,
          direction: link.direction,
          confidence: link.confidence,
          basis: link.basis,
        })),
      },
      { headers: OK_HEADERS },
    );
  } catch (error) {
    if (error instanceof ComicsCatalogUnavailableError) {
      return NextResponse.json(
        { error: error.code, message: error.message, work: null, chapters: [], adaptations: [] },
        { status: 503, headers: ERROR_HEADERS },
      );
    }
    console.error('[api/comics/:slug] unexpected read failure', error);
    return NextResponse.json(
      { error: 'internal', message: 'Не удалось прочитать произведение.', work: null, chapters: [], adaptations: [] },
      { status: 500, headers: ERROR_HEADERS },
    );
  }
}
