import type { Title } from './types';
import { episodeCount } from './episodes';
import { releasedCountFor } from './episode-data';

/**
 * Валидация номера серии для маршрутов /anime/[slug]/[episode] и
 * /api/providers/[slug]/[episode] (аудит 2026-10, задачи 1.2 и 1).
 *
 * История: сначала границей было поле `episodes`, где у онгоингов лежала заглушка
 * импортера 24 — /anime/one-piece/25 отдавал 404 при 1134 вышедших сериях.
 * Потом границей стало число из каталога (1134, данные июня 2025) — и 404
 * получили уже реально существующие серии 1135…1180. Теперь граница берётся из
 * единого правила lib/episodes.ts, которое учитывает свежие числа из БД
 * (lib/episode-overrides.ts, прайм в instrumentation.ts).
 *
 * Вынесено из page.tsx: файлы страниц в App Router не могут экспортировать
 * ничего кроме контракта (default, metadata, revalidate, generateStaticParams…),
 * а правило должно быть общим для страницы и API и покрытым тестами.
 */
/** Синхронная проверка по уже известной границе. */
export function episodeWithin(t: Pick<Title, 'status' | 'type' | 'episodes' | 'episodesReleased' | 'airing' | 'epdates' | 'anilistId'>, raw: string, max: number): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > Math.max(1, max)) return null;
  return n;
}

export function validEpisode(t: Title, raw: string): number | null {
  return episodeWithin(t, raw, episodeCount(t) ?? 0);
}

/** Верхняя граница номеров серий — для /api/providers и сообщений об ошибке. */
export function maxEpisodeNumber(t: Title): number {
  return Math.max(1, episodeCount(t) ?? 1);
}

/** Асинхронный вариант: граница из БД (задача 1 аудита). Не бросает. */
export async function validEpisodeDb(t: Title, raw: string): Promise<number | null> {
  return episodeWithin(t, raw, await maxEpisodeNumberDb(t));
}

export async function maxEpisodeNumberDb(t: Title): Promise<number> {
  return Math.max(1, (await releasedCountFor(t)) ?? 1);
}
