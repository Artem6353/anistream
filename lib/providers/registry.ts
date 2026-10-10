import type { EpisodeSource, EpisodeSources, ProviderContext, ResolveOutcome } from './types';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { cacheGet, cacheSet, cacheKey, isDirectProviderSource } from './cache';
import { providerLabel } from './bridge';
import { resolveKodik } from './providers/kodik';
import { resolveCvh } from './providers/cvh';
import { resolveAniboom } from './providers/aniboom';
import { demoSources, DEMO_SKIP } from './providers/demo';
import { synthesizeEpisode } from './synthesize';
import { metrics, metricLatency, metricErrorBump, sendTgAlert } from '@/lib/metrics';
import { promises as fs } from 'node:fs';
import { log } from '@/lib/logger';
import { readFileSync, statSync } from 'node:fs';

/** Ручные источники модератора: lib/data/manual-sources.json
    формат: { "<slug>": { "<episode>": [ { label, embedUrl?, files?: [{quality,url,type}], providerId? } ] } }
    Аудит 30.09 (P2-20): файл читался СИНХРОННО на каждый резолв серии (блокировка
    event-loop на горячем пути) — теперь mtime-кэш, как у titles.json. */
const MANUAL_FILE = 'lib/data/manual-sources.json';
let manualCache: { mtime: number; data: Record<string, Record<string, Array<Record<string, unknown>>>> } | null = null;
function manualData(): Record<string, Record<string, Array<Record<string, unknown>>>> {
  try {
    const mtime = statSync(MANUAL_FILE).mtimeMs;
    if (manualCache && manualCache.mtime === mtime) return manualCache.data;
    const data = JSON.parse(readFileSync(MANUAL_FILE, 'utf8')) as Record<string, Record<string, Array<Record<string, unknown>>>>;
    manualCache = { mtime, data };
    return data;
  } catch {
    return {};
  }
}
function manualSources(slug: string, episode: number): EpisodeSource[] {
  try {
    const raw = manualData();
    const list = raw?.[slug]?.[String(episode)] ?? [];
    return list.map((m, i) => ({
      id: `manual:${slug}:${episode}:${i}`,
      label: String(m.label ?? `Ручной источник ${i + 1}`),
      providerId: String(m.providerId ?? 'manual'),
      providerName: 'Ручной источник',
      kind: m.embedUrl ? 'embed' : 'file',
      embedUrl: m.embedUrl as string | undefined,
      files: m.files as EpisodeSource['files'],
      voice: 'voice',
    })) as EpisodeSource[];
  } catch {
    return [];
  }
}

let errLogAt = 0;
async function logProviderErrors(slug: string, episode: number, errors: Record<string, string>) {
  const now = Date.now();
  if (now - errLogAt < 5000) return;
  errLogAt = now;
  try {
    await fs.mkdir('.cache', { recursive: true });
    await fs.appendFile('.cache/provider-errors.jsonl', JSON.stringify({ at: now, slug, episode, errors }) + '\n');
    log('warn', 'provider errors', { slug, episode, errors });
  } catch {}
}

export { providersWithAvailability, PROVIDERS, PROVIDER_IDS, demoStream, INTRO_WINDOW } from './registry-meta';
export { cacheStats, cacheKey } from './cache';
export { bridgeHealth } from './bridge';
export type { EpisodeSource, EpisodeSources, ProviderContext, ProviderMeta, SkipWindow, StreamFile } from './types';

type Resolver = (ctx: ProviderContext) => Promise<ResolveOutcome>;

const RESOLVERS: Record<string, Resolver> = {
  kodik: resolveKodik,
  cvh: resolveCvh,
  aniboom: resolveAniboom,
};

/** Таймаут резолва по провайдеру: bridge-таймаут + 500 мс grace, чтобы bridge успел ответить сам. */
function timeoutFor(id: string): number {
  const cfg = getProvidersConfig();
  const base = id === 'kodik' ? cfg.bridges.kodik.timeoutMs : cfg.bridges.multiplayer.timeoutMs;
  return Math.max(cfg.providerTimeoutMs, base + 500);
}

function enabledProviderIds(): string[] {
  const cfg = getProvidersConfig();
  const ids: string[] = [];
  if (cfg.bridges.kodik.url || (cfg.kodik.enabled && cfg.kodik.token)) ids.push('kodik');
  if (cfg.bridges.multiplayer.url) ids.push('cvh', 'aniboom');
  return ids;
}

