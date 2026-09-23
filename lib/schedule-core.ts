import type { ScheduleEntry } from './types';

export function weekBounds(offsetWeeks = 0): { start: number; end: number } {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + offsetWeeks * 7, 0, 0, 0);
  return { start: Math.floor(monday.getTime() / 1000), end: Math.floor(monday.getTime() / 1000) + 7 * 86400 };
}

export function groupByDay(entries: ScheduleEntry[]): Map<number, ScheduleEntry[]> {
  const map = new Map<number, ScheduleEntry[]>();
  for (const e of entries) {
    const idx = (new Date(e.at).getDay() + 6) % 7;
    const list = map.get(idx) ?? [];
    list.push(e);
    map.set(idx, list);
  }
  return map;
}

export function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}
