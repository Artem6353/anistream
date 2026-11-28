import { NextResponse } from 'next/server';
import { parseComicsCatalogQuery } from '@/lib/aninova3/comics/catalog-params';
import {
  ComicsCatalogUnavailableError,
  readComicsCatalog,
} from '@/lib/aninova3/comics/public-catalog';

/* Каталог читается из БД на каждый запрос: страница обязана reflect-ить
   публикационный гейт, а не кэш процесса. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OK_HEADERS = { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' };
const ERROR_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const query = parseComicsCatalogQuery(Object.fromEntries(new URL(request.url).searchParams));
  try {
    const result = await readComicsCatalog(query);
    return NextResponse.json(
      {
        source: result.source,
        notice: result.notice,
        items: result.items,
        total: result.total,
        page: result.page,
        pages: result.pages,
        pageSize: result.pageSize,
        facets: result.facets,
        applied: result.applied,
      },
      { headers: OK_HEADERS },
    );
  } catch (error) {
    if (error instanceof ComicsCatalogUnavailableError) {
      return NextResponse.json(
        { error: error.code, message: error.message, source: null, notice: null, items: [] },
        { status: 503, headers: ERROR_HEADERS },
      );
    }
    console.error('[api/comics] unexpected read failure', error);
    return NextResponse.json(
      { error: 'internal', message: 'Не удалось прочитать каталог.', source: null, notice: null, items: [] },
      { status: 500, headers: ERROR_HEADERS },
    );
  }
}
