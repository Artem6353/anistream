import { describe, expect, it } from 'vitest';
import { GENRE_MAX_REDIRECT_PAGE, genreHref, genreRedirectTarget, parseGenreSegment } from '../lib/genre-pages';

/**
 * Задача 3 аудита: редиректы со старых URL жанров (?sort=…&page=N) на сегменты пути.
 * Правило считается чистой функцией, поэтому проверяем таблицей, а не HTTP-запросами;
 * сквозную проверку делает scripts/smoke.mjs.
 */
const q = (s: string) => new URLSearchParams(s);

describe('genreRedirectTarget: старые query-URL → сегменты пути', () => {
  it('sort+page → /genre/<slug>/<sort>-<page>', () => {
    expect(genreRedirectTarget('/genre/comedy', q('sort=pop&page=2'))).toBe('/genre/comedy/pop-2');
    expect(genreRedirectTarget('/genre/comedy', q('sort=score&page=7'))).toBe('/genre/comedy/score-7');
    expect(genreRedirectTarget('/genre/action', q('page=3&sort=az'))).toBe('/genre/action/az-3');
  });

  it('только sort → первая страница этой сортировки', () => {
    expect(genreRedirectTarget('/genre/comedy', q('sort=score'))).toBe('/genre/comedy/score-1');
    expect(genreRedirectTarget('/genre/comedy', q('sort=new'))).toBe('/genre/comedy/new-1');
  });

  it('только page → сортировка по умолчанию', () => {
    expect(genreRedirectTarget('/genre/comedy', q('page=2'))).toBe('/genre/comedy/pop-2');
  });

  it('page=1 → базовый URL жанра', () => {
    expect(genreRedirectTarget('/genre/comedy', q('page=1'))).toBe('/genre/comedy');
    expect(genreRedirectTarget('/genre/comedy', q('sort=pop&page=1'))).toBe('/genre/comedy');
  });

  it('неизвестный sort → базовый URL (без цепочки редиректов)', () => {
    expect(genreRedirectTarget('/genre/comedy', q('sort=bad'))).toBe('/genre/comedy');
    expect(genreRedirectTarget('/genre/comedy', q('sort=POP'))).toBe('/genre/comedy');
    expect(genreRedirectTarget('/genre/comedy', q('sort=bad&page=2'))).toBe('/genre/comedy/pop-2');
  });

  it('нечисло / 0 / отрицательное / запредельное page → базовый URL', () => {
    expect(genreRedirectTarget('/genre/comedy', q('page=abc'))).toBe('/genre/comedy');
    expect(genreRedirectTarget('/genre/comedy', q('page=0'))).toBe('/genre/comedy');
    expect(genreRedirectTarget('/genre/comedy', q('page=-3'))).toBe('/genre/comedy');
    expect(genreRedirectTarget('/genre/comedy', q('page=2.5'))).toBe('/genre/comedy');
    expect(genreRedirectTarget('/genre/comedy', q(`page=${GENRE_MAX_REDIRECT_PAGE + 1}`))).toBe('/genre/comedy');
    expect(genreRedirectTarget('/genre/comedy', q('page=999999999999'))).toBe('/genre/comedy');
  });

  it('utm и прочие параметры отбрасываются', () => {
    expect(genreRedirectTarget('/genre/comedy', q('sort=score&page=2&utm_source=telegram&utm_medium=cpc'))).toBe('/genre/comedy/score-2');
    /* utm сам по себе тоже редиректится на чистый URL: иначе одна страница остаётся
       доступной по десятку адресов с разными хвостами. */
    expect(genreRedirectTarget('/genre/comedy', q('utm_source=telegram'))).toBe('/genre/comedy');
  });

  it('чистый URL и URL нового формата не редиректятся (нет цепочек)', () => {
    expect(genreRedirectTarget('/genre/comedy', q(''))).toBeNull();
    expect(genreRedirectTarget('/genre/comedy', new URLSearchParams())).toBeNull();
    expect(genreRedirectTarget('/genre/comedy', {})).toBeNull();
    expect(genreRedirectTarget('/genre/comedy/pop-2', q('sort=new'))).toBeNull();
    expect(genreRedirectTarget('/genre/comedy/score-3', q(''))).toBeNull();
  });

  it('не-жанровые и несуществующие пути не трогает', () => {
    expect(genreRedirectTarget('/genres', q('sort=score'))).toBeNull();
    expect(genreRedirectTarget('/', q('sort=score'))).toBeNull();
    expect(genreRedirectTarget('/genre/unknown-genre', q('sort=score'))).toBeNull();
    expect(genreRedirectTarget('/catalog', q('sort=score&page=2'))).toBeNull();
  });

  it('редирект всегда один хоп: цель — канонический URL без query', () => {
    const target = genreRedirectTarget('/genre/comedy', q('sort=score&page=1'));
    expect(target).toBe('/genre/comedy/score-1');
    const base = genreRedirectTarget('/genre/comedy', q('sort=score&page=1&x=1'));
    expect(base).toBe('/genre/comedy/score-1');
    // цель больше не содержит параметров, значит второй редирект невозможен
    expect(target).not.toContain('?');
    expect(genreRedirectTarget(target!, q(''))).toBeNull();
  });
});

describe('соответствие старых и новых URL обратно совместимо', () => {
  it('genreHref и parseGenreSegment — взаимно обратные', () => {
    for (const sort of ['pop', 'score', 'new', 'az'] as const) {
      for (const page of [1, 2, 5, 58]) {
        const href = genreHref('comedy', sort, page);
        const segment = href.split('/').pop();
        const parsed = parseGenreSegment(segment === 'comedy' ? undefined : segment);
        expect(parsed).toEqual({ sort, page });
      }
    }
  });

  it('redirect → href дают один и тот же канонический URL', () => {
    expect(genreRedirectTarget('/genre/comedy', q('sort=new&page=4'))).toBe(genreHref('comedy', 'new', 4));
    expect(genreRedirectTarget('/genre/comedy', q('page=1'))).toBe(genreHref('comedy', 'pop', 1));
    expect(genreRedirectTarget('/genre/comedy', q('sort=az'))).toBe(genreHref('comedy', 'az', 1));
  });
});
