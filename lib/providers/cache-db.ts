import type { EpisodeSource, EpisodeSources } from './types';
import { normalizeProviderUrl } from './url';

/**
 * Supabase-бэкенд кэша резолвов (feat/db-cache).
 *
 * Почему: `.cache/providers-resolve-cache.json` дорос до 93 МБ при лимите GitHub 100 МБ
 * на файл, Git LFS недоступен по квотам, а каждый коммит такого файла ещё и раздувает
 * pack. Таблицы `episode_sources` + `episode_source_urls` (миграция 20261012) уже
 * существуют и используются на чтение (`lib/episode-sources.ts`) — теперь они же
 * становятся хранилищем записи.
 *
 * Схема отображения:
 *   ключ файлового кэша `ep:<slug>:<ep>`  ⇄  `anime_id` (AniList) + `episode`
 *   одна запись кэша   ⇄  строка `episode_source_urls` на каждую озвучку (URL конкретной серии)
 *                         + строка `episode_sources` с метаданными озвучки (шапка)
 *
 * В память грузим ТОЛЬКО per-episode строки (`episode_source_urls`): шаблонные записи
 * (`episode_sources.embed_url` без per-episode строк) и так отдаёт `dbEpisodeSources`
 * напрямую из БД, дублировать их в память смысла нет.
 */

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/** Настроена ли запись/чтение кэша в Supabase (нужны URL и ключ). */
export function dbCacheConfigured(): boolean {
  return Boolean(SUPA_URL && SUPA_KEY);
}

const headers = (extra: Record<string, string> = {}) => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  ...extra,
});

const PAGE_SIZE = 1000;
const UPSERT_TIMEOUT_MS = 15_000;

export interface DbCacheEntry {
  /** `ep:<slug>:<episode>` — тот же формат ключа, что был в файловом кэше. */
  key: string;
  at: number;
  sources: EpisodeSources;
}

type UrlRow = {
  anime_id: number;
  provider: string;
  translation_id: string;
  episode: number;
  kind: string | null;
  embed_url: string | null;
  checked_at: string | null;
};

type SourceRow = {
  anime_id: number;
  provider: string;
  translation_id: string;
  translation_title: string | null;
  translation_type: string | null;
  episodes_count: number | null;
};

const PROVIDER_NAMES: Record<string, string> = {
  kodik: 'Kodik',
  cvh: 'CVH (AnimeGo)',
  aniboom: 'AniBoom',
};

/** translation_id — часть первичного ключа, поэтому обязан быть непустым и стабильным.
 *  Та же нормализация, что в scripts/import-provider-cache-to-db.mjs. */
export function translationIdOf(source: EpisodeSource): string {
  const raw = String(source.translationId ?? '').trim();
  if (raw) return raw.slice(0, 64);
  const numeric = String(source.id ?? '')
    .split(':')
    .filter((part) => /^\d+$/.test(part));
  if (numeric.length) return numeric[0].slice(0, 64);
  const slug = String(source.label ?? 'source')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return slug || 'source';
}

/** Ссылка, которую реально можно отдать плееру (embed или первый файл). */
export function sourceUrlOf(source: EpisodeSource): string | null {
  return normalizeProviderUrl(source.embedUrl) ??
    normalizeProviderUrl(source.files?.[0]?.url);
}

/**
 * Загрузка всего кэша из БД в память (один раз на процесс).
 *
 * Paginated через `Range`-заголовки: PostgREST по умолчанию отдаёт 1000 строк, а при
 * 300k+ per-episode ссылок это сотни запросов — поэтому идём страницами по 1000 с
 * явным `order` (иначе порядок между страницами не гарантирован и строки теряются).
 *
 * @param slugById карта AniList id → slug (из каталога); без неё ключи не собрать.
 */
