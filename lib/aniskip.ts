import type { SkipWindow } from './providers/types';

/**
 * AniSkip (api.aniskip.com) — фолбэк таймингов OP/ED по MAL-id,
 * когда провайдер не отдаёт skipButtons. Управляется ANISKIP_ENABLED.
 */

export async function aniskipSkipTimes(malId: number, episode: number): Promise<SkipWindow | undefined> {
  try {
    const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types=op&types=ed&episodeLength=0`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AniNova/2.0 (educational catalog)' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      results?: { interval: { startTime: number; endTime: number }; skipType: string }[];
    };
    const win: SkipWindow = {};
    for (const r of json.results ?? []) {
      if (r.skipType === 'op') win.intro = [Math.floor(r.interval.startTime), Math.floor(r.interval.endTime)];
      if (r.skipType === 'ed') win.outro = [Math.floor(r.interval.startTime), Math.floor(r.interval.endTime)];
    }
    return win.intro || win.outro ? win : undefined;
  } catch {
    return undefined;
  }
}
