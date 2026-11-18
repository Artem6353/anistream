import { describe, expect, it } from 'vitest';
import { formatDay, formatShortDay } from '../lib/profile/format';

/**
 * Даты в кабинете рендерятся и на сервере (UTC), и в браузере (таймзона юзера).
 * Если формат зависит от локали машины, React ругается на hydration mismatch —
 * поэтому поведение зафиксировано тестом.
 */
describe('formatDay', () => {
  it('форматирует по-русски в UTC, независимо от таймзоны процесса', () => {
    // 23:30 UTC — в Москве это уже следующий день, но дата не должна «прыгать».
    expect(formatDay('2026-11-18T23:30:00.000Z')).toBe('18 ноября 2026 г.');
    expect(formatDay('2026-01-01T00:00:00.000Z')).toContain('2026');
    expect(formatDay('2026-01-01T00:00:00.000Z')).toContain('января');
  });

  it('пустые и битые значения дают null', () => {
    expect(formatDay(null)).toBeNull();
    expect(formatDay(undefined)).toBeNull();
    expect(formatDay('')).toBeNull();
    expect(formatDay('не дата')).toBeNull();
  });

  it('принимает Date и число', () => {
    expect(formatDay(new Date('2026-03-05T10:00:00.000Z'))).toContain('марта');
    expect(formatDay(Date.UTC(2026, 2, 5, 10))).toContain('марта');
  });
});

describe('formatShortDay', () => {
  it('короткий формат для списков', () => {
    expect(formatShortDay('2026-11-18T12:00:00.000Z')).toBe('18 нояб.');
    expect(formatShortDay('')).toBeNull();
  });
});
