import type { Title } from './types';

/**
 * Чтение таблицы `episodes` из Supabase (аудит 2026-10, ТЗ 1.3).
 *
 * Зачем: «свежесть ленты» и названия серий брались из полей `airing`/`epdates`
 * внутри titles.json, которые не обновлялись после импорта. На странице «Ван-Пис»
 * в октябре 2026 висело «последняя серия вышла 29 июня 2025 (эп. 1134)», а названия
 * серий были «Episode 1123». Теперь источник — таблица, которую наполняет
 * scripts/sync-episodes.mjs.
 *
 * Если БД не настроена или пуста, возвращаем данные каталога — страница не деградирует.
 */

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Строка PostgREST-ответа таблицы `episodes`. */
type DbEpisodeRow = { number: number; title_ru: string | null; title_en: string | null; aired_at: string | null };

export interface EpisodeRow {
  number: number;
  name: string | null;
  airedAt: number | null;
}

export interface EpisodeData {
  /** Названия серий по номерам (только непустые) — для «Серия N» вместо «Episode N». */
  names: Record<string, string>;
  /** Серии с датами — для блока «Выход серий» (уникальный контент страницы тайтла). */
  rows: EpisodeRow[];
  /** Максимальный известный номер серии. */
  maxNumber: number;
  /** Дата последнего эфира (unix ms) — для «свежести ленты». */
  lastAiredAt: number | null;
  /** Откуда данные: таблица или fallback каталога. */
  source: 'db' | 'catalog' | 'empty';
}

/** Сколько строк тянем: у гигантов («Садзаэ-сан») тысячи серий, страница не резиновая. */
const ROW_LIMIT = 2000;

export async function getEpisodeData(animeId: number): Promise<EpisodeData | null> {
  if (!SUPA_URL || !SUPA_ANON) return null;
  const url =
    `${SUPA_URL}/rest/v1/episodes?anime_id=eq.${animeId}` +
    `&select=number,title_ru,title_en,aired_at&order=number.asc&limit=${ROW_LIMIT}`;
  try {
    const res = await fetch(url, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` },
      signal: AbortSignal.timeout(5000),
      /* ISR-кэш: страница тайтла и так ревалидируется, не дёргаем БД на каждый запрос. */
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as DbEpisodeRow[];
    if (!Array.isArray(rows) || !rows.length) return null;

    const names: Record<string, string> = {};
    const list: EpisodeRow[] = [];
    let maxNumber = 0;
    let lastAiredAt: number | null = null;
    for (const r of rows) {
      if (!Number.isFinite(r.number)) continue;
      if (r.number > maxNumber) maxNumber = r.number;
      /* ТЗ 1.3.4: русское название → иначе английское → иначе пусто (UI скажет «Серия N»). */
      const name = (r.title_ru ?? r.title_en ?? '').trim();
      if (name) names[String(r.number)] = name;
      const at = r.aired_at ? Date.parse(r.aired_at) : Number.NaN;
      const airedAt = Number.isFinite(at) ? at : null;
      if (airedAt !== null && (lastAiredAt === null || airedAt > lastAiredAt)) lastAiredAt = airedAt;
      list.push({ number: r.number, name: name || null, airedAt });
    }
    return { names, rows: list, maxNumber, lastAiredAt, source: 'db' };
  } catch {
    return null;
  }
}

/** Fallback из каталога: те же поля, но из `airing`/`epdates` titles.json. */
export function catalogEpisodeData(t: Title): EpisodeData {
  const names: Record<string, string> = { ...(t.episodeNames ?? {}) };
  const byNumber = new Map<number, EpisodeRow>();
  let lastAiredAt: number | null = null;
  const put = (n: number, at: number | null) => {
    if (!Number.isFinite(n) || n <= 0) return;
    const prev = byNumber.get(n);
    byNumber.set(n, { number: n, name: names[String(n)] ?? null, airedAt: at ?? prev?.airedAt ?? null });
    if (at !== null && (lastAiredAt === null || at > lastAiredAt)) lastAiredAt = at;
  };
  for (const a of t.airing ?? []) put(a.ep, Number.isFinite(a.at) ? a.at : null);
  const ed = t.epdates as Record<string, number> | undefined;
  if (ed) for (const key of Object.keys(ed)) put(Number(key), Number(ed[key]) || null);
  const rows = [...byNumber.values()].sort((a, b) => a.number - b.number);
  const maxNumber = rows.length ? rows[rows.length - 1].number : 0;
  return { names, rows, maxNumber, lastAiredAt, source: rows.length ? 'catalog' : 'empty' };
}

/** Единая точка: БД → каталог. Не бросает. */
export async function episodeDataFor(t: Title): Promise<EpisodeData> {
  const fromDb = await getEpisodeData(t.anilistId);
  if (fromDb) return fromDb;
  return catalogEpisodeData(t);
}
