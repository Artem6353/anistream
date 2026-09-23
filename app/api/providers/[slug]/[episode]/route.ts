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

function resolveOnce(key: string, ctx: Parameters<typeof resolveEpisodeSources>[0]) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = resolveEpisodeSources(ctx).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Единая точка входа плеер-источников (схема оригинала):
 *   GET /api/providers/[slug]/[episode]
 *   → EpisodeSources: озвучки/источники всех включённых провайдеров + demo,
 *     cache-first, merge или first (PROVIDER_MODE).
 * Токены и bridge-адреса не покидают сервер.
 */
export async function GET(request: Request, { params }: Props) {
  const { slug, episode: episodeRaw } = await params;
  const title = getTitle(slug);
  if (!title) return NextResponse.json({ error: 'title not found' }, { status: 404 });
  const episode = Math.max(1, Math.min(title.episodes, Number(episodeRaw) || 1));

  try {
    const sources = await resolveOnce(`${slug}:${episode}`, contextFromTitle(title, episode));
    return NextResponse.json(
      { ...sources, providers: providersWithAvailability() },
      { headers: { 'Cache-Control': sources.fromCache ? 'public, s-maxage=3600' : 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json({ error: 'upstream', message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
