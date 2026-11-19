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
  const current = sources.find((source) => source.id === currentId);
  return (
    real.find((source) => source.kind === 'file' && !source.guessed && !source.synthesized) ??
    (current
      ? real.find((source) => source.providerId === current.providerId && source.kind === 'embed')
      : null) ??
    real.find((source) => !source.guessed && !source.synthesized) ??
    real.find((source) => !source.guessed) ??
    real[0] ??
    candidates[0] ??
    null
  );
}


/**
 * Explicit "next voice" action: keep the current provider first and rotate
 * through its other translations before falling back to another provider.
 * Unlike playback failure recovery, the user asked for another voice, not
 * necessarily another player, so a same-provider embed beats an unrelated
 * direct HLS stream.
 */
export function nextVoiceSource(
  sources: readonly EpisodeSource[],
  currentId: string | undefined,
  failedIds: ReadonlySet<string>,
): EpisodeSource | null {
  const current = sources.find((source) => source.id === currentId);
  if (current) {
    const sameProvider = sources.filter(
      (source) =>
        source.id !== current.id &&
        !failedIds.has(source.id) &&
        source.providerId === current.providerId &&
        !source.guessed &&
        !source.synthesized,
    );
    const sameKind = sameProvider.filter((source) => source.kind === current.kind);
    if (sameKind.length) return sameKind[0];
    if (sameProvider.length) return sameProvider[0];
  }
  return nextPlayableSource(sources, currentId, failedIds);
}
