import type { ProviderContext, ResolveOutcome } from '../types';
import { bridgeResolve } from '../bridge';
import { getProvidersConfig } from '@/lib/config/providers.config';

/**
 * CVH (AnimeGo): только через multi-player bridge (anime-dl-core).
 * Эпизод-специфичный embed вида https://animego.me/cdn-iframe/<id>/<voice>/<season>/<episode>.
 * Скрытый CDN в браузер не тянем — фронтенд получает готовый embedUrl.
 */
export async function resolveCvh(ctx: ProviderContext): Promise<ResolveOutcome> {
  const cfg = getProvidersConfig();
  if (!cfg.bridges.multiplayer.url) return { sources: [], error: 'multi-player bridge не настроен' };
  const res = await bridgeResolve(
    { baseUrl: cfg.bridges.multiplayer.url, timeoutMs: cfg.bridges.multiplayer.timeoutMs },
    'cvh',
    ctx,
  );
  return { sources: res.sources, error: res.sources.length ? undefined : res.error };
}
