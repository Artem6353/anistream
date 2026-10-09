import { describe, expect, it } from 'vitest';
import { isCacheEntryExpired } from '../lib/providers/cache';

describe('provider cache TTL', () => {
  it('marks entries older than their own TTL as expired', () => {
    expect(isCacheEntryExpired({ at: Date.now() - 20_000, ttlMs: 10_000 }, 60_000)).toBe(true);
  });

  it('uses the configured TTL when an entry has no override', () => {
    expect(isCacheEntryExpired({ at: Date.now() - 20_000 }, 10_000)).toBe(true);
  });

  it('keeps fresh entries', () => {
    expect(isCacheEntryExpired({ at: Date.now(), ttlMs: 60_000 }, 10_000)).toBe(false);
  });

  it('rejects invalid timestamps instead of treating them as fresh', () => {
    expect(isCacheEntryExpired({ at: Number.NaN, ttlMs: 60_000 }, 10_000)).toBe(true);
  });
});
