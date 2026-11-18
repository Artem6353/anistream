import { describe, expect, it } from 'vitest';
import type { EpisodeSource } from '@/lib/providers/types';
import { nextPlayableSource } from '@/lib/player-source-fallback';

const source = (id: string, flags: Partial<EpisodeSource> = {}): EpisodeSource => ({
  id,
  label: id,
  providerId: id.split(':')[0],
  providerName: id.split(':')[0],
  kind: 'embed',
  embedUrl: `https://example.test/${id}`,
  translationId: id,
  voice: 'voice',
  ...flags,
});

describe('automatic player source fallback', () => {
  it('prefers an exact provider URL over guessed and synthesized sources', () => {
    const guessed = source('cvh:guess', { guessed: true });
    const exact = source('kodik:exact');
    const synthesized = source('cvh:synth', { synthesized: true });
    expect(nextPlayableSource([guessed, synthesized, exact], 'kodik:failed', new Set()))
      .toBe(guessed === exact ? guessed : exact);
  });

  it('does not retry sources that already failed in the current episode', () => {
    const first = source('kodik:first');
    const second = source('cvh:second');
    const third = source('aniboom:third');
    expect(nextPlayableSource([first, second, third], first.id, new Set([second.id])))
      .toBe(third);
  });

  it('uses the demo source only after all provider sources are exhausted', () => {
    const demo = source('demo:fallback');
    const failedProvider = source('kodik:failed');
    expect(nextPlayableSource([demo, failedProvider], failedProvider.id, new Set()))
      .toBe(demo);
  });

  it('returns null when no alternative remains', () => {
    const only = source('kodik:only');
    expect(nextPlayableSource([only], only.id, new Set())).toBeNull();
  });
});
