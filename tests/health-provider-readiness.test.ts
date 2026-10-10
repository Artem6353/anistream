import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allTitles: vi.fn(),
  providersWithAvailability: vi.fn(),
  getProvidersConfig: vi.fn(),
  kvEnabled: vi.fn(),
  kvPing: vi.fn(),
}));

vi.mock('@/lib/catalog', () => ({
  allTitles: mocks.allTitles,
}));

vi.mock('@/lib/providers/registry-meta', () => ({
  providersWithAvailability: mocks.providersWithAvailability,
}));

vi.mock('@/lib/config/providers.config', () => ({
  getProvidersConfig: mocks.getProvidersConfig,
}));

vi.mock('@/lib/providers/cache-kv', () => ({
  kvEnabled: mocks.kvEnabled,
  kvPing: mocks.kvPing,
}));

import { GET } from '../app/api/health/route';

describe('provider configuration in health endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allTitles.mockReturnValue(Array.from({ length: 42 }, (_, i) => ({ slug: `title-${i}` })));
    mocks.providersWithAvailability.mockReturnValue([
      { id: 'demo', label: 'AniNova Demo', available: true },
      { id: 'kodik', label: 'Kodik', available: false },
      { id: 'cvh', label: 'CVH (AnimeGo)', available: false },
      { id: 'aniboom', label: 'AniBoom', available: false },
    ]);
    mocks.getProvidersConfig.mockReturnValue({ cache: { enabled: true, write: true } });
    mocks.kvEnabled.mockReturnValue(false);
    mocks.kvPing.mockResolvedValue(true);
  });

  it('reports which providers are configured without exposing URLs or credentials', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.titles).toBe(42);
    expect(body.providerCache).toEqual({
      enabled: true,
      writesEnabled: true,
      backend: 'file',
      reachable: null,
    });
    expect(body.configuredProviders).toEqual([
      { id: 'demo', configured: true },
      { id: 'kodik', configured: false },
      { id: 'cvh', configured: false },
      { id: 'aniboom', configured: false },
    ]);

    const serialized = JSON.stringify(body.configuredProviders);
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain('token');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reports the configured cache backend without exposing Redis credentials', async () => {
    mocks.kvEnabled.mockReturnValue(true);

    const response = await GET();
    const body = await response.json();

    expect(body.providerCache).toEqual({
      enabled: true,
      writesEnabled: true,
      backend: 'upstash',
      reachable: true,
    });
    expect(JSON.stringify(body.providerCache)).not.toContain('token');
    expect(JSON.stringify(body.providerCache)).not.toContain('https://');
  });

  it('reports disabled cache distinctly from filesystem fallback', async () => {
    mocks.getProvidersConfig.mockReturnValue({ cache: { enabled: false, write: false } });

    const response = await GET();
    const body = await response.json();

    expect(body.providerCache).toEqual({
      enabled: false,
      writesEnabled: false,
      backend: 'disabled',
      reachable: null,
    });
  });

  it('reports an unreachable configured Redis backend without crashing health checks', async () => {
    mocks.kvEnabled.mockReturnValue(true);
    mocks.kvPing.mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.providerCache).toEqual({
      enabled: true,
      writesEnabled: true,
      backend: 'upstash',
      reachable: false,
    });
  });

  it('keeps site health separate from provider configuration readiness', async () => {
    mocks.providersWithAvailability.mockReturnValue([
      { id: 'demo', label: 'AniNova Demo', available: true },
      { id: 'kodik', label: 'Kodik', available: false },
      { id: 'cvh', label: 'CVH (AnimeGo)', available: false },
      { id: 'aniboom', label: 'AniBoom', available: false },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.configuredProviders.filter((provider: { id: string; configured: boolean }) =>
      provider.id !== 'demo' && provider.configured,
    )).toEqual([]);
  });
});
