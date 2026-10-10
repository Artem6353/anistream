import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProvidersConfig: vi.fn(),
  kvEnabled: vi.fn(),
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  kvDel: vi.fn(),
}));

vi.mock('@/lib/config/providers.config', () => ({
  getProvidersConfig: mocks.getProvidersConfig,
}));

vi.mock('../lib/providers/cache-kv', () => ({
  kvEnabled: mocks.kvEnabled,
  kvGet: mocks.kvGet,
  kvSet: mocks.kvSet,
  kvDel: mocks.kvDel,
}));

import { cacheEntriesForSlug } from '../lib/providers/cache';

const source = {
  id: 'kodik:episode:1',
  label: 'Kodik',
  providerId: 'kodik',
  providerName: 'Kodik',
  kind: 'embed',
  embedUrl: 'https://player.example/episode/1',
};

const entry = (at = Date.now()) => JSON.stringify({
  at,
  ttlMs: 86_400_000,
  sources: { sources: [source], sourcesUsed: ['kodik'], fromCache: false },
});

describe('Upstash episode index maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProvidersConfig.mockReturnValue({
      cache: { enabled: true, write: true, ttlMs: 86_400_000, file: '.cache/providers-resolve-cache.json' },
    });
    mocks.kvEnabled.mockReturnValue(true);
    mocks.kvSet.mockResolvedValue(undefined);
    mocks.kvDel.mockResolvedValue(undefined);
  });

  it('prunes index entries whose episode cache records are missing or expired', async () => {
    mocks.kvGet.mockImplementation(async (key: string) => {
      if (key === 'epidx:bleach') return '[1,2,3]';
      if (key === 'ep:ep:bleach:1') return entry();
      if (key === 'ep:ep:bleach:2') return null;
      if (key === 'ep:ep:bleach:3') return entry(Date.now() - 90_000_000);
      return null;
    });

    const records = await cacheEntriesForSlug('bleach');

    expect(records.map((record) => record.episode)).toEqual([1]);
    expect(mocks.kvSet).toHaveBeenCalledWith('epidx:bleach', '[1]', 30 * 86_400);
    expect(mocks.kvDel).not.toHaveBeenCalled();
  });

  it('deletes an empty index once all indexed episode reads succeed but find no records', async () => {
    mocks.kvGet.mockImplementation(async (key: string) => {
      if (key === 'epidx:bleach') return '[1,2]';
      return null;
    });

    const records = await cacheEntriesForSlug('bleach');

    expect(records).toEqual([]);
    expect(mocks.kvDel).toHaveBeenCalledWith('epidx:bleach');
    expect(mocks.kvSet).not.toHaveBeenCalled();
  });

  it('does not delete or rewrite an index when Redis reads fail transiently', async () => {
    mocks.kvGet.mockImplementation(async (key: string) => {
      if (key === 'epidx:bleach') return '[1,2]';
      if (key === 'ep:ep:bleach:1') throw new Error('temporary connection error');
      if (key === 'ep:ep:bleach:2') return null;
      return null;
    });

    await cacheEntriesForSlug('bleach');

    expect(mocks.kvDel).not.toHaveBeenCalled();
    expect(mocks.kvSet).not.toHaveBeenCalled();
  });
});
