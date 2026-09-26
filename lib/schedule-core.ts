import type { ScheduleEntry } from './types';

/* Аудит блок 2: вся датировка расписания — МСК (Europe/Moscow, UTC+3, без DST).
   Раньше «сегодня» считалось по локальному getDay(): сервер Vercel (UTC) и клиент
   могли расходиться на сутки в ночные часы. Теперь SSR и клиент считают из одного
   МСК-источника через Intl.DateTimeFormat с timeZone: 'Europe/Moscow'. */

const MSK_OFFSET_MS = 3 * 3600_000;
const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Индекс дня недели в МСК: 0=Пн … 6=Вс. */
export function mskDayIndex(ms: number): number {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return -1; // битая дата не роняет рендер
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', weekday: 'short' }).format(d);
  return WD[wd] ?? 0;
}

export function todayIndex(): number {
  return mskDayIndex(Date.now());
}

/** Границы недели (Пн 00:00 МСК … +7 суток) в unix-секундах. */
export function weekBounds(offsetWeeks = 0): { start: number; end: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const idx = mskDayIndex(now.getTime());
  const mondayUtc = Date.UTC(get('year'), get('month') - 1, get('day') - idx + offsetWeeks * 7);
  const start = Math.floor((mondayUtc - MSK_OFFSET_MS) / 1000); // 00:00 МСК = 00:00 UTC − 3 ч
  return { start, end: start + 7 * 86400 };
}

export function groupByDay(entries: ScheduleEntry[]): Map<number, ScheduleEntry[]> {
  const map = new Map<number, ScheduleEntry[]>();
  for (const e of entries) {
    const idx = mskDayIndex(e.at);
    const list = map.get(idx) ?? [];
    list.push(e);
    map.set(idx, list);
  }
  return map;
}
