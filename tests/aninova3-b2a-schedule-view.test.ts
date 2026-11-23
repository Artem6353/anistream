import { describe, expect, it } from 'vitest';
import {
  AIRING_NOW_WINDOW_MS,
  AIRING_STATE_LABELS,
  DAY_FULL,
  DAY_SHORT,
  airingState,
  dayCounts,
  entriesForDay,
  mskDateLabel,
  mskTimeLabel,
  parseScheduleDay,
  weekDayDates,
} from '@/lib/aninova3/schedule-view';
import { isA3NavActive, A3_NAV, A3_ROOT } from '@/lib/aninova3/nav';
import type { ScheduleEntry } from '@/lib/types';

/* B2-A: подписи расписания и общая навигация. Логика дат остаётся в
   lib/schedule-core, здесь проверяется только слой представления. */

const entry = (at: number, episode = 1, slug = 'demo'): ScheduleEntry => ({
  at,
  episode,
  anilistId: 1,
  slug,
  ru: `Тайтл ${slug}`,
  romaji: 'Demo',
  poster: '',
  source: 'catalog',
});

/* Фиксированные моменты: пн 2026-11-02 00:00 МСК = 2026-11-01T21:00Z. */
const MONDAY_MSK = Date.UTC(2026, 10, 1, 21, 0);
const DAY = 86_400_000;

describe('B2-A: время и даты расписания (МСК)', () => {
  it('время эфира печатается по Москве, а не по UTC', () => {
    /* 18:30 UTC = 21:30 МСК (UTC+3, без перехода на летнее). */
    expect(mskTimeLabel(Date.UTC(2026, 10, 3, 18, 30))).toBe('21:30');
    /* Полночь МСК — это 21:00 предыдущих суток по UTC. */
    expect(mskTimeLabel(MONDAY_MSK)).toBe('00:00');
  });

  it('битая дата не роняет подпись', () => {
    expect(mskTimeLabel(Number.NaN)).toBe('--:--');
    expect(mskDateLabel(Number.NaN)).toBe('');
  });

  it('дата дня печатается по-русски без точки месяца', () => {
    const label = mskDateLabel(MONDAY_MSK + 2 * DAY);
    expect(label).toContain('4');
    expect(label).toContain('ноя');
    expect(label).not.toContain('.');
  });

  it('дни недели начинаются с понедельника', () => {
    expect(DAY_SHORT).toHaveLength(7);
    expect(DAY_SHORT[0]).toBe('Пн');
    expect(DAY_FULL[6]).toBe('Воскресенье');
  });

  it('даты недели идут подряд от понедельника', () => {
    const dates = weekDayDates(Math.floor(MONDAY_MSK / 1000));
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe(MONDAY_MSK);
    expect(dates[6] - dates[0]).toBe(6 * DAY);
  });
});