/**
 * Provider Registry: единая точка входа для фронта.
 *   GET /api/providers/[slug]/[episode] → EpisodeSources
 * Схема оригинала: cache-first → bridge (kodik / multi-player) → merge озвучек
 * в единый список источников; demo добавляется как офлайн-база.
 * Все настроенные плееры ищутся параллельно; сбой одного не отменяет остальные.
 */
const EMPTY_PROVIDER_RETRY_MS = 10 * 60 * 1000;
const ERROR_PROVIDER_RETRY_MS = 45 * 1000;

/** Защита от повторных запросов к пустому/падающему провайдеру на одном процессе. */
const providerRetryAfter = new Map<string, number>();

function providerRetryKey(key: string, id: string): string {
  return `${key}:${id}`;
}

function rememberProviderRetry(key: string, until: number): void {
  /* Ограничиваем вспомогательную память при большой гидрации каталога. */
  if (providerRetryAfter.size >= 10_000) {
    const now = Date.now();
    for (const [entryKey, expiresAt] of providerRetryAfter) {
      if (expiresAt <= now) providerRetryAfter.delete(entryKey);
    }
    while (providerRetryAfter.size >= 10_000) {
      const first = providerRetryAfter.keys().next();
      if (first.done) break;
      providerRetryAfter.delete(first.value);
    }
  }
  providerRetryAfter.set(key, until);
}

function hasUsableProviderSource(
  sources: EpisodeSource[],
  providerId: string,
  ctx: ProviderContext,
): boolean {
  return sources.some((source) =>
    source.providerId === providerId &&
    isDirectProviderSource(source) &&
    (!ctx.preferFiles || (source.kind === 'file' && (source.files?.length ?? 0) > 0)),
  );
}

function isTransientProviderError(error: string | undefined): boolean {
  if (!error) return false;
  /* Явное отсутствие материала — негативный результат; всё остальное считаем временной ошибкой. */
  return !/not found|no voices|no sources|no source|no material|no episodes|ambiguous exact title|title year mismatch|не найден|нет источников|нет источника|нет ссылок|нет голосов|нет голоса/i.test(error);
}

function shouldResolveProvider(
  id: string,
  key: string,
  base: EpisodeSources | null,
  ctx: ProviderContext,
  forceLive: boolean,
): boolean {
  if (forceLive) return true;
  if (base && hasUsableProviderSource(base.sources, id, ctx)) return false;
  const persistedUntil = base?.providerChecks?.[id] ?? 0;
  const memoryUntil = providerRetryAfter.get(providerRetryKey(key, id)) ?? 0;
  return Math.max(persistedUntil, memoryUntil) <= Date.now();
}

async function runProviderQueries(
  ids: string[],
  ctx: ProviderContext,
): Promise<Array<{ id: string; outcome: ResolveOutcome }>> {
  return Promise.all(ids.map(async (id) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<ResolveOutcome>((resolve) => {
      timer = setTimeout(() => resolve({ sources: [], error: 'timeout' }), timeoutFor(id));
    });
    try {
      const outcome = await Promise.race([
        RESOLVERS[id](ctx).catch((e) => ({
          sources: [],
          error: e instanceof Error ? e.message : String(e),
        }) as ResolveOutcome),
        timeout,
      ]);
      return { id, outcome };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }));
}

/**
 * Единый поиск по всем активным провайдерам.
 * Cache-first, но кэш одного плеера больше не блокирует поиск остальных:
 * недостающие провайдеры запрашиваются параллельно и добавляются в общий список.
 * Отрицательные результаты имеют TTL, чтобы не дергать недоступные источники на каждом просмотре.
 */
