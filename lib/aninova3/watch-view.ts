import type { Title } from '@/lib/types';

/**
 * B2-B: данные страницы серии для preview-кинозала.
 *
 * Здесь нет ни одного «додуманного» поля: название серии берётся только из
 * `episodeNames` (таблица `episodes` или каталог), дата — только из
 * `airing`/`epdates`. Если данных нет, интерфейс честно показывает «Серия N»
 * и не подставляет дату/название из головы.
 */

const MSK = 'Europe/Moscow';

/** Корень preview: ссылки замороженного PlayerShell ведут на production-маршруты. */
export const PREVIEW_ROOT = '/preview/aninova-3';

/**
 * Переписывает внутреннюю ссылку плеера `/anime/...` в preview-маршрут,
 * сохраняя query/hash. Внешние ссылки и не-аниме маршруты возвращают null.
 */
export function previewAnimeHref(href: string | null | undefined): string | null {
  if (!href || !href.startsWith('/anime')) return null;
  if (href !== '/anime' && !href.startsWith('/anime/')) return null;
  return `${PREVIEW_ROOT}${href}`;
}

/** Название серии без пустых строк. */
export function episodeName(title: Title, episode: number): string | null {
  const raw = title.episodeNames?.[String(episode)];
  const name = raw?.trim();
  return name ? name : null;
}

/** Дата эфира серии (unix ms) из расписания или точных дат каталога. */
export function episodeAirDate(title: Title, episode: number): number | null {
  const aired = title.airing?.find((a) => a.ep === episode)?.at;
  if (typeof aired === 'number' && Number.isFinite(aired)) return aired;
  const dates = title.epdates as Record<string | number, number> | undefined;
  const exact = dates?.[episode];
  if (typeof exact === 'number' && Number.isFinite(exact)) return exact;
  return null;
}

/** Дата эфира по МСК: «20 октября 1999». Битая дата не роняет страницу. */
export function formatWatchDate(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(new Date(ms))
    .replace(/\s*г\.$/, '');
}

/**
 * Окно серий вокруг текущей для компактного списка под плеером.
 * Полный список на тысячу серий не рендерим: он есть на странице тайтла.
 */
export function episodeWindow(current: number, total: number, radius = 7): number[] {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total < 1) return [];
  const safeCurrent = Math.min(Math.max(1, Math.floor(current)), Math.floor(total));
  const safeRadius = Math.max(0, Math.floor(radius));
  const start = Math.max(1, safeCurrent - safeRadius);
  const end = Math.min(Math.floor(total), safeCurrent + safeRadius);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** Подпись «серия N из M» с честным «+», когда итог неизвестен. */
export function episodeOfLabel(episode: number, total: number, totalUnknown: boolean): string {
  if (total <= 1) return `серия ${episode}`;
  return `серия ${episode} из ${total}${totalUnknown ? '+' : ''}`;
}
