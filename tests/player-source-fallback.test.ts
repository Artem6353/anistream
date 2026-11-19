import { describe, expect, it } from 'vitest';
import type { EpisodeSource } from '@/lib/providers/types';
import { nextPlayableSource, nextVoiceSource } from '@/lib/player-source-fallback';

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
      .toBe(exact);
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

it('uses the same provider iframe as fallback after its direct stream fails', () => {
  const direct = source('cvh:direct', { kind: 'file', files: [{ quality: 'auto', url: 'https://example.test/master.m3u8', type: 'hls' }] });
  const kodik = source('kodik:other');
  const iframe = source('cvh:iframe');
  expect(nextPlayableSource([direct, kodik, iframe], direct.id, new Set([direct.id])))
    .toBe(iframe);
});

it('prefers another native file source before switching to an iframe', () => {
  const current = source('cvh:current', { kind: 'file', files: [{ quality: 'auto', url: 'https://example.test/current.m3u8', type: 'hls' }] });
  const embed = source('cvh:embed');
  const alternateFile = source('aniboom:direct', { kind: 'file', files: [{ quality: '720', url: 'https://example.test/720.mp4', type: 'mp4' }] });
  expect(nextPlayableSource([current, embed, alternateFile], current.id, new Set([current.id])))
    .toBe(alternateFile);
});

describe('explicit next-voice action', () => {
  it('keeps the current provider and rotates to another voice before switching players', () => {
    const kodikA = source('kodik:a');
    const kodikB = source('kodik:b');
    const cvhDirect = source('cvh:direct', { kind: 'file', files: [{ quality: 'auto', url: 'https://example.test/a.m3u8', type: 'hls' }] });
    expect(nextVoiceSource([kodikA, kodikB, cvhDirect], kodikA.id, new Set())).toBe(kodikB);
  });

  it('falls back to another provider when the current one has a single voice', () => {
    const kodik = source('kodik:only');
    const cvh = source('cvh:other');
    expect(nextVoiceSource([kodik, cvh], kodik.id, new Set())).toBe(cvh);
  });

  it('does not return a failed voice twice', () => {
    const a = source('kodik:a');
    const b = source('kodik:b');
    const c = source('kodik:c');
    expect(nextVoiceSource([a, b, c], a.id, new Set([b.id]))).toBe(c);
  });
});
