/**
 * Форматирование дат для кабинета.
 *
 * Важно: один и тот же код выполняется на сервере (Node, обычно UTC) и в браузере
 * (таймзона пользователя). Если форматировать «как есть», дата у границы суток
 * превращается в другой день — и React ругается на hydration mismatch. Поэтому
 * явно фиксируем `timeZone: 'UTC'` и локаль.
 */
const DAY_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const SHORT_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** Разбирает ISO-строку/дату; мусор и пустые значения дают null. */
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** «18 ноября 2026 г.» — для шапки профиля. */
export function formatDay(value: string | number | Date | null | undefined): string | null {
  const date = toDate(value);
  return date ? DAY_FORMAT.format(date) : null;
}

/** «18 нояб.» — для компактных списков. */
export function formatShortDay(value: string | number | Date | null | undefined): string | null {
  const date = toDate(value);
  return date ? SHORT_FORMAT.format(date) : null;
}
