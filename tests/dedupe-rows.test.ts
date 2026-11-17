import { describe, expect, it } from 'vitest';
import { dedupeByKeys } from '../scripts/lib/dedupe-rows.mjs';

/**
 * Инцидент 2026-11-17: импорт каталога в Supabase падал с
 * `21000: ON CONFLICT DO UPDATE command cannot affect row a second time`,
 * потому что в одной пачке `title_relations` встречался одинаковый
 * (anime_id, related_id) — один и тот же тайтл с двумя типами связи.
 */
describe('dedupeByKeys', () => {
  it('убирает дубли по составному ключу, сохраняя порядок и первую строку', () => {
    const rows = [
      { anime_id: 1, related_id: 2, relation_type: 'sequel' },
      { anime_id: 1, related_id: 2, relation_type: 'side_story' },
      { anime_id: 1, related_id: 3, relation_type: 'sequel' },
    ];
    const { rows: unique, dropped } = dedupeByKeys(rows, ['anime_id', 'related_id']);
    expect(unique).toHaveLength(2);
    expect(unique[0].relation_type).toBe('sequel');
    expect(dropped).toBe(1);
  });

  it('не склеивает ключи с разделителем внутри значения', () => {
    const rows = [
      { a: 'x|y', b: 'z' },
      { a: 'x', b: 'y|z' },
    ];
    expect(dedupeByKeys(rows, ['a', 'b']).rows).toHaveLength(2);
  });

  it('null и undefined в ключе не роняют дедупликацию', () => {
    const rows = [{ a: null, b: 1 }, { a: undefined, b: 1 }, { a: null, b: 2 }];
    const { rows: unique } = dedupeByKeys(rows, ['a', 'b']);
    expect(unique).toHaveLength(2);
  });

  it('пустые входы безопасны', () => {
    expect(dedupeByKeys([], ['a'])).toEqual({ rows: [], dropped: 0 });
    expect(dedupeByKeys([{ a: 1 }], []).dropped).toBe(0);
  });
});
