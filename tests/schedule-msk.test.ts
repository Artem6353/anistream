import { describe, expect, it } from 'vitest';
import { demoWeek } from '../lib/schedule';
import { mskDayIndex } from '../lib/schedule-core';

describe('schedule msk regression (аудит блок 2)', () => {
  it('demoWeek: нет NaN-дат (one-piece regression), mskDayIndex не бросает', () => {
    for (const e of demoWeek()) {
      try { mskDayIndex(e.at); } catch (err) {
        throw new Error(`bad at for ${e.slug}: ${e.at}`);
      }
    }
    expect(demoWeek().length).toBeGreaterThan(0);
  });
});
