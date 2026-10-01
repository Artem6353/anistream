import { NextResponse } from 'next/server';
import { getTitle } from '@/lib/catalog';
import { cacheEntriesForSlug } from '@/lib/providers/cache';


/** Доступность серий: cache (прямой кэш) | synth (шаблон CVH/AniBoom) | guess (пул озвучек) | demo. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = getTitle(slug);
  if (!title) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const entries = await cacheEntriesForSlug(slug);
  const byEp = new Map<number, string[]>();
  for (const e of entries) {
    byEp.set(
      e.episode,
      e.sources.sources.filter((s) => s.providerId !== 'demo').map((s) => s.providerId),
    );
  }
  const synthesizable = [...byEp.values()].some((provs) => provs.some((p) => p === 'cvh' || p === 'aniboom'));
  const episodes: Record<number, 'cache' | 'synth' | 'guess' | 'demo'> = {};
  for (let ep = 1; ep <= title.episodes; ep++) {
    const provs = byEp.get(ep);
    if (provs?.length) episodes[ep] = 'cache';
    else if (synthesizable) episodes[ep] = 'synth';
    else if (title.shikimori?.id) episodes[ep] = 'guess';
    else episodes[ep] = 'demo';
  }
  /* Аудит 01.10, итерация 2: роут читает searchParams → это dynamic-FUNCTION,
     revalidate=600 на таких не работает (зонд: x-vercel-cache MISS на повторах),
     а край уважает s-maxage в ответе функции. Поэтому: без revalidate, с явным
     s-maxage+SWR — CDN кэширует по полному URL (ключ = набор слагов). */
  return NextResponse.json({ slug, episodes }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60' } });
}
