import type { CardTitle, CatalogQuery, CatalogResult, Title } from './types';
import { promises as fsp, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { genreLabel, LENGTH_BUCKETS } from './labels';
import { episodeCount } from './episodes';

/**
 * Каталог читается из файла на рантайме (сервер-only): JSON на 5000+ тайтлов
 НЕ пакуется в webpack-бандл (иначе сборка упирается в память), а читается один
 * раз на процесс с проверкой mtime (dev-friendly).
 *
 * Аудит 2026-10 (ТЗ 2.1): файл — это fallback. Основной источник задаётся
 * CATALOG_SOURCE=db|file (по умолчанию db, если заданы Supabase-переменные):
 * `lib/data/titles.json` весит 28 МБ и коммитится кронами каждые 6 часов, раздувая
 * git pack навсегда, а на Vercel его приходится парсить в каждой функции.
 * Таблица public.titles наполняется scripts/import-titles-to-db.mjs и воркерами.
 *
 * ВАЖНО: чтение из БД асинхронное, а весь существующий код (≈30 файлов) вызывает
 * loadTitles() синхронно. Поэтому слой БД заполняет ТОТ ЖЕ in-memory кэш через
 * `primeCatalogFromDb()`, который вызывается один раз на процесс из instrumentation
 * (см. instrumentation.ts). Пока прайм не завершился, работает файл — деградации нет.
 */
/* Аудит 30.09 (P2-15/16): кэш больше не смешивает варианты includeHidden —
   в памяти держим СЫРОЙ список, фильтрация выполняется на каждый вызов (дешёво),
   поэтому админское «скрыть тайтл» сразу видно и в каталоге, и в sitemap,
   и в similarTitles/heroSlides/schedule (раньше часть кода читала застывшую
   константу TITLES и продолжала показывать скрытое). */
let RAW: { mtime: number; titles: (Title & { hidden?: boolean })[] } | null = null;
/* Кэш заполнен из БД: файловый mtime его не инвалидирует (иначе первый же вызов
   rawTitles() перезаписал бы 8000 строк из public.titles файлом). */
let RAW_FROM_DB = false;
const TITLES_FILE = () => path.join(process.cwd(), 'lib', 'data', 'titles.json');

function rawTitles(): (Title & { hidden?: boolean })[] {
  if (RAW && RAW_FROM_DB) return RAW.titles;
  const mtime = statSync(TITLES_FILE()).mtimeMs;
  if (RAW && RAW.mtime === mtime) return RAW.titles;
  const titles = JSON.parse(readFileSync(TITLES_FILE(), 'utf8')) as (Title & { hidden?: boolean })[];
  RAW = { mtime, titles };
  return titles;
}

/* ------------------------------- CATALOG_SOURCE ------------------------------- */

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function catalogSource(): 'db' | 'file' {
  const flag = (process.env.CATALOG_SOURCE ?? '').toLowerCase();
  if (flag === 'file') return 'file';
  if (flag === 'db') return 'db';
  return SUPA_URL && SUPA_KEY ? 'db' : 'file';
}

type DbTitle = {
  id: number;
  slug: string;
  anilist_id: number;
  mal_id: number | null;
  shikimori_id: number | null;
  title_ru: string | null;
  title_en: string | null;
  title_romaji: string | null;
  format: string | null;
  status: string | null;
  year: number | null;
  season: string | null;
  episodes_total: number | null;
  episodes_released: number | null;
  score: number | string | null;
  popularity: number | null;
  genres: string[] | null;
  studios: string[] | null;
  source: string | null;
  duration: number | null;
  is_adult: boolean | null;
  description_ru: string | null;
  description_alt: string | null;
  poster: string | null;
  banner: string | null;
  trailer: string | null;
  meta_source: string | null;
  hidden: boolean | null;
};

function fromDbRow(r: DbTitle): Title & { hidden?: boolean } {
  return {
    anilistId: r.anilist_id ?? r.id,
    slug: r.slug,
    ru: r.title_ru || r.title_romaji || r.slug,
    romaji: r.title_romaji || r.title_en || r.slug,
    en: r.title_en,
    type: (r.format as Title['type']) ?? 'tv',
    year: r.year ?? 0,
    season: (r.season as Title['season']) ?? null,
    status: (r.status as Title['status']) ?? 'finished',
    /* НИКАКОЙ заглушки: null означает «итог не объявлен» (см. lib/episodes.ts). */
    episodes: r.episodes_total ?? null,
    episodesReleased: r.episodes_released ?? null,
    score: Number(r.score ?? 0) || 0,
    favourites: r.popularity ?? 0,
    genres: r.genres ?? [],
    poster: r.poster ?? '',
    banner: r.banner ?? null,
    description: r.description_ru ?? '',
    trailer: r.trailer ?? null,
    studios: r.studios ?? [],
    source: r.source ?? null,
    duration: r.duration ?? null,
    isAdult: Boolean(r.is_adult),
    malId: r.mal_id ?? null,
    metaSource: (r.meta_source as Title['metaSource']) ?? 'anilist',
    shikimori: r.shikimori_id ? { id: r.shikimori_id, ru: r.title_ru ?? null, description: r.description_alt ?? null, score: Number(r.score ?? 0) || 0 } : null,
    hidden: Boolean(r.hidden),
  } as Title & { hidden?: boolean };
}

/** Сколько строк тянем за раз. PostgREST по умолчанию отдаёт максимум 1000 строк
 *  (db-max-rows), поэтому просить больше бессмысленно: ответ обрежется, и цикл
 *  ниже ошибочно примет это за последнюю страницу. */
const DB_PAGE = 1000;

let priming: Promise<number> | null = null;

/**
 * Загружает каталог из public.titles в тот же in-memory кэш, что и файл.
 * Вызывается один раз на процесс (instrumentation); повторные вызовы возвращают
 * тот же промис. При ошибке/пустой таблице кэш остаётся файловым — сайт не падает.
 */
export function primeCatalogFromDb(): Promise<number> {
  if (priming) return priming;
  priming = (async () => {
    if (catalogSource() !== 'db' || !SUPA_URL || !SUPA_KEY) return 0;
    /* Бюджет на весь прайм (инцидент 2026-11-17): раньше каждый батч имел свой
       таймаут 20 с, поэтому при медленной БД прайм на 9 батчей занимал до трёх
       минут и висел фоном в serverless-инстансе, из-за чего /api/health и страницы
       иногда не отвечали вовсе. Теперь общий дедлайн: не успели — остаёмся на
       файловом каталоге (он уже в памяти), а не тормозим весь процесс. */
    const budgetMs = Math.max(1000, Number(process.env.CATALOG_DB_PRIME_BUDGET_MS ?? 8000) || 8000);
    const deadline = Date.now() + budgetMs;
    try {
      const out: (Title & { hidden?: boolean })[] = [];
      /* Идём до пустой страницы, а не до `rows.length < DB_PAGE`: сервер может
         отдать меньше запрошенного (db-max-rows), и это не значит, что данные
         закончились. Смещение увеличиваем на фактическое число строк — иначе
         при ответе 1000 на запрос 2000 диапазон 1000–1999 был бы пропущен. */
      let complete = false;
      for (let from = 0; ; ) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          console.warn(`[catalog] прайм из БД не уложился в ${budgetMs} мс — остаёмся на файловом каталоге`);
          return 0;
        }
        const res = await fetch(
          `${SUPA_URL}/rest/v1/titles?select=*&order=id.asc&limit=${DB_PAGE}&offset=${from}`,
          {
            headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
            // Не больше остатка общего бюджета: один медленный батч не съедает весь лимит.
            signal: AbortSignal.timeout(Math.max(1000, Math.min(20_000, remaining))),
          },
        );
        if (!res.ok) return 0; // таблица ещё не создана/нет прав — остаёмся на файле
        const rows = (await res.json()) as DbTitle[];
        if (!Array.isArray(rows)) return 0;
        if (!rows.length) {
          complete = true;
          break;
        }
        for (const r of rows) out.push(fromDbRow(r));
        from += rows.length;
      }
      /* Сюда можно попасть только после пустой страницы; явная проверка защищает
         от будущих правок, которые добавят break/return внутри цикла. */
      if (!complete) return 0;
      /* Предохранитель (аудит 2026-10, задача 1): неполная таблица не должна
         подменять каталог. Если импорт прервался или в БД пока одна строка,
         сайт показывал бы один тайтл вместо 8017 — остаёмся на файле. */
      const minRows = Number(process.env.CATALOG_DB_MIN_ROWS ?? 100);
      if (out.length < minRows) {
        console.warn(
          `[catalog] в Supabase всего ${out.length} строк (порог CATALOG_DB_MIN_ROWS=${minRows}) — остаёмся на файловом каталоге`,
        );
        return 0;
      }
      RAW = { mtime: 0, titles: out };
      RAW_FROM_DB = true;
      slugMapCache = null;
      idMapCache = null;
      return out.length;
    } catch {
      return 0;
    }
  })();
  return priming;
}

