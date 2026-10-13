import type { Title } from './types';
import { loadTitles } from './catalog';
import { episodeCount } from './episodes';
import { setReleasedOverrides } from './episode-overrides';

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

/* ---------------------------------------------------------------------------
 * Задача 1 аудита: «сколько серий вышло» — из БД, а не из устаревшего каталога.
 *
 * Прайм выполняется один раз при старте процесса (instrumentation.ts) и подмешивает
 * числа в lib/episode-overrides.ts, поэтому episodeInfo() остаётся синхронной и её
 * по-прежнему можно звать из generateStaticParams, JSON-LD, карточек и /api/*.
 * Страницы серий от этого НЕ становятся динамическими: данные читаются до рендера.
 * ------------------------------------------------------------------------- */

const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';
const dbConfigured = () => Boolean(SUPA_URL && (SUPA_ANON || SUPA_SERVICE));

/* Фильтр «aired_at <= now()» живёт в представлениях БД (миграция
   20261012_set_episodes_released.sql), а не в query-строке: PostgREST не умеет
   GROUP BY, а тянуть десятки тысяч строк на каждый старт процесса нельзя. */

async function fetchJson<T>(path: string, opts: { noStore?: boolean } = {}): Promise<T[] | null> {
  if (!dbConfigured()) return null;
  const key = SUPA_SERVICE || SUPA_ANON;
  /* ИНЦИДЕНТ 2026-10-13 (500 FUNCTION_INVOCATION_FAILED на всех онгоингах):
     releasedFromDb() зовётся из рендера СТАТИЧЕСКИХ ISR-страниц
     (/anime/[slug], /anime/[slug]/[episode], revalidate 3600) через
     releasedCountFor(). Стоявший здесь cache:'no-store' превращал страницу
     «из статической в динамическую» прямо в рантайме, а Next 16 в проде
     делает это жёсткой ошибкой «Page changed from static to dynamic at
     runtime» → /500 на каждом онгоинге (one-piece, conan, sazae-san…).
     Теперь по умолчанию запрос идёт в data-кэш Next (revalidate 300 с —
     «сколько серий вышло» может отстать на 5 минут, это цена живых ISR-страниц),
     а no-store разрешён ТОЛЬКО вне рендера: прайм при старте процесса
     (module-scope / instrumentation) передаёт { noStore: true }. */
  const cacheInit = opts.noStore
    ? { cache: 'no-store' as const }
    : { next: { revalidate: Number(process.env.EPISODES_DB_REVALIDATE_SEC ?? 300) } };
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
      ...cacheInit,
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as T[];
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export interface PrimeResult {
  /** Сколько тайтлов получили свежее число из БД. */
  updated: number;
  /** Откуда взялись числа (для логов и /api/health). */
  from: ('episodes' | 'airing_schedule' | 'titles')[];
  configured: boolean;
}

/**
 * Собирает «вышло N серий» из трёх таблиц и кладёт в overrides:
 *   episodes         → max(number), где aired_at <= now или дата неизвестна;
 *   airing_schedule  → max(episode) среди уже вышедших;
 *   titles           → episodes_released (его пишет sync-episodes из Shikimori episodes_aired).
 * Берётся МАКСИМУМ из трёх и из числа в каталоге: источники дополняют друг друга
 * (у AniList расписание только с апреля 2025, у Shikimori нет дат по сериям).
 */
export async function primeEpisodeData(): Promise<PrimeResult> {
  if (!dbConfigured()) return { updated: 0, from: [], configured: false };

  const [episodes, airing, titles] = await Promise.all([
    /* noStore безопасен: прайм выполняется ВНЕ рендера (module-scope /
       instrumentation), статические страницы его не видят. */
    fetchJson<{ anime_id: number; max_number: number }>(`episode_progress?select=anime_id,max_number`, { noStore: true }),
    fetchJson<{ anime_id: number; max_episode: number }>(`airing_progress?select=anime_id,max_episode`, { noStore: true }),
    fetchJson<{ id: number; episodes_released: number | null }>(
      `titles?select=id,episodes_released&episodes_released=not.is.null&limit=20000`,
      { noStore: true },
    ),
  ]);

  const best = new Map<number, number>();
  const from = new Set<PrimeResult['from'][number]>();
  const put = (id: number | null | undefined, n: number | null | undefined, src: PrimeResult['from'][number]) => {
    if (!Number.isFinite(id as number) || !Number.isFinite(n as number) || (n as number) <= 0) return;
    const prev = best.get(id as number) ?? 0;
    if ((n as number) > prev) best.set(id as number, n as number);
    from.add(src);
  };
  for (const r of episodes ?? []) put(r.anime_id, r.max_number, 'episodes');
  for (const r of airing ?? []) put(r.anime_id, r.max_episode, 'airing_schedule');
  for (const r of titles ?? []) put(r.id, r.episodes_released, 'titles');
  if (!best.size) return { updated: 0, from: [], configured: true };

  /* Сверяем с каталогом: override имеет смысл, только если он БОЛЬше известного. */
  const merged = new Map<number, number>();
  for (const t of loadTitles()) {
    const fromDb = best.get(t.anilistId);
    if (!fromDb) continue;
    const known = Math.max(catalogEpisodeData(t).maxNumber, t.episodesReleased ?? 0);
    if (fromDb > known) merged.set(t.anilistId, fromDb);
  }
  setReleasedOverrides(merged);
  return { updated: merged.size, from: [...from], configured: true };
}

/* ---------------------------------------------------------------------------
 * Точное «вышло N серий» для конкретного тайтла — асинхронно, из БД.
 *
 * Зачем отдельно от primeEpisodeData(): прайм кладёт числа в процессный Map
 * (lib/episode-overrides.ts), а его видят не все исполнители — в dev-режиме Next
 * рендерит страницы в отдельных воркерах, и override туда не доезжает (проверено:
 * лог «[episodes] … 1 тайтлов» есть, а страница показывает число из каталога).
 * Поэтому маршруты, от которых зависит граница 404 и длина списка серий,
 * спрашивают БД напрямую. Ответ кэшируется data-кэшем Next (revalidate),
 * поэтому на ISR это не влияет и запрос не уходит на каждый рендер.
 * ------------------------------------------------------------------------- */

/** Сколько серий вышло по данным БД. null — БД не настроена или в ней нет строки. */
export async function releasedFromDb(animeId: number): Promise<number | null> {
  if (!dbConfigured()) return null;
  const [progress, airing, row] = await Promise.all([
    fetchJson<{ max_number: number }>(`episode_progress?anime_id=eq.${animeId}&select=max_number&limit=1`),
    fetchJson<{ max_episode: number }>(`airing_progress?anime_id=eq.${animeId}&select=max_episode&limit=1`),
    fetchJson<{ episodes_released: number | null }>(
      `titles?id=eq.${animeId}&select=episodes_released&limit=1`,
    ),
  ]);
  const candidates = [progress?.[0]?.max_number, airing?.[0]?.max_episode, row?.[0]?.episodes_released];
  let best = 0;
  for (const c of candidates) if (Number.isFinite(c as number) && (c as number) > best) best = c as number;
  return best > 0 ? best : null;
}

/**
 * Число серий для маршрута: максимум из БД и каталога.
 * Единственная точка, которой должны пользоваться страница тайтла, страница серии,
 * /api/providers и /api/availability — иначе граница 404 разъезжается с UI.
 */
export async function releasedCountFor(t: Title): Promise<number | null> {
  const fromCatalog = episodeCount(t);
  if (t.status !== 'ongoing') return fromCatalog; // фильм/finished/анонс — правило из каталога
  const fromDb = await releasedFromDb(t.anilistId);
  if (fromDb === null) return fromCatalog;
  return Math.max(fromDb, fromCatalog ?? 0);
}

/* Самостарт прайма после инцидента 2026-10-13 (вторая линия защиты рядом с
   самостартом каталога в lib/catalog.ts): хук instrumentation убран из проекта,
   потому что webpack собирал его edge-чанк с node:fs из lib/catalog и ронял
   сборку (UnhandledSchemeError) — прод оставался на старом деплое. Модуль
   грузится только в nodejs-рантайме (импортируют route/страницы), guard по
   NEXT_RUNTIME оставлен как защита от будущего edge-импорта. Повторный вызов
   безопасен: primeEpisodeData идемпотентен в пределах процесса. */
if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME === 'nodejs') {
  void primeEpisodeData().catch(() => {});
}
