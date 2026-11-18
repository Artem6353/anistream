import { describe, expect, it } from 'vitest';
import type { EpisodeSources } from '../lib/providers/types';
import { synthesizableEpisodeLimit, synthesizeCachedEpisodeSources } from '../lib/providers/synthesize';

const base: EpisodeSources = {
  fromCache: true,
  sourcesUsed: ['aniboom', 'cvh'],
  sources: [
    {
      id: 'aniboom:9:1',
      label: 'AniBoom · 2x2',
      providerId: 'aniboom',
      providerName: 'AniBoom',
      kind: 'embed',
      embedUrl: 'https://aniboom.one/embed/id?episode=1&translation=9',
      translationId: '9',
      episodesCount: 1,
      voice: 'voice',
    },
    {
      id: 'cvh:2:1',
      label: 'CVH · SHIZA Project',
      providerId: 'cvh',
      providerName: 'CVH (AnimeGo)',
      kind: 'embed',
      embedUrl: 'https://animego.me/cdn-iframe/457/1/1?dubbing=SHIZA%20Project',
      translationId: '2',
      episodesCount: 26,
      voice: 'voice',
    },
    {
      id: 'kodik:1045:1',
      label: 'Kodik · Suzaku',
      providerId: 'kodik',
      providerName: 'Kodik',
      kind: 'embed',
      embedUrl: 'https://kodikplayer.com/seria/1/hash/720p',
      translationId: '1045',
      episodesCount: 26,
      voice: 'voice',
    },
  ],
};

describe('cached provider template limits', () => {
  it('rewrites only providers whose reported range includes the requested episode', () => {
    const result = synthesizeCachedEpisodeSources(base, 5);
    expect(result).toHaveLength(1);
    expect(result[0].providerId).toBe('cvh');
    expect(result[0].embedUrl).toBe('https://animego.me/cdn-iframe/457/1/5?dubbing=SHIZA%20Project');
    expect(result[0].synthesized).toBe(true);
  });

  it('does not extrapolate any template beyond its reported episode count', () => {
    expect(synthesizeCachedEpisodeSources(base, 27)).toEqual([]);
  });

  it('does not treat a missing episode count as unlimited', () => {
    const unknownLimit: EpisodeSources = {
      ...base,
      sources: base.sources.map((source) => {
        const copy = { ...source };
        delete copy.episodesCount;
        return copy;
      }),
    };
    expect(synthesizeCachedEpisodeSources(unknownLimit, 2)).toEqual([]);
  });

  it('never synthesizes Kodik URLs, even inside the reported range', () => {
    const kodikOnly: EpisodeSources = {
      ...base,
      sources: [base.sources[2]],
    };
    expect(synthesizeCachedEpisodeSources(kodikOnly, 2)).toEqual([]);
  });
});

describe('provider template coverage validation', () => {
  it('reports a range only for a supported, rewritable CVH or AniBoom template', () => {
    expect(synthesizableEpisodeLimit('cvh', 'https://animego.me/cdn-iframe/457/1/1?dubbing=SHIZA', 26)).toBe(26);
    expect(synthesizableEpisodeLimit('aniboom', 'https://aniboom.one/embed/id?episode=1&translation=9', 100)).toBe(100);
  });

  it('does not mark exact Kodik links or malformed URLs as synthesizable', () => {
    expect(synthesizableEpisodeLimit('kodik', 'https://kodikplayer.com/seria/1/hash/720p', 26)).toBe(0);
    expect(synthesizableEpisodeLimit('cvh', 'https://animego.me/player/1', 26)).toBe(0);
  });

  it('does not infer coverage when the provider did not report an episode count', () => {
    expect(synthesizableEpisodeLimit('cvh', 'https://animego.me/cdn-iframe/457/1/1', null)).toBe(0);
    expect(synthesizableEpisodeLimit('aniboom', 'https://aniboom.one/embed/id?episode=1', 0)).toBe(0);
  });
});
