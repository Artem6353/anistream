import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EpisodeSource, ProviderContext } from '../lib/providers/types';

const mocks = vi.hoisted(() => ({
  bridgeResolve: vi.fn(),
  getProvidersConfig: vi.fn(),
  resolveKodikDirect: vi.fn(),
}));

vi.mock('../lib/providers/bridge', () => ({
  bridgeResolve: mocks.bridgeResolve,
  providerLabel: () => 'Kodik',
}));
vi.mock('@/lib/config/providers.config', () => ({
  getProvidersConfig: mocks.getProvidersConfig,
}));
vi.mock('../lib/providers/kodik-direct', () => ({
  resolveKodikDirect: mocks.resolveKodikDirect,
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

const kodikSource: EpisodeSource = {
  id: 'kodik:test:1',
  label: 'Kodik test',
  providerId: 'kodik',
  providerName: 'Kodik',
  kind: 'embed',
  embedUrl: 'https://kodikplayer.com/seria/test',
};

describe('Kodik fallback policy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getProvidersConfig.mockReturnValue({
      bridges: {
        kodik: { url: 'https://bridge.example.test/kodik', timeoutMs: 6000 },
      },
    });
    mocks.bridgeResolve.mockResolvedValue({ sources: [], error: 'Kodik: episode-specific sources not found' });
    mocks.resolveKodikDirect.mockResolvedValue({ sources: [kodikSource] });
  });

  it('does not pay for a second Kodik lookup after a healthy bridge confirms a miss', async () => {
    const { resolveKodik } = await import('../lib/providers/providers/kodik');

    const result = await resolveKodik(context);

    expect(result.sources).toEqual([]);
    expect(result.error).toContain('episode-specific sources not found');
    expect(mocks.resolveKodikDirect).not.toHaveBeenCalled();
  });

  it('falls back to direct API when bridge health-gate reports unavailable', async () => {
    mocks.bridgeResolve.mockResolvedValue({
      sources: [],
      error: 'bridge offline (health-gate)',
    });

    const { resolveKodik } = await import('../lib/providers/providers/kodik');

    const result = await resolveKodik(context);

    expect(result.sources).toEqual([kodikSource]);
    expect(mocks.resolveKodikDirect).toHaveBeenCalledTimes(1);
  });

  it('uses direct API when no bridge is configured', async () => {
    mocks.getProvidersConfig.mockReturnValue({
      bridges: { kodik: { url: '', timeoutMs: 6000 } },
    });

    const { resolveKodik } = await import('../lib/providers/providers/kodik');

    const result = await resolveKodik(context);

    expect(result.sources).toEqual([kodikSource]);
    expect(mocks.bridgeResolve).not.toHaveBeenCalled();
    expect(mocks.resolveKodikDirect).toHaveBeenCalledTimes(1);
  });
});