export async function resolveEpisodeSources(
  ctx: ProviderContext,
  options: { liveOnly?: boolean } = {},
): Promise<EpisodeSources> {
  const key = cacheKey(ctx.slug, ctx.episode);

  /* 0) ручные источники модератора — приоритет над всем */
  const manual = manualSources(ctx.slug, ctx.episode);
  if (manual.length) return withDemo({ sources: manual, sourcesUsed: ['manual'], fromCache: false }, ctx);

  /* 1) Читаем кэш; в liveOnly режиме пропускаем его полностью. */
  const t0 = Date.now();
  const cached = options.liveOnly ? null : await cacheGet(key);
  const cachedHasFiles = Boolean(
    cached?.sources.some((s) => s.kind === 'file' && (s.files?.length ?? 0) > 0),
  );
  const cacheUsable = Boolean(
    cached?.sources.length && (!ctx.preferFiles || cachedHasFiles),
  );
  const base = cacheUsable ? cached : null;
  const forceLive = Boolean(options.liveOnly || (ctx.preferFiles && !cacheUsable));

  if (base) metrics.cacheHit++;
  else metrics.cacheMiss++;

  /* 2) Резолверы запускаются одновременно. Наличие Kodik в кэше не отключает CVH/AniBoom. */
  const enabledIds = enabledProviderIds();
  const ids = enabledIds.filter((id) => shouldResolveProvider(id, key, base, ctx, forceLive));

  if (!ids.length && base) {
    metricLatency(Date.now() - t0);
    return withDemo({
      ...base,
      fromCache: true,
      cachedAt: base.cachedAt ?? Date.now(),
    }, ctx);
  }

  const outcomes = await runProviderQueries(ids, ctx);
  const checks: Record<string, number> = { ...(base?.providerChecks ?? {}) };
  const errors: Record<string, string> = {};
  const liveSources: EpisodeSource[] = [];
  let skip = base?.skip;

  for (const { id, outcome } of outcomes) {
    const providerSources = outcome.sources.filter((source) =>
      source.providerId === id && isDirectProviderSource(source),
    );
    if (providerSources.length) {
      metrics.liveOk++;
      delete checks[id];
      if (!forceLive) providerRetryAfter.delete(providerRetryKey(key, id));
    } else {
      metrics.liveFail++;
      if (outcome.error) errors[id] = outcome.error;
      if (!forceLive) {
        const retryAt = Date.now() + (
          isTransientProviderError(outcome.error)
            ? ERROR_PROVIDER_RETRY_MS
            : EMPTY_PROVIDER_RETRY_MS
        );
        checks[id] = retryAt;
        rememberProviderRetry(providerRetryKey(key, id), retryAt);
      }
    }
    liveSources.push(...providerSources);
    skip = skip ?? outcome.skip;
  }

  const oldSources = base?.sources ?? [];
  const merged = dedupe([...oldSources, ...liveSources]);
  const providersUsed = [...new Set(merged.filter(isDirectProviderSource).map((source) => source.providerId))];

  const result: EpisodeSources = {
    sources: merged,
    sourcesUsed: providersUsed,
    fromCache: Boolean(base && ids.length === 0),
    cachedAt: base?.cachedAt,
    skip,
    errors: Object.keys(errors).length ? errors : undefined,
    providerChecks: Object.keys(checks).length ? checks : undefined,
  };

  if (Object.keys(errors).length) {
    void logProviderErrors(ctx.slug, ctx.episode, errors);
    if (metricErrorBump()) {
      void sendTgAlert(`⚠ AniNova: 20+ ошибок парсеров за час (последняя: ${ctx.slug} ep${ctx.episode} ${JSON.stringify(errors).slice(0, 120)})`);
    }
  }
  metricLatency(Date.now() - t0);

  /* 3) Если новых прямых источников нет, сохраняем безопасный синтез как fallback. */
  if (!merged.length && !options.liveOnly) {
    const synth = await synthesizeEpisode(ctx);
    if (synth?.sources.length) {
      if (synth.sources.some((source) => source.guessed)) metrics.guess++;
      else metrics.synth++;
      return withDemo(synth, ctx);
    }
  }

  /* 4) Сохраняем объединённый список + короткие retry-окна недоступных провайдеров. */
  if (merged.length) await cacheSet(key, result);
  else metrics.demo++;

  return withDemo(result, ctx);
}

function dedupe(sources: EpisodeSource[]): EpisodeSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    /* Один URL у разных плееров не скрывает альтернативный источник. */
    const target = source.embedUrl ?? source.files?.[0]?.url ?? source.id;
    const key = `${source.providerId}:${target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Demo-источник всегда в конце списка — офлайн-база и фолбэк плеера. */
function withDemo(result: EpisodeSources, ctx: ProviderContext): EpisodeSources {
  const cfg = getProvidersConfig();
  if (!cfg.demo.listed && result.sources.length) return result;
  if (result.sources.some((s) => s.providerId === 'demo')) return result;
  return {
    ...result,
    sources: [...result.sources, ...demoSources(ctx)],
    skip: result.skip ?? DEMO_SKIP,
  };
}

export function contextFromTitle(
  title: {
    slug: string;
    anilistId: number;
    malId?: number | null;
    shikimori?: { id: number } | null;
    ru: string;
    romaji: string;
    year: number;
    type: string;
    episodes: number;
  },
  episode: number,
): ProviderContext {
  return {
    slug: title.slug,
    anilistId: title.anilistId,
    malId: title.malId,
    shikimoriId: title.shikimori?.id,
    title: title.ru,
    originalTitle: title.romaji,
    year: title.year,
    format: title.type,
    episodesCount: title.episodes,
    isAdult: false,
    episode,
    totalEpisodes: title.episodes,
  };
}

export { providerLabel };
