import type { ScheduleEntry } from '@/lib/types';
import { mskDayIndex } from '@/lib/schedule-core';

/**
 * B2-A: представление расписания для preview.
 *
 * Бизнес-логика расписания не менялась — даты, окно −2…+8 дней и группировка по
 * МСК остаются в `lib/schedule.ts`. Здесь только то, что нужно интерфейсу: подписи
 * дней, время эфира, состояние показа и разбор `?day=` из адреса. Всё считается
 * на сервере из одного МСК-источника, поэтому SSR и любой клиент совпадают.
 */

export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
export const DAY_FULL = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
] as const;

const MSK = 'Europe/Moscow';

/** Время эфира МСК: «18:30». Битое значение не роняет рендер. */
export function mskTimeLabel(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

/** Дата дня МСК: «3 ноя». Нужна в переключателе дней. */
export function mskDateLabel(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: 'numeric', month: 'short' })
    .format(new Date(ms))
    .replace('.', '');
}

/** Индекс дня недели (0=Пн…6=Вс) по МСК. Общая функция с бизнес-логикой расписания. */
export function scheduleDayIndex(ms: number): number {
  return mskDayIndex(ms);
}

/** Сегодняшний день недели по МСК. */
export function currentDayIndex(now = Date.now()): number {
  return mskDayIndex(now);
}

/**
 * `?day=` из адреса. Мусор и выход за диапазон не ломают страницу: показываем
 * текущий день, а не пустой экран.
 */
export function parseScheduleDay(raw: string | string[] | undefined, today = currentDayIndex()): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt((value ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 6) return today;
  return n;
}

/** Эфиры выбранного дня в порядке времени. */
export function entriesForDay(entries: ScheduleEntry[], day: number): ScheduleEntry[] {
  return entries
    .filter((e) => Number.isFinite(e.at) && mskDayIndex(e.at) === day)
    .sort((a, b) => a.at - b.at);
}

/** Сколько эфиров в каждом дне недели — для подписей в переключателе. */
export function dayCounts(entries: ScheduleEntry[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const e of entries) {
    if (!Number.isFinite(e.at)) continue;
    const idx = mskDayIndex(e.at);
    if (idx >= 0) counts[idx] += 1;
  }
  return counts;
}

export type AiringState = 'past' | 'now' | 'future';

/** Окно «сейчас в эфире»: ±90 минут вокруг времени показа. */
export const AIRING_NOW_WINDOW_MS = 90 * 60_000;

/**
 * Прошёл ли показ. Это подпись, а не фильтр: прошедшие серии остаются в сетке,
 * иначе расписание «теряло» бы уже вышедшие серии текущего дня.
 */
export function airingState(ms: number, now = Date.now()): AiringState {
  if (!Number.isFinite(ms)) return 'future';
  if (Math.abs(ms - now) <= AIRING_NOW_WINDOW_MS) return 'now';
  return ms < now ? 'past' : 'future';
}

export const AIRING_STATE_LABELS: Record<AiringState, string> = {
  past: 'вышла',
  now: 'сейчас',
  future: 'ожидается',
};

/** Даты дней недели по её началу (unix-секунды понедельника МСК). */
export function weekDayDates(weekStartSec: number): number[] {
  const base = weekStartSec * 1000;
  return Array.from({ length: 7 }, (_, i) => base + i * 86_400_000);
}
