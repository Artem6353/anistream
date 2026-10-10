import { describe, expect, it } from 'vitest';
import { providerResponseCacheControl } from '../lib/providers/response-cache';

describe('provider response cache control', () => {
  it('does not cache a result that performed live provider queries', () => {
    expect(providerResponseCacheControl({
      fromCache: false,
      providerChecks: { cvh: 100_000 },
    }, 0)).toBe('no-store');
  });

  it('uses the regular one-hour edge TTL if no provider retry is pending', () => {
    expect(providerResponseCacheControl({
      fromCache: true,
      providerChecks: {},
    }, 0)).toBe('public, s-maxage=3600');
  });

  it('expires at the earliest scheduled provider retry', () => {
    expect(providerResponseCacheControl({
      fromCache: true,
      providerChecks: { cvh: 75_000, aniboom: 300_000 },
    }, 0)).toBe('public, s-maxage=75');
  });

  it('does not cache when the retry time has already passed', () => {
    expect(providerResponseCacheControl({
      fromCache: true,
      providerChecks: { cvh: 900 },
    }, 1_000)).toBe('no-store');
  });
});