/** Откуда фактически прочитан каталог — для /api/health и smoke. */
export function catalogSourceInfo(): { source: 'db' | 'file'; configured: 'db' | 'file'; count: number } {
  return { source: RAW_FROM_DB ? 'db' : 'file', configured: catalogSource(), count: RAW?.titles.length ?? 0 };
}

/* Самострахование после инцидента 2026-10-13: хук instrumentation жил в файле
   instrumentation.node.ts, который Next 16 не распознаёт (детектор требует имя
   `instrumentation.{ts,tsx,js,jsx}`), — прайм молча не запускался, и каждый
   холодный процесс парсил 28 МБ titles.json вместо кэша из БД. Теперь прайм
   стартует ЕЩЁ и при первой загрузке модуля в nodejs-рантайме (повторный вызов
   безопасен: primeCatalogFromDb возвращает тот же промис). В edge-бандлы модуль
   не попадает: proxy.ts импортирует только edge-safe lib/genre-redirect; guard
   по NEXT_RUNTIME оставлен как вторая линия защиты. */
if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME === 'nodejs') {
  void primeCatalogFromDb().catch(() => {});
}

export function loadTitles(includeHidden = false): Title[] {
  const titles = rawTitles();
  return includeHidden ? titles : titles.filter((t) => !t.hidden);
}