export async function dbLoadCache(
  slugById: Map<number, string>,
  options: { maxRows?: number; timeoutMs?: number; budgetMs?: number } = {},
): Promise<DbCacheEntry[]> {
  if (!dbCacheConfigured()) return [];
  const maxRows = options.maxRows ?? 2_000_000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  /* Дедлайн на ВСЮ загрузку, а не на страницу. Инцидент 2026-11-17: 346k строк =
     346 последовательных запросов, у каждого свой таймаут 60 с; на холодном
     serverless-инстансе это минуты и полный отказ в обслуживании. */
  const deadlineAt = Date.now() + (options.budgetMs ?? 60_000);

  const [urlRows, sourceRows] = await Promise.all([
    fetchPaged<UrlRow>(
      'episode_source_urls?status=eq.ok&select=anime_id,provider,translation_id,episode,kind,embed_url,checked_at',
      { maxRows, timeoutMs, deadlineAt, order: 'anime_id.asc,episode.asc' },
    ),
    fetchPaged<SourceRow>(
      'episode_sources?status=eq.ok&select=anime_id,provider,translation_id,translation_title,translation_type,episodes_count',
      { maxRows: 200_000, timeoutMs, deadlineAt, order: 'anime_id.asc' },
    ),
  ]);

  const meta = new Map<string, SourceRow>();
  for (const row of sourceRows) {
    meta.set(`${row.anime_id}|${row.provider}|${row.translation_id}`, row);
  }

  /* Собираем по ключу `ep:<slug>:<ep>`: одна запись = все озвучки этой серии. */
  const byKey = new Map<string, { at: number; sources: EpisodeSource[] }>();
  for (const row of urlRows) {
    const slug = slugById.get(Number(row.anime_id));
    const embedUrl = normalizeProviderUrl(row.embed_url);
    if (!slug || !embedUrl) continue;
    const episode = Number(row.episode);
    if (!Number.isInteger(episode) || episode < 1) continue;
    const key = `ep:${slug}:${episode}`;
    const header = meta.get(`${row.anime_id}|${row.provider}|${row.translation_id}`);
    const source: EpisodeSource = {
      id: `${row.provider}:${row.translation_id}:${episode}`,
      label: header?.translation_title?.trim() || PROVIDER_NAMES[row.provider] || row.provider,
      providerId: row.provider,
      providerName: PROVIDER_NAMES[row.provider] ?? row.provider,
      kind: row.kind === 'file' ? 'file' : 'embed',
      embedUrl,
      translationId: row.translation_id,
      ...(Number.isInteger(Number(header?.episodes_count)) && Number(header?.episodes_count) > 0
        ? { episodesCount: Number(header?.episodes_count) }
        : {}),
      voice: header?.translation_type === 'sub' ? 'subtitles' : 'voice',
    };
    const entry = byKey.get(key);
    if (entry) {
      entry.sources.push(source);
      if (row.checked_at) entry.at = Math.max(entry.at, Date.parse(row.checked_at) || 0);
    } else {
      byKey.set(key, { at: Date.parse(row.checked_at ?? '') || Date.now(), sources: [source] });
    }
  }

  const out: DbCacheEntry[] = [];
  for (const [key, entry] of byKey) {
    const sourcesUsed = [...new Set(entry.sources.map((s) => s.providerId))].sort();
    out.push({
      key,
      at: entry.at,
      sources: { sources: entry.sources, sourcesUsed, fromCache: true, cachedAt: entry.at },
    });
  }
  return out;
}

/** Сколько страниц тянем одновременно. Последовательные 346 запросов на холодном
 *  старте — это минуты; четыре параллельных — секунды при том же объёме. */
const PAGE_CONCURRENCY = 4;

