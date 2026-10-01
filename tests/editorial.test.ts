import { describe, expect, it } from 'vitest';
import { titleEditorial, seasonEditorial, seasonItems, seasonCombos, parseSeasonSlug, seasonSlug, scorePercentile } from '@/lib/editorial';
import { getTitle } from '@/lib/catalog';

/**
 * Редполитика (SEO-9): генераторы редакционных текстов должны быть
 * детерминированными, без «NaN/undefined/[object Object]» в выводе и без
 * выдуманных фактов (только данные каталога).
 */

const GARBAGE = /NaN|undefined|\[object Object\]/;

describe('titleEditorial', () => {
  for (const slug of ['sousou-no-frieren', 'one-piece', 'kagurabachi']) {
    it(`${slug}: связный текст без мусора`, () => {
      const t = getTitle(slug)!;
      const ed = titleEditorial(t);
      expect(ed.paragraphs.length).toBeGreaterThanOrEqual(2);
      for (const p of ed.paragraphs) {
        expect(p).not.toMatch(GARBAGE);
        expect(p.length).toBeGreaterThan(30);
      }
      // детерминированность
      expect(titleEditorial(t).paragraphs).toEqual(ed.paragraphs);
    });
  }

  it('percentile монотонен и в границах', () => {
    const a = scorePercentile(5);
    const b = scorePercentile(8);
    const c = scorePercentile(9.5);
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(100);
  });
});

describe('season-хабы', () => {
  it('slug round-trip', () => {
    expect(parseSeasonSlug(seasonSlug('spring', 2026))).toEqual({ season: 'spring', year: 2026 });
    expect(parseSeasonSlug('trash-123')).toBeNull();
    expect(parseSeasonSlug('vesna-26')).toBeNull();
  });

  it('combos: нет пустых, сортировка по убыванию года', () => {
    const combos = seasonCombos();
    expect(combos.length).toBeGreaterThan(10);
    expect(combos.every((c) => c.count >= 1)).toBe(true);
    for (let i = 1; i < combos.length; i++) expect(combos[i - 1].year).toBeGreaterThanOrEqual(combos[i].year);
  });

  it('seasonEditorial: цифры сходятся с данными, текст без мусора', () => {
    const combo = seasonCombos().find((c) => c.count >= 5)!;
    const items = seasonItems(combo.season, combo.year);
    const ed = seasonEditorial(combo.season, combo.year, items);
    expect(ed.paragraphs.join(' ')).not.toMatch(GARBAGE);
    expect(ed.paragraphs[0]).toContain(String(items.length));
    expect(ed.metaTitle).toContain(String(items.length));
    expect(ed.metaDesc.length).toBeLessThanOrEqual(155);
  });
});