/** Сброс slug/id-карт: после мутации hidden списки видимых тайтлов меняются. */
function invalidateLookup(): void {
  slugMapCache = null;
  idMapCache = null;
}

/** @deprecated Удалено (аудит, P1-8): `export const TITLES = loadTitles()` выполнялся
 *  на импорте модуля и парсил 20,8 МБ titles.json в КАЖДОМ процессе — даже при
 *  CATALOG_SOURCE=db, где файл не нужен (замер: 137 мс чтения + 108 мс JSON.parse).
 *  Ни один модуль константу не импортировал. Используйте loadTitles(). */

export const PER_PAGE = 24;

/* Объявлены до primeCatalogFromDb (сбрасываются при подмене кэша). */
let slugMapCache: { mtime: number; m: Map<string, Title> } | null = null;
let idMapCache: { mtime: number; m: Map<number, Title> } | null = null;
function mtimeNow(): number {
  // Всегда свежий stat: кэш устаревает после записи titles.json
  // (скрытие тайтла из админки), и карты slug/id должны инвалидироваться.
  if (RAW_FROM_DB) return 0;
  return statSync(TITLES_FILE()).mtimeMs;
}
function bySlugMap(): Map<string, Title> {
  const mt = mtimeNow();
  if (!slugMapCache || slugMapCache.mtime !== mt) slugMapCache = { mtime: mt, m: new Map(loadTitles().map((t) => [t.slug, t])) };
  return slugMapCache.m;
}
function byIdMap(): Map<number, Title> {
  const mt = mtimeNow();
  if (!idMapCache || idMapCache.mtime !== mt) idMapCache = { mtime: mt, m: new Map(loadTitles().map((t) => [t.anilistId, t])) };
  return idMapCache.m;
}
/* Аудит 30.09 (стиль-5): больше не фейковый Map через as unknown as —
   честный lookup-объект (get/has) с mtime-инвалидацией; watchOrder принимает TitleLookup. */
export const titleById: { get(id: number): Title | undefined; has(id: number): boolean } = {
  get: (id: number) => byIdMap().get(id),
  has: (id: number) => byIdMap().has(id),
};

export const getTitle = (slug: string) => bySlugMap().get(slug);

export function allTitles(): Title[] {
  return loadTitles();
}

/** Таймаут записи в Supabase (модерация не должна подвешивать админку). */
const HIDE_WRITE_TIMEOUT_MS = 8000;

/**
 * Скрыть / показать тайтл (модерация, DMCA).
 *
 * Аудит (P1-4): раньше `POST /api/admin/hide` писал флаг ТОЛЬКО в
 * `lib/data/titles.json`. В DB-режиме (`CATALOG_SOURCE=db`, дефолт при заданных
 * Supabase-переменных) каталог живёт в in-memory кэше из public.titles, файл
 * вообще не читается (`rawTitles()` при RAW_FROM_DB) — поэтому тайтл не скрывался
 * до перезапуска, а на serverless запись в ФС вообще падала с 500.
 *
 * Теперь: DB-режим → PATCH public.titles + правка in-memory кэша (без рестарта);
 * файловый режим → прежняя атомарная запись (tmp+rename).
 * `found: false` — такого slug нет (роут отвечает 404).
 */
