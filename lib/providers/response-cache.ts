import type { EpisodeSources } from './types';

/**
 * Edge-cache a cached episode only until its next negative-provider retry.
 * Otherwise Vercel's 1-hour cache would hide a source that becomes available sooner.
 */
export function providerResponseCacheControl(
  sources: Pick<EpisodeSources, 'fromCache' | 'providerChecks'>,
  now = Date.now(),
): string {
  if (!sources.fromCache) return 'no-store';

  const pendingChecks = Object.values(sources.providerChecks ?? {})
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now);

  if (!pendingChecks.length) return 'public, s-maxage=3600';

  const nextCheckInSeconds = Math.floor((Math.min(...pendingChecks) - now) / 1000);
  if (nextCheckInSeconds <= 0) return 'no-store';
  return `public, s-maxage=${Math.min(3600, Math.max(1, nextCheckInSeconds))}`;
}
