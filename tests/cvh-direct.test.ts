import { describe, expect, it, vi } from 'vitest';
import {
  normalizeCvhStudio,
  parseCvhEmbedUrl,
  selectCvhPlaylistItem,
  resolveCvhDirectSource,
  cvhAvailableEpisodes,
} from '../lib/providers/cvh-direct';

describe('CVH direct resolver parsing', () => {
  it('parses current query-string dubbing URLs', () => {
    expect(parseCvhEmbedUrl('https://animego.me/cdn-iframe/457/1/26?dubbing=SHIZA%20Project'))
      .toEqual({ id: '457', season: 1, episode: 26, studio: 'SHIZA Project' });
  });

  it('parses the legacy path-based studio format', () => {
    expect(parseCvhEmbedUrl('https://animego.me/cdn-iframe/457/SHIZA%20Project/2/4'))
      .toEqual({ id: '457', season: 2, episode: 4, studio: 'SHIZA Project' });
  });

  it('normalizes studio names without punctuation or case sensitivity', () => {
    expect(normalizeCvhStudio('SHIZA Project')).toBe(normalizeCvhStudio('shiza-project'));
  });

  it('selects the exact episode, season and dubbing from the live playlist', () => {
    const items = [
      { vkId: 'wrong-season', voiceStudio: 'SHIZA Project', season: 2, episode: 26 },
      { vkId: 'wrong-dub', voiceStudio: 'Anything Group', season: 1, episode: 26 },
      { vkId: 'right', voiceStudio: 'SHIZA Project', season: 1, episode: 26 },
    ];
    expect(selectCvhPlaylistItem(items, { season: 1, episode: 26, studio: 'SHIZA Project' })?.vkId)
      .toBe('right');
  });

  it('does not invent an item when the studio is absent', () => {
    expect(selectCvhPlaylistItem([], { season: 1, episode: 1, studio: 'SHIZA Project' })).toBeNull();
  });
});

describe('CVH direct stream resolution', () => {
  it('returns adaptive HLS and available MP4 qualities for the exact voice', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          { vkId: 'cvh-wrong', voiceStudio: 'Anything Group', season: 1, episode: 26 },
          { vkId: 'cvh-right', voiceStudio: 'SHIZA Project', season: 1, episode: 26 },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sources: {
          hlsUrl: 'https://video.example/master.m3u8',
          mpegHighUrl: 'https://video.example/720.mp4',
          mpegFullHdUrl: 'https://video.example/1080.mp4',
          mpegMediumUrl: '',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await resolveCvhDirectSource({
        id: 'cvh:shiza:26',
        label: 'CVH · SHIZA Project',
        providerId: 'cvh',
        providerName: 'CVH (AnimeGo)',
        kind: 'embed',
        embedUrl: 'https://animego.me/cdn-iframe/98765/1/1?dubbing=SHIZA%20Project',
        translationId: 'shiza',
        voice: 'voice',
      }, 26);

      expect(result?.kind).toBe('file');
      expect(result?.files).toEqual([
        { quality: 'auto', url: 'https://video.example/master.m3u8', type: 'hls' },
        { quality: '1080', url: 'https://video.example/1080.mp4', type: 'mp4' },
        { quality: '720', url: 'https://video.example/720.mp4', type: 'mp4' },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('CVH live episode availability', () => {
  it('returns only episodes present for the selected studio and season', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      items: [
        { vkId: 'one', voiceStudio: 'SHIZA Project', season: 1, episode: 1 },
        { vkId: 'two', voiceStudio: 'SHIZA Project', season: 1, episode: 2 },
        { vkId: 'other', voiceStudio: 'Anything Group', season: 1, episode: 2 },
        { vkId: 'season-two', voiceStudio: 'SHIZA Project', season: 2, episode: 1 },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(cvhAvailableEpisodes(
        'https://animego.me/cdn-iframe/98766/1/1?dubbing=SHIZA%20Project',
      )).resolves.toEqual([1, 2]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns null rather than an empty result when the CVH API fails', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(cvhAvailableEpisodes(
        'https://animego.me/cdn-iframe/98767/1/1?dubbing=SHIZA%20Project',
      )).resolves.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
