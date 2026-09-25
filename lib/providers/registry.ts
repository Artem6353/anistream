import type { EpisodeSource, EpisodeSources, ProviderContext, ResolveOutcome } from './types';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { cacheGet, cacheSet, cacheKey } from './cache';
import { providerLabel } from './bridge';
import { resolveKodik } from './providers/kodik';
import { resolveCvh } from './providers/cvh';
import { resolveAniboom } from './providers/aniboom';
import { demoSources, DEMO_SKIP } from './providers/demo';
import { synthesizeEpisode } from './synthesize';
import { metrics, metricLatency, metricErrorBump, sendTgAlert } from '@/lib/metrics';
import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';

/** Ручные источники модератора: lib/data/manual-sources.json
    формат: { "<slug>": { "<episode>": [ { label, embedUrl?, files?: [{quality,url,type}], providerId? } ] } } */
function manualSources(slug: string, episode: number): EpisodeSource[] {
  try {
    const raw = JSON.parse(readFileSync('lib/data/manual-sources.json', 'utf8')) as Record<string, Record<string, Array<Record<string, unknown>>>>;
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
 * PROVIDER_MODE: merge (ждем всех с таймаутом) | first (первый ответивший).
 */
export async function resolveEpisodeSources(ctx: ProviderContext): Promise<EpisodeSources> {
  const cfg = getProvidersConfig();
  const key = cacheKey(ctx.slug, ctx.episode);

  /* 0) ручные источники модератора — приоритет над всем */
  const manual = manualSources(ctx.slug, ctx.episode);
  if (manual.length) return withDemo({ sources: manual, sourcesUsed: ['manual'], fromCache: false }, ctx);

  /* 1) cache-first */
  const t0 = Date.now();
  const cached = await cacheGet(key);
  if (cached && cached.sources.length) {
    metrics.cacheHit++;
    metricLatency(Date.now() - t0);
    return withDemo({ ...cached, fromCache: true, cachedAt: cached.cachedAt ?? Date.now() }, ctx);
  }
  metrics.cacheMiss++;

  /* 2) live: провайдеры по конфигу (bridge важнее guess-синтеза) */
  const ids = enabledProviderIds();
  const errors: Record<string, string> = {};
  const collected: EpisodeSource[] = [];
  const used: string[] = [];
  let skip: EpisodeSources['skip'];

  if (ids.length) {
    if (cfg.providerMode === 'first') {
      const winner = await raceProviders(ids, ctx, errors);
      if (winner) {
        collected.push(...winner.sources);
        used.push(winner.id);
        skip = winner.skip;
      }
    } else {
      const outcomes = await Promise.all(
        ids.map(async (id) => {
          const timeout = new Promise<ResolveOutcome>((resolve) =>
            setTimeout(() => resolve({ sources: [], error: 'timeout' }), timeoutFor(id)),
          );
          const outcome = await Promise.race([
            RESOLVERS[id](ctx).catch((e) => ({ sources: [], error: String(e) }) as ResolveOutcome),
            timeout,
          ]);
          return { id, outcome };
        }),
      );
      for (const { id, outcome } of outcomes) {
        if (outcome.sources.length) metrics.liveOk++;
        else metrics.liveFail++;
        if (outcome.sources.length) {
          collected.push(...outcome.sources);
          used.push(id);
          skip = skip ?? outcome.skip;
        } else if (outcome.error) {
          errors[id] = outcome.error;
        }
      }
    }
  }

  /* 3) dedupe по embedUrl/id */
  const deduped = dedupe(collected);

  const result: EpisodeSources = {
    sources: deduped,
    sourcesUsed: used,
    fromCache: false,
    skip,
    errors: Object.keys(errors).length ? errors : undefined,
  };

  /* 3) синтез: шаблон из кэша других серий или guess-пул озвучек CVH (любой номер серии) */
  if (!deduped.length) {
    const synth = await synthesizeEpisode(ctx);
    if (synth?.sources.length) {
      if (synth.sources.some((x) => x.guessed)) metrics.guess++;
      else metrics.synth++;
      await cacheSet(key, synth);
      return withDemo(synth, ctx);
    }
  }

  if (Object.keys(errors).length) {
    void logProviderErrors(ctx.slug, ctx.episode, errors);
    if (metricErrorBump()) void sendTgAlert(`⚠ AniNova: 20+ ошибок парсеров за час (последняя: ${ctx.slug} ep${ctx.episode} ${JSON.stringify(errors).slice(0, 120)})`);
  }
  metricLatency(Date.now() - t0);

  /* 4) self-growing cache: miss → сохранили на будущее */
  if (deduped.length) await cacheSet(key, result);
  else metrics.demo++;

  return withDemo(result, ctx);
}

async function raceProviders(
  ids: string[],
  ctx: ProviderContext,
  errors: Record<string, string>,
): Promise<{ id: string; sources: EpisodeSource[]; skip?: EpisodeSources['skip'] } | null> {
  const cfg = getProvidersConfig();
  interface Slot {
    id: string;
    settled: boolean;
    promise: Promise<{ id: string; outcome: ResolveOutcome }>;
  }
  const slots: Slot[] = ids.map((id) => {
    const slot: Slot = { id, settled: false, promise: null as unknown as Slot['promise'] };
    slot.promise = Promise.race([
      RESOLVERS[id](ctx).catch((e) => ({ sources: [], error: e instanceof Error ? e.message : String(e) }) as ResolveOutcome),
      new Promise<ResolveOutcome>((resolve) => setTimeout(() => resolve({ sources: [], error: 'timeout' }), timeoutFor(id))),
    ]).then((outcome) => {
      slot.settled = true;
      return { id, outcome };
    });
    return slot;
  });

  while (slots.some((sl) => !sl.settled)) {
    const { id, outcome } = await Promise.race(slots.filter((sl) => !sl.settled).map((sl) => sl.promise));
    if (outcome.sources.length) return { id, sources: outcome.sources, skip: outcome.skip };
    if (outcome.error) errors[id] = outcome.error;
  }
  return null;
}

function dedupe(sources: EpisodeSource[]): EpisodeSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = s.embedUrl ?? s.files?.[0]?.url ?? s.id;
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