describe('B2-A: выбор дня и группировка', () => {
  it('?day= принимает 0…6', () => {
    expect(parseScheduleDay('0')).toBe(0);
    expect(parseScheduleDay('6')).toBe(6);
    expect(parseScheduleDay(['3'])).toBe(3);
  });

  it('мусор в ?day= показывает текущий день, а не пустую страницу', () => {
    expect(parseScheduleDay(undefined, 4)).toBe(4);
    expect(parseScheduleDay('', 4)).toBe(4);
    expect(parseScheduleDay('7', 4)).toBe(4);
    expect(parseScheduleDay('-1', 4)).toBe(4);
    expect(parseScheduleDay('завтра', 4)).toBe(4);
  });

  it('эфиры дня фильтруются по МСК и сортируются по времени', () => {
    const entries = [
      entry(MONDAY_MSK + 2 * DAY + 5 * 3600_000, 3, 'c'),
      entry(MONDAY_MSK + 2 * DAY, 1, 'a'),
      entry(MONDAY_MSK + 3 * DAY, 9, 'd'),
    ];
    const wednesday = entriesForDay(entries, 2);
    expect(wednesday.map((e) => e.slug)).toEqual(['a', 'c']);
    expect(entriesForDay(entries, 6)).toEqual([]);
  });

  it('счётчики дней совпадают с числом эфиров', () => {
    const entries = [entry(MONDAY_MSK, 1), entry(MONDAY_MSK + 3600_000, 2), entry(MONDAY_MSK + 6 * DAY, 3)];
    const counts = dayCounts(entries);
    expect(counts).toHaveLength(7);
    expect(counts[0]).toBe(2);
    expect(counts[6]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(entries.length);
  });
});

describe('B2-A: состояние показа', () => {
  const now = MONDAY_MSK + 12 * 3600_000;

  it('прошедший, текущий и будущий показ различаются', () => {
    expect(airingState(now - 3 * 3600_000, now)).toBe('past');
    expect(airingState(now, now)).toBe('now');
    expect(airingState(now + 3 * 3600_000, now)).toBe('future');
  });

  it('окно «сейчас» симметрично и не бесконечно', () => {
    expect(airingState(now - AIRING_NOW_WINDOW_MS, now)).toBe('now');
    expect(airingState(now + AIRING_NOW_WINDOW_MS, now)).toBe('now');
    expect(airingState(now - AIRING_NOW_WINDOW_MS - 1, now)).toBe('past');
    expect(airingState(now + AIRING_NOW_WINDOW_MS + 1, now)).toBe('future');
  });

  it('статус не передаётся только цветом: у каждого состояния есть подпись', () => {
    expect(AIRING_STATE_LABELS.past).toMatch(/[а-яё]/i);
    expect(AIRING_STATE_LABELS.now).toMatch(/[а-яё]/i);
    expect(AIRING_STATE_LABELS.future).toMatch(/[а-яё]/i);
  });
});

describe('B2-A: навигация разделов', () => {
  const byLabel = (label: string) => {
    const item = A3_NAV.find((i) => i.label === label);
    if (!item) throw new Error(`раздел «${label}» отсутствует`);
    return item;
  };

  it('в шапке пять разделов, включая расписание', () => {
    expect(A3_NAV).toHaveLength(5);
    expect(A3_NAV.map((i) => i.label)).toEqual(['Главная', 'Каталог', 'Расписание', 'Comics', 'Профиль']);
    expect(new Set(A3_NAV.map((i) => i.href)).size).toBe(A3_NAV.length);
  });

  it('главная активна только на себе', () => {
    const home = byLabel('Главная');
    expect(isA3NavActive(A3_ROOT, home)).toBe(true);
    expect(isA3NavActive(`${A3_ROOT}/catalog`, home)).toBe(false);
  });

  it('страница произведения подсвечивает каталог', () => {
    const catalog = byLabel('Каталог');
    expect(isA3NavActive(`${A3_ROOT}/catalog`, catalog)).toBe(true);
    expect(isA3NavActive(`${A3_ROOT}/catalog?sort=new`, catalog)).toBe(true);
    expect(isA3NavActive(`${A3_ROOT}/anime/naruto`, catalog)).toBe(true);
    expect(isA3NavActive(`${A3_ROOT}/comics`, catalog)).toBe(false);
  });

  it('расписание и комиксы не пересекаются по префиксу', () => {
    const schedule = byLabel('Расписание');
    const comics = byLabel('Comics');
    expect(isA3NavActive(`${A3_ROOT}/schedule`, schedule)).toBe(true);
    expect(isA3NavActive(`${A3_ROOT}/schedule?day=3`, schedule)).toBe(true);
    expect(isA3NavActive(`${A3_ROOT}/comics`, schedule)).toBe(false);
    expect(isA3NavActive(`${A3_ROOT}/comics/one-piece`, comics)).toBe(true);
    expect(isA3NavActive(`${A3_ROOT}/catalog`, comics)).toBe(false);
  });

  it('пустой путь ничего не подсвечивает', () => {
    expect(isA3NavActive('', byLabel('Каталог'))).toBe(false);
  });
});
