import type { ProviderContext, ResolveOutcome } from '../types';
import { bridgeResolve } from '../bridge';
import { discoverCvhSources } from '../cvh-direct';
import { getProvidersConfig } from '@/lib/config/providers.config';

/**
 * CVH (AnimeGo): только через multi-player bridge (anime-dl-core).
 * Эпизод-специфичный embed вида https://animego.me/cdn-iframe/<id>/<voice>/<season>/<episode>.
 * Скрытый CDN в браузер не тянем — фронтенд получает готовый embedUrl.
 */
export async function resolveCvh(ctx: ProviderContext): Promise<ResolveOutcome> {
  const cfg = getProvidersConfig();
  let bridgeError: string | undefined;
  if (cfg.bridges.multiplayer.url) {
    const res = await bridgeResolve(
      { baseUrl: cfg.bridges.multiplayer.url, baseUrls: cfg.bridges.multiplayer.urls, timeoutMs: cfg.bridges.multiplayer.timeoutMs },
      'cvh',
      ctx,
    );
    if (res.sources.length) return { sources: res.sources };
    bridgeError = res.error;
  }

  /* GitHub Actions и Vercel не обязаны иметь доступ к поиску AnimeGO: id
     cdn-iframe совпадает с Shikimori id, поэтому плейлист можно получить
     напрямую. Это спасает автоматический поиск новых тайтлов с дата-центр IP. */
  const direct = await discoverCvhSources(ctx);
  if (direct.length) return { sources: direct };
  return {
    sources: [],
    error: bridgeError ?? (cfg.bridges.multiplayer.url ? 'CVH: источники не найдены' : 'multi-player bridge не настроен'),
  };
}
