import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EpisodeSource, EpisodeSources, ProviderContext, ResolveOutcome } from '../lib/providers/types';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  kodik: vi.fn(),
  cvh: vi.fn(),
  aniboom: vi.fn(),
  synthesize: vi.fn(),
}));

vi.mock('@/lib/config/providers.config', () => ({
  getProvidersConfig: mocks.getConfig,
}));

vi.mock('@/lib/providers/cache', () => ({
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
  cacheKey: (slug: string, episode: number) => `ep:${slug}:${episode}`,
  isDirectProviderSource: (source: EpisodeSource) =>
    source.providerId !== 'demo' &&
    !source.guessed &&
    !source.synthesized &&
    !/:s\d+$/.test(source.id),
}));

vi.mock('@/lib/providers/bridge', () => ({
  providerLabel: (provider: string) => provider,
  bridgeHealth: vi.fn(),
}));

vi.mock('@/lib/providers/providers/kodik', () => ({ resolveKodik: mocks.kodik }));
vi.mock('@/lib/providers/providers/cvh', () => ({ resolveCvh: mocks.cvh }));
vi.mock('@/lib/providers/providers/aniboom', () => ({ resolveAniboom: mocks.aniboom }));
vi.mock('@/lib/providers/demo', () => ({ demoSources: () => [], DEMO_SKIP: undefined }));
vi.mock('@/lib/providers/synthesize', () => ({ synthesizeEpisode: mocks.synthesize }));
vi.mock('@/lib/metrics', () => ({
  metrics: { cacheHit: 0, cacheMiss: 0, liveOk: 0, liveFail: 0, guess: 0, synth: 0, demo: 0 },
  metricLatency: vi.fn(),
  metricErrorBump: () => false,
  sendTgAlert: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));
vi.mock('@/lib/providers/registry-meta', () => ({
  providersWithAvailability: () => [],
  PROVIDERS: [],
  PROVIDER_IDS: [],
  demoStream: vi.fn(),
  INTRO_WINDOW: [8, 95],
}));

const context: ProviderContext = {
  slug: 'test-anime',
  anilistId: 1,
  malId: 1,
  shikimoriId: 1,
  title: 'Test Anime',
  originalTitle: 'Test Anime',
  year: 2024,
  format: 'tv',
  episodesCount: 12,
  isAdult: false,
  episode: 1,
  totalEpisodes: 12,
};

const source = (providerId: string): EpisodeSource => ({
  id: `${providerId}:episode:1`,
  label: providerId,
  providerId,
  providerName: providerId,
  kind: 'embed',
  embedUrl: `https://${providerId}.example/episode/1`,
});

const outcome = (providerId: string): ResolveOutcome => ({ sources: [source(providerId)] });

const config = () => ({
  demo: { listed: false },
  kodik: { enabled: true, token: 'test-token', timeoutMs: 100 },
  bridges: {
    kodik: { url: 'http://kodik-bridge', timeoutMs: 100 },
    multiplayer: { url: 'http://multiplayer-bridge', timeoutMs: 100 },
  },
  providerTimeoutMs: 100,
  providerMode: 'merge' as const,
  cache: { enabled: true, write: true, ttlMs: 60_000, file: '.cache/test.json' },
});

describe('unified player search', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue(config());
    mocks.cacheGet.mockResolvedValue({
      sources: [source('kodik')],
      sourcesUsed: ['kodik'],
      fromCache: true,
    } satisfies EpisodeSources);
    mocks.cacheSet.mockResolvedValue(undefined);
    mocks.kodik.mockResolvedValue(outcome('kodik'));
    mocks.cvh.mockResolvedValue(outcome('cvh'));
    mocks.aniboom.mockResolvedValue(outcome('aniboom'));
    mocks.synthesize.mockResolvedValue(null);
  });

  it('queries CVH and AniBoom in parallel even when Kodik is already cached', async () => {
    mocks.cvh.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(mocks.aniboom).toHaveBeenCalledTimes(1);
      return outcome('cvh');
    });

    const { resolveEpisodeSources } = await import('../lib/providers/registry');

    const result = await resolveEpisodeSources(context);

    expect(mocks.kodik).not.toHaveBeenCalled();
    expect(mocks.cvh).toHaveBeenCalledTimes(1);
    expect(mocks.aniboom).toHaveBeenCalledTimes(1);
    expect(new Set(result.sources.map((item) => item.providerId))).toEqual(
      new Set(['kodik', 'cvh', 'aniboom']),
    );
    expect(result.fromCache).toBe(false);
    expect(mocks.cacheSet).toHaveBeenCalledTimes(1);
  });

  it('does not retry a provider before its negative-cache retry time', async () => {
    mocks.cacheGet.mockResolvedValue({
      sources: [source('kodik')],
      sourcesUsed: ['kodik'],
      fromCache: true,
      providerChecks: {
        cvh: Date.now() + 60_000,
        aniboom: Date.now() + 60_000,
      },
    } satisfies EpisodeSources);

    const { resolveEpisodeSources } = await import('../lib/providers/registry');
    const result = await resolveEpisodeSources(context);

    expect(mocks.cvh).not.toHaveBeenCalled();
    expect(mocks.aniboom).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.sources.map((item) => item.providerId)).toEqual(['kodik']);
  });

  it('keeps successful sources when another provider throws', async () => {
    mocks.cacheGet.mockResolvedValue(null);
    mocks.kodik.mockRejectedValue(new Error('Kodik upstream unavailable'));
    mocks.cvh.mockResolvedValue(outcome('cvh'));
    mocks.aniboom.mockResolvedValue(outcome('aniboom'));

    const { resolveEpisodeSources } = await import('../lib/providers/registry');
    const result = await resolveEpisodeSources(context);

    expect(result.sources.map((item) => item.providerId)).toEqual(
      expect.arrayContaining(['cvh', 'aniboom']),
    );
    expect(result.errors?.kodik).toContain('Kodik upstream unavailable');
  });
});
