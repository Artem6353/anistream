import { describe, expect, it } from 'vitest';
import { availabilityCacheControl } from '../lib/availability-cache';

describe('availability API cache policy', () => {
  it('caches only responses backed by a successful Supabase availability query', () => {
    expect(availabilityCacheControl(true)).toBe('public, s-maxage=600, stale-while-revalidate=60');
    expect(availabilityCacheControl(false)).toBe('private, no-store, max-age=0');
  });
});
