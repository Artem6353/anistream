import { describe, expect, it } from 'vitest';
import type { Title } from '@/lib/types';
import {
  episodeAirDate,
  episodeName,
  episodeOfLabel,
  episodeWindow,
  formatWatchDate,
  previewAnimeHref,
} from '@/lib/aninova3/watch-view';

const base = {
  anilistId: 1,
  slug: 'x',
  ru: 'Тест',
  romaji: 'Test',
  type: 'tv',
  year: 2020,
  status: 'finished',
  episodes: 12,
  score: 7,
  favourites: 0,
  genres: [],
  poster: '',
  description: '',
} as Title;

describe('watch-view', () => {
  it('берёт только непустое название серии', () => {
    expect(episodeName({ ...base, episodeNames: { '3': '  Битва  ' } }, 3)).toBe('Битва');
    expect(episodeName({ ...base, episodeNames: { '3': '   ' } }, 3)).toBeNull();
    expect(episodeName(base, 3)).toBeNull();
  });

  it('дата: airing приоритетнее epdates, мусор игнорируется', () => {
    const t: Title = {
      ...base,
      airing: [{ ep: 5, at: 1_700_000_000_000 }],
      epdates: { '5': 1_600_000_000_000, '6': 1_650_000_000_000 },
    };
    expect(episodeAirDate(t, 5)).toBe(1_700_000_000_000);
    expect(episodeAirDate(t, 6)).toBe(1_650_000_000_000);
    expect(episodeAirDate(t, 7)).toBeNull();
    expect(episodeAirDate({ ...base, airing: [{ ep: 1, at: Number.NaN }] }, 1)).toBeNull();
  });

  it('форматирует дату по МСК и убирает «г.»', () => {
    const label = formatWatchDate(Date.UTC(1999, 9, 20, 12));
    expect(label).toBe('20 октября 1999');
    expect(formatWatchDate(Number.NaN)).toBe('');
  });

  it('окно серий не выходит за границы', () => {
    expect(episodeWindow(1, 1134, 3)).toEqual([1, 2, 3, 4]);
    expect(episodeWindow(1134, 1134, 3)).toEqual([1131, 1132, 1133, 1134]);
    expect(episodeWindow(500, 20, 3)).toEqual([17, 18, 19, 20]);
    expect(episodeWindow(5, 0)).toEqual([]);
  });


  it('переписывает только внутренние ссылки /anime', () => {
    expect(previewAnimeHref('/anime/one-piece')).toBe('/preview/aninova-3/anime/one-piece');
    expect(previewAnimeHref('/anime/one-piece/12?from=epbar#top')).toBe(
      '/preview/aninova-3/anime/one-piece/12?from=epbar#top',
    );
    expect(previewAnimeHref('/catalog')).toBeNull();
    expect(previewAnimeHref('https://example.com/anime/x')).toBeNull();
    expect(previewAnimeHref(null)).toBeNull();
  });

  it('подпись серии честно показывает неизвестный итог', () => {
    expect(episodeOfLabel(5, 12, false)).toBe('серия 5 из 12');
    expect(episodeOfLabel(5, 12, true)).toBe('серия 5 из 12+');
    expect(episodeOfLabel(1, 1, false)).toBe('серия 1');
  });
});
