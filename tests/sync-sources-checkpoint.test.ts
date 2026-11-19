import { describe, expect, it } from 'vitest';
import {
  isDoneRecently,
  markDone,
  parseDone,
  serializeDone,
} from '../scripts/lib/sync-checkpoint.mjs';

describe('sync-sources checkpoint TTL', () => {
  const now = 1_800_000_000_000;

  it('legacy array is treated as stale, so existing installs resume updates', () => {
    const done = parseDone(['1', '2']);
    expect(done.get('1')).toBe(0);
    expect(isDoneRecently(done, '1', now, 360 * 60_000)).toBe(false);
  });

  it('a title is skipped only inside the TTL window', () => {
    const done = markDone(parseDone(null), 42, now - 60 * 60_000);
    expect(isDoneRecently(done, 42, now, 6 * 60 * 60_000)).toBe(true);
    expect(isDoneRecently(done, 42, now, 30 * 60_000)).toBe(false);
  });

  it('TTL=0 rechecks every title on every run', () => {
    const done = markDone(parseDone(null), 42, now);
    expect(isDoneRecently(done, 42, now, 0)).toBe(false);
  });

  it('serializes to an object and prunes ancient entries', () => {
    const done = parseDone({ a: now, b: now - 100 * 24 * 3600_000 });
    expect(serializeDone(done, now)).toEqual({ a: now });
  });
});
