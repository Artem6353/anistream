import { describe, expect, it } from 'vitest';
import { demoEpisodeFromHash, demoWeek } from '../lib/schedule';
import { mskDayIndex } from '../lib/schedule-core';

describe('schedule msk regression (аудит блок 2)', () => {
  it('demoWeek: нет NaN-дат (one-piece regression), mskDayIndex не бросает', () => {
    for (const e of demoWeek()) {
      try { mskDayIndex(e.at); } catch {
        throw new Error(`bad at for ${e.slug}: ${e.at}`);
      }
    }
    expect(demoWeek().length).toBeGreaterThan(0);
  });
  it('demo episode number stays within the valid range for signed-bit boundary hashes', () => {
    const hashes = [
      0,
      1,
      0x7fffffff,
      0x80000000,
      0xffffffff,
      ...Array.from({ length: 256 }, (_, i) => Math.imul(i, 0x01010101) >>> 0),
    ];
    for (const hash of hashes) {
      const episode = demoEpisodeFromHash(hash);
      expect(Number.isInteger(episode)).toBe(true);
      expect(episode).toBeGreaterThanOrEqual(1);
      expect(episode).toBeLessThanOrEqual(12);
    }
  });

});
