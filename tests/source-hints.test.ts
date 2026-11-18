import { describe, expect, it } from 'vitest';
import { availabilityHint } from '../lib/source-hints';

describe('episode availability hints', () => {
  it('does not label a cached direct URL as confirmed playback', () => {
    expect(availabilityHint('cache')).toEqual({
      tone: 'unverified',
      label: 'Есть точная ссылка от провайдера; воспроизведение ещё не проверено',
    });
  });

  it('keeps synthesized and guessed URLs visibly unverified', () => {
    expect(availabilityHint('synth').tone).toBe('unverified');
    expect(availabilityHint('guess').tone).toBe('unverified');
  });

  it('shows no-source state for an empty episode entry', () => {
    expect(availabilityHint(undefined).tone).toBe('none');
  });
});