export async function setTitleHidden(
  slug: string,
  hidden: boolean,
): Promise<{ source: 'db' | 'file'; found: boolean }> {
  if (catalogSource() === 'db' && SUPA_URL && SUPA_KEY) {
    const res = await fetch(`${SUPA_URL}/rest/v1/titles?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ hidden, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(HIDE_WRITE_TIMEOUT_MS),
      /* Модерация должна видеть результат сразу — data-кэш Next здесь не нужен. */
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`supabase PATCH titles: HTTP ${res.status}`);
    const rows = (await res.json().catch(() => [])) as unknown[];
    const found = Array.isArray(rows) && rows.length > 0;
    if (found && RAW_FROM_DB) {
      /* Кэш держит те же объекты — правим на месте и пересобираем карты,
         иначе «скрытое» продолжит отдаваться до холодного старта. */
      const cached = RAW?.titles.find((t) => t.slug === slug);
      if (cached) cached.hidden = hidden;
      invalidateLookup();
    }
    return { source: 'db', found };
  }

  const file = TITLES_FILE();
  const titles = JSON.parse(await fsp.readFile(file, 'utf8')) as (Title & { hidden?: boolean })[];
  const title = titles.find((t) => t.slug === slug);
  if (!title) return { source: 'file', found: false };
  title.hidden = hidden;
  /* Аудит 30.09 (P1-12): атомарная запись (tmp+rename) — конкурентные скрытия
     не затирают друг друга и читатели не видят половину файла. */
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(titles));
  await fsp.rename(tmp, file);
  if (!RAW_FROM_DB) invalidateLookup();
  return { source: 'file', found: true };
}

/** Домашние подборки. S2.1 (аудит 28.09): рельсы главной урезаны 14→10, онгоинги —
    со 178+ (рендерились ВСЕ) до 10: вес SSR-HTML главной 1081→≤600 КБ, DOM/flight легче. */
export const HOME_RAIL_SIZE = 10;
export function homeRails() {
  const popular = [...loadTitles()].sort((a, b) => b.favourites - a.favourites).slice(0, HOME_RAIL_SIZE);
  const top = [...loadTitles()].sort((a, b) => b.score - a.score).slice(0, HOME_RAIL_SIZE);
  /* ТЗ 3.1.5: «Новинки последних лет» состояли из анонсов 2027 года — NOT_YET_RELEASED
     вытеснял реально вышедшие тайтлы, потому что сортировка шла по году. Исключаем
     upcoming и добавляем для них отдельную рельсу. */
  const yearNow = new Date().getFullYear();
  const fresh = [...loadTitles()]
    .filter((t) => t.status !== 'upcoming' && t.year >= yearNow - 3)
    .sort((a, b) => b.year - a.year || b.favourites - a.favourites)
    .slice(0, HOME_RAIL_SIZE);
  const upcoming = loadTitles()
    .filter((t) => t.status === 'upcoming')
    .sort((a, b) => b.favourites - a.favourites)
    .slice(0, HOME_RAIL_SIZE);
  const ongoing = loadTitles()
    .filter((t) => t.status === 'ongoing')
    .sort((a, b) => b.favourites - a.favourites)
    .slice(0, HOME_RAIL_SIZE);
  const movies = loadTitles().filter((t) => t.type === 'movie').sort((a, b) => b.score - a.score).slice(0, HOME_RAIL_SIZE);
  return { popular, top, fresh, upcoming, ongoing, movies };
}

export function heroSlides(): Title[] {
  return [...loadTitles()]
    .filter((t) => t.banner)
    .sort((a, b) => b.favourites - a.favourites)
    .slice(0, 5);
}

/** S2.2: урезать Title до полей карточки перед передачей в PosterCard — иначе полный
    объект (описание/персонажи/airing, ~2.7 КБ) сериализуется в RSC-payload на каждую карточку. */
export function toCardTitle(t: Title): CardTitle {
  return {
    slug: t.slug,
    ru: t.ru,
    romaji: t.romaji,
    type: t.type,
    year: t.year,
    status: t.status,
    episodes: t.episodes,
    episodesReleased: t.episodesReleased,
    score: t.score,
    genres: t.genres.slice(0, 3),
    poster: t.poster,
  };
}

export function genreStats(): { slug: string; count: number }[] {
  const map = new Map<string, number>();
  for (const t of loadTitles()) for (const g of t.genres) map.set(g, (map.get(g) ?? 0) + 1);
  return [...map.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count);
}

export function titlesByGenre(genre: string, sort: CatalogQuery['sort'] = 'pop'): Title[] {
  return sortTitles(loadTitles().filter((t) => t.genres.includes(genre)), sort);
}

/** ТЗ Jikan блок 5: Jikan-тайтлы не вытесняют AniList из топов — пенальти 0.95. */
const effScore = (t: Title) => (t.metaSource === 'jikan' ? t.score * 0.95 : t.score);
const effPop = (t: Title) => (t.metaSource === 'jikan' ? t.favourites * 0.95 : t.favourites);

export function sortTitles(items: Title[], sort: CatalogQuery['sort'] = 'pop'): Title[] {
  const arr = [...items];
  switch (sort) {
    case 'score':
      return arr.sort((a, b) => effScore(b) - effScore(a) || effPop(b) - effPop(a));
    case 'new':
      /* ТЗ 3.1.5: sort=new больше не отдаёт анонсы первыми — сначала реально вышедшее. */
      return arr.sort(
        (a, b) =>
          Number(a.status === 'upcoming') - Number(b.status === 'upcoming') ||
          b.year - a.year ||
          b.favourites - a.favourites,
      );
    case 'az':
      return arr.sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
    default:
      return arr.sort((a, b) => effPop(b) - effPop(a));
  }
}

export function searchTitles(q: string, limit = 24): Title[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const terms = query.split(/\s+/);
  const scored: { t: Title; s: number }[] = [];
  for (const t of loadTitles()) {
    const ru = t.ru.toLowerCase();
    const shikiRu = (t.shikimori?.ru ?? '').toLowerCase();
    const rom = t.romaji.toLowerCase();
    const en = (t.en ?? '').toLowerCase();
    const genres = t.genres.map((g) => genreLabel(g).toLowerCase()).join(' ');
    let s = 0;
    for (const term of terms) {
      if (ru.startsWith(term)) s += 6;
      else if (ru.includes(term)) s += 4;
      if (shikiRu && shikiRu.includes(term)) s += 4;
      if (rom.startsWith(term)) s += 5;
      else if (rom.includes(term)) s += 3;
      if (en.includes(term)) s += 2;
      if (genres.includes(term)) s += 1;
      if (String(t.year) === term) s += 2;
    }
    if (s > 0) scored.push({ t, s: s + Math.log10(t.favourites + 1) });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t);
}

export function filterCatalog(query: CatalogQuery): CatalogResult {
  let items = loadTitles();
  if (query.q) items = searchTitles(query.q, 500);
  if (query.genres?.length) items = items.filter((t) => query.genres!.every((g) => t.genres.includes(g)));
  if (query.type) items = items.filter((t) => t.type === query.type);
  if (query.status) items = items.filter((t) => t.status === query.status);
  if (query.year) items = items.filter((t) => String(t.year) === query.year);
  if (query.yearFrom) items = items.filter((t) => t.year >= Number(query.yearFrom));
  if (query.yearTo) items = items.filter((t) => t.year <= Number(query.yearTo));
  if (query.length) {
    const bucket = LENGTH_BUCKETS[query.length];
    /* ТЗ 1.2: bucket.test(null) приводил число к 0 и молча относил анонсы к «коротким». */
    if (bucket) items = items.filter((t) => episodeCount(t) !== null && bucket.test(episodeCount(t) as number));
  }
  items = sortTitles(items, query.sort);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  /* Аудит 30.09 (P2-17): ?page=abc → Number()=NaN → slice(NaN,NaN)=[] — пустая
     выдача вместо первой страницы. Санитизируем до клампа. */
  const rawPage = query.page ?? 1;
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, Math.trunc(rawPage)), pages) : 1;
  return { items: items.slice((page - 1) * PER_PAGE, page * PER_PAGE), total, page, pages };
}

export function topTitles(limit = 250): Title[] {
  return [...loadTitles()].filter((t) => t.score > 0).sort((a, b) => b.score - a.score || b.favourites - a.favourites).slice(0, limit);
}

export function yearsAvailable(): number[] {
  return [...new Set(loadTitles().map((t) => t.year).filter((y) => y > 0))].sort((a, b) => b - a);
}

/** Похожие тайтлы: пересечение жанров + близкий год. */
export function similarTitles(title: Title, limit = 12): Title[] {
  return loadTitles().filter((t) => t.slug !== title.slug)
    .map((t) => ({
      t,
      s:
        t.genres.filter((g) => title.genres.includes(g)).length * 2 +
        (t.type === title.type ? 1 : 0) -
        Math.min(3, Math.abs(t.year - title.year) / 5),
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t);
}
