import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCacheEntryExpired, isDirectProviderSource } from '../lib/providers/cache';
import { getProvidersConfig } from '../lib/config/providers.config';

describe('provider cache TTL', () => {
  it('marks entries older than their own TTL as expired', () => {
    expect(isCacheEntryExpired({ at: Date.now() - 20_000, ttlMs: 10_000 }, 60_000)).toBe(true);
  });

  it('uses the configured TTL when an entry has no override', () => {
    expect(isCacheEntryExpired({ at: Date.now() - 20_000 }, 10_000)).toBe(true);
  });

  it('keeps fresh entries', () => {
    expect(isCacheEntryExpired({ at: Date.now(), ttlMs: 60_000 }, 10_000)).toBe(false);
  });

  it('rejects invalid timestamps instead of treating them as fresh', () => {
    expect(isCacheEntryExpired({ at: Number.NaN, ttlMs: 60_000 }, 10_000)).toBe(true);
  });
});

describe('direct provider source classification', () => {
  const source = {
    id: 'cvh:episode:1',
    label: 'CVH',
    providerId: 'cvh',
    providerName: 'CVH (AnimeGo)',
    kind: 'embed' as const,
    embedUrl: 'https://animego.me/cdn-iframe/123/1/1/1',
  };

  it('accepts a direct resolver result', () => {
    expect(isDirectProviderSource(source)).toBe(true);
  });

  it('rejects demo, guessed, and synthesized sources', () => {
    expect(isDirectProviderSource({ ...source, providerId: 'demo' })).toBe(false);
    expect(isDirectProviderSource({ ...source, guessed: true })).toBe(false);
    expect(isDirectProviderSource({ ...source, synthesized: true })).toBe(false);
  });

  it('rejects legacy synthesized cache IDs', () => {
    expect(isDirectProviderSource({ ...source, id: 'cvh:episode:1:s12' })).toBe(false);
  });
});

describe('provider cache default configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('matches the documented 24-hour cache TTL when no override is set', () => {
    vi.stubEnv('KODIK_CACHE_TTL_MS', '');
    expect(getProvidersConfig().cache.ttlMs).toBe(86_400_000);
  });
});
