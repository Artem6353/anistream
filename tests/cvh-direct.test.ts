import { describe, expect, it } from 'vitest';
import {
  normalizeCvhStudio,
  parseCvhEmbedUrl,
  selectCvhPlaylistItem,
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
