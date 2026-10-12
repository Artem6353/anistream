import { weekBounds, mskDayIndex } from './schedule-core';
export { weekBounds, groupByDay, todayIndex, mskDayIndex } from './schedule-core';
import type { ScheduleEntry } from './types';
import { loadTitles, titleById } from './catalog';

/**
 * Расписание выхода серий (аудит 2026-10, ТЗ 1.1).
 *
 * Раньше рантайм Vercel сам ходил в AniList и при 429 (лимит 90 запросов/мин по IP,
 * а IP у Vercel общие) подставлял `demoWeek()` — детерминированную фейковую неделю
 * из хеша слага. На проде это выглядело как «AniList недоступен — показана неделя
 * из кэша (демо)» и карточки «One Piece серия 5 / Наруто серия 11 / Хоримия серия 8».
 *
 * Теперь:
 *  1) источник №1 — таблица Supabase `airing_schedule`, которую наполняет воркер
 *     scripts/sync-airing.mjs из GitHub Actions (свой IP, cron каждые 30 минут);
 *  2) источник №2 (fallback до заполнения таблицы) — реальный график `airing`
 *     из каталога, отфильтрованный по свежести: прошедшие серии старше 2 дней не
 *     показываются, чтобы не выдавать устаревшие даты за актуальные;
 *  3) данных нет вовсе → пустой список, UI рисует нормальное пустое состояние.
 * Демо-недели больше нет: прямые запросы к AniList из рантайма удалены.
 */

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Сколько дней назад ещё показываем вышедшие серии (блок «Вчера» на главной). */
const RECENT_DAYS = 2;

type Row = { anime_id: number; episode: number; airing_at: string };

async function readDbWindow(startMs: number, endMs: number): Promise<ScheduleEntry[] | null> {
  if (!SUPA_URL || !SUPA_ANON) return null;
  const from = new Date(startMs).toISOString();
  const to = new Date(endMs).toISOString();
  const query =
    `${SUPA_URL}/rest/v1/airing_schedule` +
    `?select=anime_id,episode,airing_at&airing_at=gte.${from}&airing_at=lte.${to}` +
    `&order=airing_at.asc&limit=5000`;
  try {
    const res = await fetch(query, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` },
      signal: AbortSignal.timeout(6000),
      /* ISR-кэш: страница и так ревалидируется раз в 10 минут, не дёргаем БД чаще. */
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Row[];
    if (!Array.isArray(rows)) return null;
    return rows
      .filter((r) => Number.isFinite(r.anime_id) && Number.isFinite(r.episode))
      .map((r) => toEntry(r.anime_id, r.episode, Date.parse(r.airing_at), 'db'))
      .filter((e): e is ScheduleEntry => e !== null && Number.isFinite(e.at));
  } catch {
    return null; // БД недоступна — падаем в каталожный fallback, страницу не роняем
  }
}

function toEntry(animeId: number, episode: number, at: number, source: ScheduleEntry['source']): ScheduleEntry | null {
  const known = titleById.get(animeId);
  // В расписании показываем только тайтлы нашего каталога: иначе кликнуть некуда.
  if (!known || known.hidden) return null;
  return {
    at,
    episode,
    anilistId: animeId,
    slug: known.slug,
    ru: known.ru,
    romaji: known.romaji,
    poster: known.poster,
    source,
  };
}

/** Fallback: реальный график из каталога (без фейковых номеров и дат). */
export function catalogWeek(startMs: number, endMs: number): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  for (const t of loadTitles()) {
    for (const a of t.airing ?? []) {
      if (!Number.isFinite(a.at) || a.at < startMs || a.at > endMs) continue;
      const entry = toEntry(t.anilistId, a.ep, a.at, 'catalog');
      if (entry) out.push(entry);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Границы окна расписания в unix-ms: −2 дня … +8 дней (как у воркера). */
export function scheduleWindow(now = Date.now()): { startMs: number; endMs: number } {
  return { startMs: now - RECENT_DAYS * 86_400_000, endMs: now + 8 * 86_400_000 };
}

export type ScheduleSource = 'db' | 'catalog' | 'empty';

export interface WeekSchedule {
  entries: ScheduleEntry[];
  /** Откуда данные: БД, каталожный fallback или пусто. В UI не показывается как «демо». */
  source: ScheduleSource;
  /** ISO-время самой свежей записи — для подписи «обновлено N назад». */
  freshAt: number | null;
}

/** Расписание на окно −2…+8 дней. Не бросает: при любом сбое — пустой список. */
export async function getSchedule(now = Date.now()): Promise<WeekSchedule> {
  const { startMs, endMs } = scheduleWindow(now);
  const fromDb = await readDbWindow(startMs, endMs);
  const entries = fromDb && fromDb.length ? fromDb : catalogWeek(startMs, endMs);
  const freshAt = entries.reduce((m, e) => (e.at > m ? e.at : m), 0) || null;
  return {
    entries,
    source: entries.length ? ((fromDb && fromDb.length ? 'db' : 'catalog') as ScheduleSource) : 'empty',
    freshAt,
  };
}

/** Неделя Пн–Вс МСК для доски расписания. */
export async function getWeekSchedule(): Promise<WeekSchedule & { live: boolean }> {
  const { start, end } = weekBounds();
  const all = await getSchedule();
  const entries = all.entries.filter((e) => {
    const ms = e.at;
    return ms >= start * 1000 && ms < end * 1000;
  });
  /* `live` сохранён для совместимости с API-контрактом (/api/schedule), но больше
     не означает «демо»: true — данные из БД воркера, false — каталожный fallback. */
  return { ...all, entries, live: all.source === 'db' };
}

/** Эфиры конкретного дня (МСК): блок «Сегодня» на главной и в сайдбаре. */
export async function getDaySchedule(dayOffset = 0, now = Date.now()): Promise<ScheduleEntry[]> {
  const { entries } = await getSchedule(now);
  const target = mskDayIndex(now + dayOffset * 86_400_000);
  return entries.filter((e) => mskDayIndex(e.at) === target);
}
