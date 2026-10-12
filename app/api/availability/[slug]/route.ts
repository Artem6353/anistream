import { NextResponse } from 'next/server';
import { getTitle } from '@/lib/catalog';
import { cacheEntriesForSlug, isDirectProviderSource } from '@/lib/providers/cache';
import { episodeCount } from '@/lib/episodes';
import { titleHasSources } from '@/lib/episode-sources';

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
  const total = episodeCount(title) ?? 0;
  const entries = await cacheEntriesForSlug(slug);
  const byEp = new Map<number, string[]>();
  for (const e of entries) {
    byEp.set(
      e.episode,
      e.sources.sources.filter((s) => s.providerId !== 'demo').map((s) => s.providerId),
    );
  }
  const directByEp = new Map<number, boolean>();
  for (const e of entries) {
    if (e.sources.sources.some(isDirectProviderSource)) directByEp.set(e.episode, true);
  }
  const synthesizable = [...byEp.values()].some((provs) => provs.some((p) => p === 'cvh' || p === 'aniboom'));
  const episodes: Record<number, 'cache' | 'synth' | 'guess' | 'none'> = {};
  for (let ep = 1; ep <= total; ep++) {
    if (directByEp.get(ep)) episodes[ep] = 'cache';
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
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60' } },
  );
}
