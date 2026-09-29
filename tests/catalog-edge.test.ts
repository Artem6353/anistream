import { describe, expect, it } from 'vitest';
import { filterCatalog, loadTitles, similarTitles, getTitle } from '@/lib/catalog';

/**
 * Аудит 30.09: регрессии каталога — NaN-страница (P2-17), корректность
 * includeHidden-кэша (P2-15), similarTitles на живых данных (P2-16).
 */

describe('filterCatalog: sanitize страницы', () => {
  it('page=NaN больше не даёт пустую выдачу (было: slice(NaN,NaN)=[])', () => {
    const r = filterCatalog({ page: Number.NaN });
    expect(r.page).toBe(1);
    expect(r.items.length).toBeGreaterThan(0);
  });

  it('page вне диапазона клампится к последней', () => {
    const r = filterCatalog({ page: 999_999 });
    expect(r.page).toBe(r.pages);
    expect(r.items.length).toBeGreaterThan(0);
  });

  it('page < 1 клампится к 1', () => {
    expect(filterCatalog({ page: -5 }).page).toBe(1);
  });

  it('дробный page округляется, а не ломает slice', () => {
    const r = filterCatalog({ page: 2.7 });
    expect(r.page).toBe(2);
    expect(r.items.length).toBeGreaterThan(0);
  });
});

describe('loadTitles: includeHidden-кэш не смешивается (P2-15)', () => {
  it('повторный вызов с другим флагом возвращает согласованные данные', () => {
    const visible = loadTitles();
    const all = loadTitles(true);
    expect(all.length).toBeGreaterThanOrEqual(visible.length);
    // после includeHidden=true обычный вызов НЕ должен начать отдавать скрытые
    const visibleAgain = loadTitles();
    expect(visibleAgain.length).toBe(visible.length);
    expect(visibleAgain.every((t) => !(t as { hidden?: boolean }).hidden)).toBe(true);
  });
});

describe('similarTitles (P2-16)', () => {
  it('не возвращает сам тайтл и уважает текущий каталог', () => {
    const t = getTitle('sousou-no-frieren')!;
    const sim = similarTitles(t, 5);
    expect(sim.length).toBeGreaterThan(0);
    expect(sim.every((x) => x.slug !== t.slug)).toBe(true);
  });
});
