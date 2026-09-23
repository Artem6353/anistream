import { describe, expect, it } from 'vitest';
import { rewriteCvh, rewriteAniboom } from '@/lib/providers/synthesize';
import { plural, formatTime } from '@/lib/format';
import { watchOrder } from '@/lib/franchise';
import { getTitle, filterCatalog, searchTitles } from '@/lib/catalog';
import { verifyCaptcha, makeCaptcha } from '@/lib/social-server';

describe('synthesize: episode-rewrite', () => {
  it('cvh path-form меняет номер серии', () => {
    expect(rewriteCvh('https://animego.me/cdn-iframe/52991/Dream Cast/1/3', 7)).toBe('https://animego.me/cdn-iframe/52991/Dream%20Cast/1/7');
  });
  it('cvh dubbing-form меняет последний сегмент', () => {
    expect(rewriteCvh('https://animego.me/cdn-iframe/30276/1/1?dubbing=AniDUB', 12)).toContain('/12?dubbing=AniDUB');
  });
  it('aniboom меняет query episode', () => {
    expect(rewriteAniboom('https://aniboom.one/embed/abc?episode=1&x=2', 5)).toContain('episode=5');
  });
  it('не-cdn ссылки не трогаются', () => {
    expect(rewriteCvh('https://example.com/video/1', 2)).toBeNull();
  });
});

describe('format', () => {
  it('plural ru', () => {
    expect(plural(1, ['серия', 'серии', 'серий'])).toBe('серия');
    expect(plural(3, ['серия', 'серии', 'серий'])).toBe('серии');
    expect(plural(11, ['серия', 'серии', 'серий'])).toBe('серий');
  });
  it('formatTime', () => {
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(65)).toBe('1:05');
  });
});

describe('franchise watchOrder', () => {
  it('строит хронологию и включает текущий тайтл', () => {
    const t = getTitle('sousou-no-frieren')!;
    const byId = new Map([t].map((x) => [x.anilistId, x]));
    const order = watchOrder(t, byId);
    expect(order.some((x) => x.anilistId === t.anilistId)).toBe(true);
  });
});

describe('catalog', () => {
  it('filter по жанру сужает выборку', () => {
    const all = filterCatalog({});
    const action = filterCatalog({ genres: ['action'] });
    expect(action.total).toBeLessThan(all.total);
    expect(action.items.every((t) => t.genres.includes('action'))).toBe(true);
  });
  it('search находит по RU-слову', () => {
    expect(searchTitles('фрирен').length).toBeGreaterThan(0);
  });
});

describe('captcha', () => {
  it('верный ответ проходит', () => {
    const c = makeCaptcha();
    expect(verifyCaptcha(c.token, c.answer)).toBe(true);
  });
  it('неверный ответ отклоняется', () => {
    const c = makeCaptcha();
    expect(verifyCaptcha(c.token, c.answer + 1)).toBe(false);
  });
});
