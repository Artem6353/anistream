import { gzipSync } from 'node:zlib';
import { NextResponse } from 'next/server';
import { getWeekSchedule } from '@/lib/schedule';

export const runtime = 'nodejs';
export const revalidate = 600;

/** Недельное расписание: данные из таблицы airing_schedule (воркер sync-airing),
 *  fallback — реальный график каталога. Прямых запросов к AniList из рантайма нет (ТЗ 1.1). */
export async function GET(request: Request) {
  const { entries, live, source, freshAt } = await getWeekSchedule();
  const payload = { live, source, freshAt, entries };
  const body = JSON.stringify(payload);
  const acceptsGzip = /(?:^|,)\s*gzip(?:\s*;[^,]*)?(?:,|$)/i.test(request.headers.get('accept-encoding') ?? '');
  const headers = {
    'Cache-Control': 'public, max-age=600',
    Vary: 'Accept-Encoding',
  };

  // Сжатие JSON уменьшает ответ расписания, который браузер запрашивает после рендера главной.
  if (acceptsGzip && Buffer.byteLength(body) >= 1024) {
    return new Response(gzipSync(body), {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
      },
    });
  }

  return NextResponse.json(payload, { headers });
}
