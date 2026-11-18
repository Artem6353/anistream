import { NextResponse } from 'next/server';
import { getTitle } from '@/lib/catalog';
import { cacheEntriesForSlug, isDirectProviderSource } from '@/lib/providers/cache';
import { releasedCountFor } from '@/lib/episode-data';
import { dbEpisodeAvailability, titleHasSources } from '@/lib/episode-sources';
import { availabilityCacheControl } from '@/lib/availability-cache';

/** Доступность серий: cache (прямой ответ провайдера) | synth (шаблон CVH/AniBoom)
 *  | guess (подбор пулом озвучек) | none.
 *
 *  Аудит 2026-10 (ТЗ 1.6.4): раньше `guess`/`demo` рисовали зелёную точку у каждой
 *  серии — на проде у «Ван-Пис» все 24 «серии» выглядели доступными, хотя ни один URL
 *  не был получен от провайдера. Теперь:
 *   - длина списка = число ВЫШЕДШИХ серий (lib/episodes.ts), а не заглушка 24;
 *   - `demo` больше не выдаётся за источник: нет записи → 'none';
 *   - дополнительно возвращается `verified` — есть ли у тайтла подтверждённый источник
 *     (таблица episode_sources со статусом ok, иначе кэш прямых резолвов).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = getTitle(slug);
  if (!title) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const total = (await releasedCountFor(title)) ?? 0;
  const [entries, dbAvailability] = await Promise.all([
    cacheEntriesForSlug(slug),
    dbEpisodeAvailability(title.anilistId, total),
  ]);

  const cachedProvidersByEpisode = new Map<number, Set<string>>();
  const directEpisodes = new Set<number>();
  for (const entry of entries) {
    const providers = cachedProvidersByEpisode.get(entry.episode) ?? new Set<string>();
    for (const source of entry.sources.sources) {
      if (source.providerId !== 'demo') providers.add(source.providerId);
      if (isDirectProviderSource(source)) directEpisodes.add(entry.episode);
    }
    cachedProvidersByEpisode.set(entry.episode, providers);
  }

  // Supabase is the source of truth for imported episode URLs; Redis is only a hot cache.
  for (const episode of dbAvailability?.directEpisodes ?? []) directEpisodes.add(episode);

  const cachedTemplate = [...cachedProvidersByEpisode.values()].some(
    (providers) => providers.has('cvh') || providers.has('aniboom'),
  );
  const dbTemplate = (dbAvailability?.templateProviders ?? []).some(
    (provider) => provider === 'cvh' || provider === 'aniboom',
  );
  const synthesizable = cachedTemplate || dbTemplate;
  const episodes: Record<number, 'cache' | 'synth' | 'guess' | 'none'> = {};
  for (let ep = 1; ep <= total; ep++) {
    if (directEpisodes.has(ep)) episodes[ep] = 'cache';
    else if (synthesizable) episodes[ep] = 'synth';
    else if (title.shikimori?.id) episodes[ep] = 'guess';
    else episodes[ep] = 'none';
  }
  const verified = await titleHasSources(title);
  /* Аудит 01.10, итерация 2: роут читает searchParams → это dynamic-FUNCTION,
     revalidate=600 на таких не работает (зонд: x-vercel-cache MISS на повторах),
     а край уважает s-maxage в ответе функции. Поэтому: без revalidate, с явным
     s-maxage+SWR — CDN кэширует по полному URL (ключ = набор слагов). */
  return NextResponse.json(
    { slug, episodes, verified, total },
    { headers: { 'Cache-Control': availabilityCacheControl(dbAvailability !== null) } },
  );
}
