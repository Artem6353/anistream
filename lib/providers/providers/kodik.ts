import type { EpisodeSource, ProviderContext, ResolveOutcome } from '../types';
import { bridgeResolve } from '../bridge';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { providerLabel } from '../bridge';

/**
 * Kodik: ОСНОВНОЙ путь — локальный Python-bridge (anime-parsers,
 * KodikParser(token=None), with_episodes=true, поиск КОНКРЕТНОЙ серии,
 * episode-specific embed /seria/…). Запасной путь — прямой kodikwrapper
 * (если bridge выключен, но токен жив): файлы HLS или embed-фолбэк.
 */
export async function resolveKodik(ctx: ProviderContext): Promise<ResolveOutcome> {
  const cfg = getProvidersConfig();

  /* 1) локальный bridge — проверенная схема */
  if (cfg.bridges.kodik.url) {
    const res = await bridgeResolve(
      { baseUrl: cfg.bridges.kodik.url, timeoutMs: cfg.bridges.kodik.timeoutMs },
      'kodik',
      ctx,
    );
    if (res.sources.length) return { sources: res.sources };
    if (res.error && res.error !== 'bridge unreachable') return { sources: [], error: res.error };
  }

  /* 2) прямой kodikwrapper (episode-specific link + VideoLinks) */
  const { resolveKodikDirect } = await import('../kodik-direct');
  return resolveKodikDirect(ctx);
}

/** Превращает прямой резолв kodikwrapper в EpisodeSource (озвучка + файлы/embed). */
export function directToSource(opts: {
  translation?: string | null;
  translationId?: string;
  files?: EpisodeSource['files'];
  embedUrl?: string;
}): EpisodeSource | null {
  if (!opts.files?.length && !opts.embedUrl) return null;
  const label = opts.translation ?? 'Оригинал';
  return {
    id: `kodik:${opts.translationId ?? label}:${opts.embedUrl ?? opts.files?.[0]?.url ?? ''}`.slice(0, 160),
    label,
    providerId: 'kodik',
    providerName: providerLabel('kodik'),
    kind: opts.files?.length ? 'file' : 'embed',
    embedUrl: opts.embedUrl,
    files: opts.files,
    translationId: opts.translationId,
    voice: 'voice',
  };
}
