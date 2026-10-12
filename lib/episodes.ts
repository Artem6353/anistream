import type { CardTitle, Title } from './types';
import { plural } from './format';
import { getReleasedOverride } from './episode-overrides';

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

/** Максимальный известный номер серии: airing-график, точные даты и свежее число из БД.
 *
 *  Задача 1 аудита: поле `airing` в titles.json заморожено на момент импорта, поэтому
 *  у «Ван-Пис» границей осталось 1134 (данные июня 2025), хотя Shikimori отдаёт
 *  episodes_aired=1180, а AniList знает график до 1189 — серии 1135…1180 отдавали 404.
 *  Свежее число из БД (episodes / airing_schedule / titles.episodes_released)
 *  подмешивается через lib/episode-overrides.ts при старте процесса: функция остаётся
 *  синхронной, потому что её зовут generateStaticParams, JSON-LD, карточки и /api/*. */
/** Максимум по каталогу: airing-график и точные даты серий. */
export function maxCatalogEpisode(t: Pick<Title, 'airing' | 'epdates'>): number {
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

/** То же + свежее число из БД (lib/episode-overrides.ts). Используется для онгоингов. */
export function maxKnownEpisode(t: Pick<Title, 'airing' | 'epdates'> & { anilistId?: number }): number {
  return Math.max(getReleasedOverride(t.anilistId) ?? 0, maxCatalogEpisode(t));
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
  /* Override из БД учитываем только у онгоингов: у фильма/завершённого сериала итог
     и так известен из источника, а airing_schedule хранит окно -2…+8 дней и мог бы
     «дорисовать» фильму несуществующие серии. */
  const aired = t.status === 'ongoing' ? maxKnownEpisode(t) : maxCatalogEpisode(t);
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
    /* Онгоинг: «вышло» — это график эфира (и свежее число из БД), а `episodes`
       означает ИТОГ. Приоритет: max(БД, airing/epdates, episodesReleased), и только
       если ничего нет — episodes, когда он не заглушка. Прямой max(aired, stated)
       рисовал бы несуществующие серии (у «Ван-Пис» заглушка 24 при aired 1134,
       а при announced=25/airing=12 — наоборот). */
    const fromCatalog = Number.isFinite(t.episodesReleased as number) ? Number(t.episodesReleased) : 0;
    const released = Math.max(aired, fromCatalog) || (statedUsable ? (stated as number) : null);
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
