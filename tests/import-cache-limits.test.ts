import { describe, expect, it } from 'vitest';
import { selectEpisodeNumbers } from '../scripts/lib/import-cache-limits.mjs';

describe('provider-cache import episode limit', () => {
  it('keeps the newest episodes under a positive limit', () => {
    expect(selectEpisodeNumbers([1, 2, 3, 4], 2)).toEqual([4, 3]);
  });

  it('treats zero as unlimited instead of importing zero episodes', () => {
    expect(selectEpisodeNumbers([1, 2, 3], 0)).toEqual([3, 2, 1]);
  });

  it('treats invalid limits as unlimited only after caller normalization', () => {
    expect(selectEpisodeNumbers([1, 2], Number.NaN)).toEqual([2, 1]);
  });
});
