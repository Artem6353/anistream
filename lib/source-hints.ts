/**
 * Индикатор доступности серии (аудит 2026-10, ТЗ 1.6.4).
 *
 * Раньше зелёная точка объединяла «источник в кэше» и «URL синтезирован по шаблону»,
 * а `guess` (подбор пулом озвучек без единой проверки) показывался как «Источник
 * подобран». На проде из-за этого у «Ван-Пис» все 24 «серии» светились доступными,
 * хотя ни один URL не был получен от провайдера.
 *
 * Правило теперь: ok = только реально полученный от провайдера источник.
 */
export type SourceKind = 'cache' | 'synth' | 'guess' | 'demo';

export interface AvailabilityHint {
  /** CSS-модификатор точки/индикатора. */
  tone: 'ok' | 'unverified' | 'none';
  /** Текст подсказки для title/aria. */
  label: string;
}

export function availabilityHint(kind: string | undefined): AvailabilityHint {
  switch (kind) {
    case 'cache':
      return { tone: 'ok', label: 'Доступно: источник получен от провайдера' };
    case 'synth':
      return { tone: 'unverified', label: 'Ссылка собрана по шаблону и не проверена' };
    case 'guess':
      return { tone: 'unverified', label: 'Источник подбирается автоматически и не проверен' };
    default:
      return { tone: 'none', label: 'Нет источников' };
  }
}

/** Подпись для списка озвучек, когда источников нет вовсе (ТЗ 1.6.2). */
export const NO_SOURCES_LABEL = 'Источников пока нет';
