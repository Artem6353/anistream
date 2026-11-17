import { describe, expect, it } from 'vitest';
import {
  markTask,
  maxCatalogEpisode,
  parseState,
  pruneState,
  releasedEpisodes,
  selectTitles,
  shouldSkipTask,
  taskKey,
} from '../scripts/lib/hydrate-plan.mjs';

/**
 * Гидратор: граница серий, фильтр «гигантов» и resume-состояние.
 *
 * Регресс: верхняя граница бралась из `title.episodes`, поэтому у 244 тайтлов с
 * `episodes: null` проверялась только первая серия, а заглушки 12/24 обрезали
 * онгоинги. Здесь зафиксировано правило lib/episodes.ts.
 */

const ongoing = {
  slug: 'one-piece',
  status: 'ongoing',
  type: 'tv',
  episodes: null,
  episodesReleased: 1134,
  airing: Array.from({ length: 12 }, (_, i) => ({ ep: 1123 + i })),
};
const finished = { slug: 'naruto', status: 'finished', type: 'tv', episodes: 220 };
const stubOngoing = { slug: 'stub', status: 'ongoing', type: 'tv', episodes: 24, airing: [{ ep: 130 }] };
const movie = { slug: 'movie', status: 'finished', type: 'movie', episodes: null };
const upcoming = { slug: 'soon', status: 'upcoming', type: 'tv', episodes: 12 };
const fromEpdates = { slug: 'edates', status: 'finished', type: 'tv', episodes: 12, epdates: { 1: '', 2: '', 3: '' } };

describe('releasedEpisodes: граница = сколько вышло', () => {
  it('онгоинг с episodes: null берёт episodesReleased, а не 1 и не null', () => {
    expect(releasedEpisodes(ongoing)).toBe(1134);
  });

  it('онгоинг с заглушкой 24 не обрезается до 24', () => {
    expect(releasedEpisodes(stubOngoing)).toBe(130);
  });

  it('завершённый берёт объявленный итог', () => {
    expect(releasedEpisodes(finished)).toBe(220);
  });

  it('фильм без графика — одна серия', () => {
    expect(releasedEpisodes(movie)).toBe(1);
  });

  it('анонс с заглушкой 12 без графика — числа нет', () => {
    expect(releasedEpisodes(upcoming)).toBeNull();
  });

  it('epdates считается так же, как airing', () => {
    expect(maxCatalogEpisode(fromEpdates)).toBe(3);
    expect(releasedEpisodes(fromEpdates)).toBe(12);
  });
});

describe('selectTitles: фильтры прогона', () => {
  const catalog = [ongoing, finished, stubOngoing, movie, upcoming, { ...finished, slug: 'hidden-one', hidden: true }];

  it('по умолчанию пропускает анонсы и скрытые', () => {
    const { selected, skipped } = selectTitles(catalog, {});
    /* favourites у фикстур 0 → тай-брейк по slug (localeCompare). */
    expect(selected.map((t) => t.slug)).toEqual(['movie', 'naruto', 'one-piece', 'stub']);
    expect(skipped.upcoming).toBe(1);
    expect(skipped.hidden).toBe(1);
  });

  it('SKIP_EPISODES_GREATER_THAN отсекает длинные онгоинги', () => {
    const { selected, skipped } = selectTitles(catalog, { skipEpisodesGreaterThan: 500 });
    expect(selected.map((t) => t.slug)).toEqual(['movie', 'naruto', 'stub']);
    expect(skipped.giants).toBe(1); // one-piece 1134
  });

  it('сортирует по популярности, затем по slug', () => {
    const a = { ...finished, slug: 'a', favourites: 5 };
    const b = { ...finished, slug: 'b', favourites: 50 };
    expect(selectTitles([a, b], {}).selected.map((t) => t.slug)).toEqual(['b', 'a']);
  });

  it('skipNoShikimori уважается', () => {
    const withShiki = { ...finished, slug: 'has-shiki', shikimori: { id: 1 } };
    const { selected, skipped } = selectTitles([withShiki, finished], { skipNoShikimori: true });
    expect(selected.map((t) => t.slug)).toEqual(['has-shiki']);
    expect(skipped.noShikimori).toBe(1);
  });
});

describe('resume-состояние', () => {
  const now = 1_700_000_000_000;
  const retryMs = 60 * 60 * 1000;

  it('ok пропускается всегда, свежий none — до истечения retry', () => {
    const state = parseState(null);
    markTask(state, taskKey('a', 1), 'ok', now - 10 * 24 * 3600 * 1000);
    markTask(state, taskKey('a', 2), 'none', now - 10_000);
    expect(shouldSkipTask(state, 'a:1', now, retryMs)).toBe(true);
    expect(shouldSkipTask(state, 'a:2', now, retryMs)).toBe(true);
    expect(shouldSkipTask(state, 'a:2', now, 5_000)).toBe(false); // «старое» при коротком retry
    expect(shouldSkipTask(state, 'a:3', now, retryMs)).toBe(false); // не было попытки
  });

  it('HYDRATE_RETRY_MINUTES=0 → пустые серии повторяются', () => {
    const state = parseState(null);
    markTask(state, taskKey('a', 1), 'none', now);
    expect(shouldSkipTask(state, 'a:1', now, 0)).toBe(false);
  });

  it('битый файл состояния не роняет прогон', () => {
    expect(parseState({ tasks: { 'a:1': { s: 'oops', t: 1 }, 'a:2': { s: 'ok', t: 5 } } }).tasks).toEqual({
      'a:2': { s: 'ok', t: 5 },
    });
    expect(parseState('не объект').tasks).toEqual({});
  });

  it('pruneState держит файл в разумных размерах', () => {
    const state = parseState(null);
    markTask(state, 'old:1', 'none', now - 30 * 24 * 3600 * 1000);
    markTask(state, 'new:1', 'none', now);
    pruneState(state, now);
    expect(Object.keys(state.tasks)).toEqual(['new:1']);
  });
});
