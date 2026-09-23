import { weekBounds } from './schedule-core';
export { weekBounds, groupByDay, todayIndex } from './schedule-core';
import type { ScheduleEntry } from './types';
import { TITLES } from './catalog';
import { hashStr } from './format';

const ANILIST = 'https://graphql.anilist.co';

const QUERY = `query($start:Int!,$end:Int!){
  Page(page:1,perPage:250){
    airingSchedules(airingAt_greater:$start,airingAt_lesser:$end, sort:TIME){
      airingAt episode mediaId
      media{ id title{romaji} coverImage{large} }
    }
  }
}`;



async function liveSchedule(): Promise<ScheduleEntry[]> {
  const { start, end } = weekBounds();
  const res = await fetch(ANILIST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    body: JSON.stringify({ query: QUERY, variables: { start, end } }),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`anilist ${res.status}`);
  const json = await res.json();
  const rows = json?.data?.Page?.airingSchedules ?? [];
  return rows
    .filter((r: any) => r.media)
    .map((r: any) => {
      const known = TITLES.find((t) => t.anilistId === r.media.id);
      return {
        at: r.airingAt * 1000,
        episode: r.episode,
        anilistId: r.media.id,
        slug: known?.slug,
        ru: known?.ru,
        romaji: r.media.title.romaji,
        poster: r.media.coverImage.large,
        source: 'live',
      } as ScheduleEntry;
    })
    .sort((a: ScheduleEntry, b: ScheduleEntry) => a.at - b.at);
}

/** Детерминированное демо-расписание: офлайн-фолбэк и SSR-заготовка. */
export function demoWeek(): ScheduleEntry[] {
  const { start } = weekBounds();
  const pool = [...TITLES].sort((a, b) => b.favourites - a.favourites).slice(0, 28);
  return pool
    .map((t) => {
      const h = hashStr(t.slug);
      const weekday = h % 7;
      const hour = 10 + (h >> 4) % 13;
      const minute = [0, 15, 30, 45][(h >> 8) % 4];
      const at = (start + weekday * 86400 + hour * 3600 + minute * 60) * 1000;
      return {
        at,
        episode: ((h >> 6) % 12) + 1,
        anilistId: t.anilistId,
        slug: t.slug,
        ru: t.ru,
        romaji: t.romaji,
        poster: t.poster,
        source: 'demo',
      } as ScheduleEntry;
    })
    .sort((a, b) => a.at - b.at);
}

let cache: { at: number; entries: ScheduleEntry[] } | null = null;

export async function getWeekSchedule(): Promise<{ entries: ScheduleEntry[]; live: boolean }> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return { entries: cache.entries, live: cache.entries[0]?.source === 'live' };
  try {
    const entries = await liveSchedule();
    if (entries.length) {
      cache = { at: Date.now(), entries };
      return { entries, live: true };
    }
    throw new Error('empty');
  } catch {
    const entries = demoWeek();
    cache = { at: Date.now(), entries };
    return { entries, live: false };
  }
}


