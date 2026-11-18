import { describe, expect, it } from 'vitest';
import { episodeLinks } from '../scripts/lib/kodik-episode-links.mjs';

const ep = (name: string) => ({ link: `https://kodik.example/${name}` });

describe('Kodik season episode extraction', () => {
  it('flattens season-local episode numbers without overwriting earlier seasons', () => {
    const links = episodeLinks({
      seasons: {
        '1': { episodes: { '1': ep('s1e1'), '2': ep('s1e2') } },
        '2': { episodes: { '1': ep('s2e1'), '2': ep('s2e2') } },
      },
    });
    expect([...links]).toEqual([
      [1, 'https://kodik.example/s1e1'],
      [2, 'https://kodik.example/s1e2'],
      [3, 'https://kodik.example/s2e1'],
      [4, 'https://kodik.example/s2e2'],
    ]);
  });

  it('preserves numbering that already continues across seasons', () => {
    const links = episodeLinks({
      seasons: [
        { episodes: { '1': ep('e1'), '2': ep('e2') } },
        { episodes: { '3': ep('e3'), '4': ep('e4') } },
      ],
    });
    expect([...links.keys()]).toEqual([1, 2, 3, 4]);
    expect(links.get(4)).toBe('https://kodik.example/e4');
  });

  it('parses top-level episode arrays and normalizes Kodik entity-escaped URLs', () => {
    const links = episodeLinks({
      episodes: [
        { episode: 1, link: '//kodik.example/e1' },
        { episode: 2, link: 'https://kodik.example/e2?a=1&amp;b=2' },
      ],
    });
    expect([...links]).toEqual([
      [1, 'https://kodik.example/e1'],
      [2, 'https://kodik.example/e2?a=1&b=2'],
    ]);
  });

  it('ignores invalid URLs and supports standalone anime materials', () => {
    expect(episodeLinks({ episodes: { '1': { link: 'javascript:alert(1)' } } }).size).toBe(0);
    expect([...episodeLinks({ type: 'anime', link: '//kodik.example/movie' })]).toEqual([
      [1, 'https://kodik.example/movie'],
    ]);
  });
});
