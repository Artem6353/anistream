import { describe, expect, it } from 'vitest';
import { decodeEpisodeCacheValue, encodeEpisodeCacheValue, EPISODE_CACHE_COMPRESSION_PREFIX } from '../lib/providers/cache-codec.mjs';

describe('compressed episode cache codec', () => {
  it('round-trips all known episode fields and unknown extension fields', () => {
    const record = {
      at: 1_800_000_000_000,
      ttlMs: 86_400_000,
      extension: { revision: 4, enabled: false },
      sources: {
        sourcesUsed: ['cvh', 'kodik'],
        fromCache: false,
        cachedAt: 1_800_000_000_001,
        skip: { intro: [80, 170], outro: [1350, 1420] },
        errors: { aniboom: 'temporarily unavailable' },
        providerChecks: { cvh: 1_800_000_000_250 },
        futureMeta: { arbitrary: ['value', 2, null] },
        sources: [{
          id: 'kodik:voice:anime:1',
          label: 'Озвучка',
          providerId: 'kodik',
          providerName: 'Kodik',
          kind: 'embed',
          embedUrl: 'https://kodik.example/seria/123/hash',
          translationId: '81',
          voice: 'voice',
          contentType: 'anime-serial',
          providerExtension: { key: 'preserved' },
          guessed: false,
          files: [{ quality: '720p', url: 'https://cdn.example/video.m3u8', type: 'hls', extension: 'keep' }],
        }, {
          id: 'cvh:voice:anime:1',
          label: 'CVH',
          providerId: 'cvh',
          providerName: 'CVH',
          kind: 'embed',
          embedUrl: 'https://animego.example/embed/456',
        }],
      },
    };

    const encoded = encodeEpisodeCacheValue(record);
    expect(encoded.startsWith(EPISODE_CACHE_COMPRESSION_PREFIX)).toBe(true);
    expect(Buffer.byteLength(encoded, 'utf8')).toBeLessThan(Buffer.byteLength(JSON.stringify(record), 'utf8'));
    expect(decodeEpisodeCacheValue(encoded)).toEqual(record);
  });

  it('reads legacy plain JSON cache values without changing their shape', () => {
    const legacy = {
      at: 123,
      ttlMs: 5000,
      sources: {
        sources: [{ id: 'manual:1', label: 'Manual', providerId: 'manual', providerName: 'Manual', kind: 'embed', embedUrl: 'https://example.com/e1' }],
        sourcesUsed: ['manual'],
        fromCache: false,
      },
    };
    expect(decodeEpisodeCacheValue(JSON.stringify(legacy))).toEqual(legacy);
  });

  it('rejects malformed compressed payloads without leaking source content', () => {
    expect(() => decodeEpisodeCacheValue('z1:not-valid-base64!')).toThrow();
    expect(() => decodeEpisodeCacheValue('z1:YWJj')).toThrow();
  });
});
