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
  let bridgeError: string | undefined;
  if (cfg.bridges.kodik.url) {
    const res = await bridgeResolve(
      { baseUrl: cfg.bridges.kodik.url, timeoutMs: cfg.bridges.kodik.timeoutMs },
      'kodik',
      ctx,
    );
    if (res.sources.length) return { sources: res.sources };
    bridgeError = res.error;

    /* Если bridge ответил корректно, но не нашёл материал, не запускаем дорогой
       второй поиск на каждом запросе. Прямой API оставляем для проблем транспорта
       и авторизации bridge, когда bridge не смог выполнить поиск. */
    const bridgeUnavailable = Boolean(bridgeError && (
      /health-gate|timeout|unreachable|network|fetch failed|ECONN|ETIMEDOUT|bad gateway|unauthori[sz]ed|\b401\b|\b403\b|\b5\d\d\b/i.test(bridgeError)
    ));
    if (!bridgeUnavailable) {
      return { sources: [], error: bridgeError ?? 'Kodik: источники не найдены' };
    }
  }

  /* 2) bridge выключен/недоступен: пробуем прямой Kodik API. */
  const { resolveKodikDirect } = await import('../kodik-direct');
  const direct = await resolveKodikDirect(ctx);
  if (direct.sources.length) return direct;

  const errors = [bridgeError, direct.error].filter(Boolean);
  return { sources: [], error: errors.length ? errors.join('; ') : 'Kodik: источники не найдены' };
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
