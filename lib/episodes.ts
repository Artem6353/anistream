import type { CardTitle, Title } from './types';
import { plural } from './format';

/**
 * Единое правило подсчёта серий (аудит 2026-10, ТЗ 1.2).
 *
 * Историческая проблема: импортер подставлял заглушку вместо неизвестного числа
 * (`m.episodes || (MOVIE ? 1 : RELEASING ? 24 : 12)` в scripts/expand-catalog.mjs),
 * поэтому в каталоге не было ни одного `episodes = null`, а у «Ван-Пис» стояло 24
 * при 1100+ вышедших сериях. Заглушка ломала список серий, валидацию
 * `/anime/[slug]/[episode]` (серия 25 → 404) и JSON-LD `numberOfEpisodes`.
 *
 * Правила:
 *  - фильм без графика выхода → 1;
 *  - FINISHED → `episodes` из источника, при заглушке/пропуске — максимум известных номеров;
 *  - RELEASING → вышло = max(airing.ep, epdates); итог неизвестен, если источник его не отдал;
 *  - NOT_YET_RELEASED → число не показываем, пока источник его не подтвердил.
 */

/** Заглушки импортера: 24 для онгоингов, 12 для остальных ТВ-тайтлов. */
const IMPORT_STUBS = new Set([12, 24]);

/** Максимальный известный номер серии из airing-графика и точных дат. */
export function maxKnownEpisode(t: Pick<Title, 'airing' | 'epdates'>): number {
  let max = 0;
  for (const a of t.airing ?? []) if (a.ep > max) max = a.ep;
  const ed = t.epdates;
  if (ed) {
    for (const key of Object.keys(ed)) {
      const n = Number(key);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

export interface EpisodeInfo {
  /** Сколько серий реально вышло/доступно. null — число неизвестно. */
  released: number | null;
  /** Итоговое число серий, если источник его подтвердил. null — ещё не объявлено. */
  total: number | null;
  /** Итог неизвестен, но серии выходят → в UI показываем «1134+». */
  totalUnknown: boolean;
  /** Одна серия (фильм/спец): списки и кнопки серий не нужны. */
  isSingle: boolean;
}

const info = (released: number | null, total: number | null, totalUnknown: boolean): EpisodeInfo => ({
  released,
  total,
  totalUnknown,
  isSingle: released === 1,
});

/** Число серий по единому правилу. Единственная точка правды для UI и валидации. */
export function episodeInfo(t: Title): EpisodeInfo {
  const aired = maxKnownEpisode(t);
  const stated = Number.isFinite(t.episodes as number) && t.episodes !== null ? Number(t.episodes) : null;
  // Заглушку импортера за реальное число не считаем.
  const stub = stated !== null && IMPORT_STUBS.has(stated);
  const statedUsable = stated !== null && stated > 0 && !(stub && aired > stated);

  if (t.status === 'upcoming') {
    // Анонс: заглушка без подтверждений → числа нет вовсе (раньше «12 серий» из воздуха).
    const total = statedUsable && !(stub && !aired) ? stated : null;
    return info(total, total, false);
  }

  if (t.type === 'movie' && !aired) return info(1, 1, false);

  if (t.status === 'ongoing') {
    // Онгоинг: «вышло» — это график эфира. `episodes` у онгоинга означает ИТОГ,
    // поэтому max(aired, stated) рисовал бы несуществующие серии (у «Ван-Пис»
    // заглушка 24 при aired 1134, а при announced=25/airing=12 — наоборот).
    const released = aired > 0 ? aired : statedUsable ? (stated as number) : null;
    // Итог известен, только если он не заглушка и строго больше уже вышедшего.
    const total = statedUsable && (stated as number) > aired ? stated : null;
    return info(released, total, released !== null && total === null);
  }

  const total = statedUsable ? (stated as number) : aired || null;
  return info(total !== null ? Math.max(aired, total) : null, total, false);
}

/** Сколько серий показывать в списке/кнопках/валидации. null → список не строим. */
export function episodeCount(t: Title): number | null {
  return episodeInfo(t).released;
}

/** Компактная замена разрозненным `episodes > 1`: «это не фильм/спец из одной серии». */
export function isMultiEpisode(t: Title): boolean {
  const n = episodeCount(t);
  return n !== null && n > 1;
}

/** «1134+ серий» для онгоинга без объявленного итога, иначе «24 серии».
    С «+» число открытое, поэтому склонение всегда родительное («1134+ серий»),
    иначе plural(1134) давал бы «1134+ серии». */
export function episodeCountLabel(t: Title): string | null {
  const { released, totalUnknown } = episodeInfo(t);
  if (released === null) return null;
  if (totalUnknown) return `${released}+ ${plural(released, ['серии', 'серий', 'серий'])}`;
  return `${released} ${plural(released, ['серия', 'серии', 'серий'])}`;
}

/** Вариант правила для карточек: в CardTitle нет airing/epdates, поэтому
    «вышло» взять неоткуда — показываем итог, если он подтверждён источником.
    Заглушка импортера у анонса (12) и у онгоинга (24) за число не считается. */
export function cardEpisodeInfo(t: Pick<CardTitle, 'status' | 'type' | 'episodes'>): {
  count: number | null;
  totalUnknown: boolean;
} {
  const stated = t.episodes !== null && Number.isFinite(t.episodes) ? Number(t.episodes) : null;
  const stub = stated !== null && IMPORT_STUBS.has(stated);
  if (stated === null || stated <= 0) return { count: null, totalUnknown: false };
  if (t.status === 'upcoming' && stub) return { count: null, totalUnknown: false };
  if (t.type === 'movie') return { count: 1, totalUnknown: false };
  if (t.status === 'ongoing' && stub) return { count: stated, totalUnknown: true };
  return { count: stated, totalUnknown: false };
}

/** «1134+ серий» / «24 серии» / null — для карточек и рельсов. */
export function cardEpisodeLabel(t: Pick<CardTitle, 'status' | 'type' | 'episodes'>): string | null {
  const { count, totalUnknown } = cardEpisodeInfo(t);
  if (count === null) return null;
  if (totalUnknown) return `${count}+ ${plural(count, ['серии', 'серий', 'серий'])}`;
  return `${count} ${plural(count, ['серия', 'серии', 'серий'])}`;
}
