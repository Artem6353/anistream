import type { EpisodeSource } from '@/lib/providers/types';

/**
 * Pick the next source after a native video/HLS playback failure.
 * Confirmed provider URLs are tried before guessed or synthesized templates;
 * demo is a last resort and failed IDs are never retried in the same episode.
 */
export function nextPlayableSource(
  sources: readonly EpisodeSource[],
  currentId: string | undefined,
  failedIds: ReadonlySet<string>,
): EpisodeSource | null {
  const candidates = sources.filter(
    (source) => source.id !== currentId && !failedIds.has(source.id),
  );
  const real = candidates.filter((source) => source.providerId !== 'demo');
  return (
    real.find((source) => !source.guessed && !source.synthesized) ??
    real.find((source) => !source.guessed) ??
    real[0] ??
    candidates[0] ??
    null
  );
}
