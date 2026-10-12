import { describe, expect, it } from 'vitest';
import { catalogWeek, getSchedule, scheduleWindow } from '../lib/schedule';
import { groupByDay, mskDayIndex, weekBounds } from '../lib/schedule-core';

/**
 * Расписание после удаления демо-недели (аудит 2026-10, ТЗ 1.1).
 *
 * Прежние тесты проверяли demoWeek()/demoEpisodeFromHash(): фейковые серии,
 * собранные из хеша слага («One Piece серия 5»), которые на проде показывались
 * с пометкой «демо». Функции удалены — проверяем реальные источники.
 */
describe('schedule: окно и границы недели (МСК)', () => {
  it('scheduleWindow: −2 дня … +8 дней', () => {
    const now = Date.UTC(2026, 9, 12, 12, 0, 0);
    const { startMs, endMs } = scheduleWindow(now);
    expect(startMs).toBe(now - 2 * 86_400_000);
    expect(endMs).toBe(now + 8 * 86_400_000);
  });

  it('weekBounds: начало недели — понедельник 00:00 МСК, длина ровно 7 суток', () => {
    const { start, end } = weekBounds();
    expect(end - start).toBe(7 * 86_400);
    expect(mskDayIndex(start * 1000)).toBe(0); // 0 = понедельник
  });

  it('mskDayIndex не бросает на битой дате', () => {
    expect(mskDayIndex(Number.NaN)).toBe(-1);
    expect(() => mskDayIndex(0)).not.toThrow();
  });
});

describe('schedule: реальные источники вместо демо-недели', () => {
  it('catalogWeek возвращает только записи внутри окна, отсортированные по времени', () => {
    /* Апрель 2025 — в каталоге есть airing-график «Ван-Пис» за этот период. */
    const start = Date.UTC(2025, 3, 1);
    const end = Date.UTC(2025, 3, 30);
    const entries = catalogWeek(start, end);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.at).toBeGreaterThanOrEqual(start);
      expect(e.at).toBeLessThanOrEqual(end);
      expect(e.source).toBe('catalog');
      expect(Number.isFinite(e.at)).toBe(true);
      expect(e.episode).toBeGreaterThan(0);
      expect(e.slug).toBeTruthy(); // записи без slug в каталоге быть не может
    }
    const times = entries.map((e) => e.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('catalogWeek пуст для окна без эфиров — пустое состояние, а не фейк', () => {
    const entries = catalogWeek(Date.UTC(1990, 0, 1), Date.UTC(1990, 0, 8));
    expect(entries).toEqual([]);
  });

  it('getSchedule без Supabase падает в каталожный fallback и не бросает', async () => {
    const now = Date.UTC(2025, 3, 15, 12, 0, 0);
    const res = await getSchedule(now);
    expect(['db', 'catalog', 'empty']).toContain(res.source);
    expect(Array.isArray(res.entries)).toBe(true);
    if (res.entries.length) expect(res.source).not.toBe('empty');
    else expect(res.source).toBe('empty');
  });

  it('ни одна запись не помечена как демо', async () => {
    const { entries } = await getSchedule(Date.UTC(2025, 3, 15, 12, 0, 0));
    for (const e of entries) expect(e.source).not.toBe('demo');
  });

  it('groupByDay раскладывает записи по дням МСК без потерь', () => {
    const entries = catalogWeek(Date.UTC(2025, 3, 1), Date.UTC(2025, 3, 30));
    const grouped = groupByDay(entries);
    const total = [...grouped.values()].reduce((n, list) => n + list.length, 0);
    expect(total).toBe(entries.length);
  });
});
