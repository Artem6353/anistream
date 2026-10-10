import { NextResponse } from 'next/server';
import { getTitle } from '@/lib/catalog';
import { resolveEpisodeSources, contextFromTitle, providersWithAvailability } from '@/lib/providers';

export const revalidate = 0;

interface Props {
  params: Promise<{ slug: string; episode: string }>;
}

/** A8.1: in-flight dedupe — N одновременных GET одной серии = ОДИН resolve.
 *  Бурст из 60 параллельных запросов на 1 ГБ машине ронял сервер по OOM (каждый запрос
 *  сам шёл в bridge/кэш); c dedupe память и апстрим-трафик не масштабируются
 *  числом одновременных клиентов. Результат общий для всех участников. */
const inflight = new Map<string, ReturnType<typeof resolveEpisodeSources>>();

function resolveOnce(
  key: string,
  ctx: Parameters<typeof resolveEpisodeSources>[0],
  options: { liveOnly?: boolean } = {},
) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = resolveEpisodeSources(ctx, options).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Единая точка входа плеер-источников (схема оригинала):
 *   GET /api/providers/[slug]/[episode]
 *   → EpisodeSources: озвучки/источники всех включённых провайдеров + demo,
 *     cache-first; missing providers are resolved in parallel and merged.
 * Токены и bridge-адреса не покидают сервер.
 */
export async function GET(request: Request, { params }: Props) {
  const { slug, episode: episodeRaw } = await params;
  const title = getTitle(slug);
  if (!title) return NextResponse.json({ error: 'title not found' }, { status: 404 });
  /* Аудит 30.09 (P2-24): 'abc'/9999 молча отдавали серию 1 — невалидный ввод теперь 400. */
  const epNum = Number(episodeRaw);
  if (!Number.isInteger(epNum) || epNum < 1 || epNum > Math.max(1, title.episodes)) {
    return NextResponse.json({ error: 'bad episode' }, { status: 400 });
  }
  const episode = epNum;
  const searchParams = new URL(request.url).searchParams;
  const preferFiles = searchParams.get('files') === '1';
  // Bulk backfill can bypass existing cache and URL-template synthesis.
  const liveOnly = searchParams.get('live') === '1';

  try {
    const ctx = { ...contextFromTitle(title, episode), preferFiles };
    const resolveKey = `${slug}:${episode}${preferFiles ? ':files' : ''}${liveOnly ? ':live' : ''}`;
    const sources = await resolveOnce(resolveKey, ctx, { liveOnly });
    return NextResponse.json(
      { ...sources, providers: providersWithAvailability() },
      { headers: { 'Cache-Control': sources.fromCache ? 'public, s-maxage=3600' : 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json({ error: 'upstream', message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