async function fetchPage<T>(
  path: string,
  offset: number,
  limit: number,
  options: { timeoutMs: number; order: string },
): Promise<T[] | null> {
  const end = offset + limit - 1;
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}&order=${options.order}`, {
      headers: headers({ Range: `${offset}-${end}`, 'Range-Unit': 'items' }),
      signal: AbortSignal.timeout(options.timeoutMs),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    return Array.isArray(page) ? page : null;
  } catch (e) {
    /* Частичная загрузка лучше падения процесса: работаем на том, что успели.
       Вызывающий код (cache.ts) видит неполный кэш и просто чаще идёт в провайдеры. */
    console.warn('[providers] cache-db: страница не загрузилась', path.split('?')[0], String(e));
    return null;
  }
}

async function fetchPaged<T>(
  path: string,
  options: { maxRows: number; timeoutMs: number; deadlineAt: number; order: string },
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (offset < options.maxRows) {
    if (Date.now() >= options.deadlineAt) {
      console.warn(
        '[providers] cache-db: бюджет загрузки исчерпан, работаем на частичном кэше',
        path.split('?')[0],
        `${rows.length} строк`,
      );
      break;
    }

    const offsets: number[] = [];
    for (let i = 0; i < PAGE_CONCURRENCY; i++) {
      const next = offset + i * PAGE_SIZE;
      if (next >= options.maxRows) break;
      offsets.push(next);
    }

    /* Порядок результата важен для дедупликации по ключу: страницы складываем
       в том же порядке, в котором запрашивали. */
    const pages = await Promise.all(
      offsets.map((start) => fetchPage<T>(path, start, Math.min(PAGE_SIZE, options.maxRows - start), options)),
    );

    let stop = false;
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page || !page.length) {
        stop = true;
        break;
      }
      rows.push(...page);
      const requested = Math.min(PAGE_SIZE, options.maxRows - offsets[i]);
      if (page.length < requested) {
        stop = true;
        break;
      }
    }
    if (stop) break;
    offset += offsets.length * PAGE_SIZE;
  }

  return rows;
}

/** UPSERT одной серии: строки `episode_source_urls` + шапки `episode_sources`. */
export async function dbUpsertEpisode(
  animeId: number,
  episode: number,
  sources: EpisodeSource[],
): Promise<{ urls: number; headers: number }> {
  if (!dbCacheConfigured()) return { urls: 0, headers: 0 };
  const now = new Date().toISOString();

  const urlRows = [];
  const headerRows = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    const url = sourceUrlOf(source);
    if (!url) continue;
    const translationId = translationIdOf(source);
    const kind = source.kind === 'file' ? 'file' : 'embed';
    urlRows.push({
      anime_id: animeId,
      provider: source.providerId,
      translation_id: translationId,
      episode,
      kind,
      embed_url: url,
      checked_at: now,
      status: 'ok',
    });
    /* Шапка нужна, чтобы `titleHasSources()` и `dbEpisodeSources()` видели озвучку.
       episodes_count намеренно НЕ передаём: merge-duplicates перезаписывает только
       присланные колонки, иначе UPSERT одной серии затирал бы счётчик тайтла. */
    headerRows.set(`${source.providerId}|${translationId}`, {
      anime_id: animeId,
      provider: source.providerId,
      translation_id: translationId,
      translation_title: String(source.label ?? '').slice(0, 200) || null,
      translation_type: source.voice === 'subtitles' ? 'sub' : 'voice',
      kind,
      embed_url: url,
      checked_at: now,
      status: 'ok',
    });
  }

  await upsert('episode_sources', 'anime_id,provider,translation_id', [...headerRows.values()]);
  await upsert('episode_source_urls', 'anime_id,provider,translation_id,episode', urlRows);
  return { urls: urlRows.length, headers: headerRows.size };
}

async function upsert(table: string, conflict: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: headers({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(UPSERT_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`supabase ${table} upsert: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

/** Сколько строк в таблицах — для /api/health и диагностики. */
export async function dbCacheCounts(): Promise<{ headers: number | null; urls: number | null }> {
  if (!dbCacheConfigured()) return { headers: null, urls: null };
  const count = async (table: string) => {
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=anime_id&limit=1`, {
        headers: headers({ Prefer: 'count=exact', Range: '0-0' }),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const total = res.headers.get('content-range')?.split('/')[1];
      return Number.isFinite(Number(total)) ? Number(total) : null;
    } catch {
      return null;
    }
  };
  const [headersCount, urlsCount] = await Promise.all([count('episode_sources'), count('episode_source_urls')]);
  return { headers: headersCount, urls: urlsCount };
}
