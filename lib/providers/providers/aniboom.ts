import type { ProviderContext, ResolveOutcome } from '../types';
import { bridgeResolve } from '../bridge';
import { getProvidersConfig } from '@/lib/config/providers.config';

/**
 * AniBoom: через тот же multi-player bridge (anime-dl-core → AnimeGo → AniBoom).
 * Embed вида https://aniboom.one/embed/... с параметрами episode/translation/parent.
 */
export async function resolveAniboom(ctx: ProviderContext): Promise<ResolveOutcome> {
  const cfg = getProvidersConfig();
  if (!cfg.bridges.multiplayer.url) return { sources: [], error: 'multi-player bridge не настроен' };
  const res = await bridgeResolve(
    { baseUrl: cfg.bridges.multiplayer.url, timeoutMs: cfg.bridges.multiplayer.timeoutMs },
    'aniboom',
    ctx,
  );
  return { sources: res.sources, error: res.sources.length ? undefined : res.error };
}
