import type { EpisodeSource, EpisodeSources, ProviderContext } from './types';
import { normalizeProviderUrl } from './url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { kvDel, kvEnabled, kvGet, kvMget, kvSet } from './cache-kv';
import { dbCacheConfigured, dbCacheCounts, dbLoadCache, dbUpsertEpisode } from './cache-db';
import { decodeEpisodeCacheValue, encodeEpisodeCacheValue } from './cache-codec.mjs';

/**
 * Cache-first хранилище EpisodeSources (self-growing, как в оригинале):
 * hit → отдаём сразу; miss → bridge/провайдеры → сохраняем.
 * Файл: .cache/providers-resolve-cache.json (KODIK_CACHE_FILE).
 *
 * Аудит 30.09 (P0-5): KV-ветка (Upstash) раньше только ЧИТАЛА — kvSet не вызывался
 * нигде, т.е. при заданных UPSTASH_* кэш не работал вовсе (hit rate 0%) и
 * /api/availability всегда показывал demo. Теперь cacheSet пишет в KV, а
 * cacheEntriesForSlug ведёт в KV индекс эпизодов тайтла (epidx:<slug>).
 *
 * feat/db-cache: бэкендов теперь три (`cache.backend`):
 *   db   — Supabase episode_sources/episode_source_urls (дефолт при service-ключе).
 *          JSON-файл убран из git: 93 МБ при лимите GitHub 100 МБ. При старте
 *          процесса кэш ОДИН раз грузится в память (dbLoadCache), дальше чтения
 *          бесплатны, а запись идёт UPSERT'ом — без перезаписи гигантского файла.
 *   kv   — Upstash (горячий TTL-кэш).
 *   file — JSON-файл, только явно (self-hosted без БД).
 */

interface CacheShape {
  [key: string]: { at: number; ttlMs?: number; sources: EpisodeSources };
}

let memory: CacheShape | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();
/* Отпечаток файла на момент последнего load/flush: нужен, чтобы заметить,
   что файл переписал ДРУГОЙ процесс (второй hydrate/скрипт) и не затереть его ключи. */
let loadedSignature = '';

let fileDisabledWarned = false;

/** Файловый бэкенд доступен? В проде — нет (задача 4 аудита). */
function fileBackendUsable(): boolean {
  if (getProvidersConfig().cache.fileBackend) return true;
  if (!fileDisabledWarned) {
    fileDisabledWarned = true;
    console.warn(
      '[providers] файловый кэш отключён в production: источник правды — Supabase episode_sources, ' +
        'горячий кэш — Upstash Redis. Файл .cache/providers-resolve-cache.json (97,6 МБ) в рантайме не читается. ' +
        'Перенос: node scripts/import-provider-cache-to-db.mjs; для self-hosted можно вернуть ' +
        'PROVIDER_CACHE_FILE_BACKEND=1.',
    );
  }
  return false;
}

async function readSignature(file: string): Promise<string> {
  try {
    const st = await fs.stat(file);
    return `${Math.round(st.mtimeMs)}:${st.size}`;
  } catch {
    return 'absent';
  }
}

/** Текущий бэкенд из конфига (читаем каждый раз: env может меняться в тестах).
 *  Фоллбэк на kvEnabled() — для частичных конфигов (моки/старые вызовы без `backend`). */
function backend(): 'db' | 'kv' | 'file' {
  const value = getProvidersConfig().cache.backend;
  if (value === 'db' || value === 'kv' || value === 'file') return value;
  return kvEnabled() ? 'kv' : 'file';
}

async function load(file: string): Promise<CacheShape> {
  if (memory) return memory;
  /* DB cache hydration is an explicit background preload, never a request-time miss.
     The registry reads the requested episode directly from Supabase after this hot-cache
     lookup; waiting for tens of thousands of rows here caused 20s cold-player timeouts. */
  if (backend() === 'db' && dbCacheConfigured()) return {};
  if (!fileBackendUsable()) {
    memory = {};
    return memory;
  }
  try {
    memory = JSON.parse(await fs.readFile(file, 'utf8')) as CacheShape;
    loadedSignature = await readSignature(file);
  } catch {
    memory = {};
    loadedSignature = await readSignature(file);
  }
  return memory;
}

/** Загрузка кэша из Supabase в память (один раз на процесс, с дедупликацией вызовов). */
let loadingFromDb: Promise<CacheShape> | null = null;

async function loadFromDb(): Promise<CacheShape> {
  if (memory) return memory;
  if (loadingFromDb) return loadingFromDb;
  const cfg = getProvidersConfig().cache;
  loadingFromDb = (async () => {
    /* Динамический импорт: file/kv-бэкенды не тянут каталог (20,8 МБ titles.json). */
    const { loadTitles } = await import('@/lib/catalog');
    const slugById = new Map<number, string>();
    for (const title of loadTitles(true)) slugById.set(title.anilistId, title.slug);
    /* Бюджет по умолчанию скромный: на serverless полный кэш (346k строк) не
       окупается — холодный старт важнее полноты, а промахи добираются провайдерами.
       Прод 17.11: без ограничения инстанс вообще не начинал обслуживать запросы. */
    const maxRows = Number(process.env.PROVIDER_CACHE_PRELOAD_MAX_ROWS ?? 60_000);
    const budgetMs = Number(process.env.PROVIDER_CACHE_PRELOAD_BUDGET_MS ?? 20_000);
    const entries = await dbLoadCache(slugById, {
      maxRows: Number.isFinite(maxRows) && maxRows > 0 ? maxRows : 60_000,
      budgetMs: Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : 20_000,
    });
    const store: CacheShape = {};
    for (const entry of entries) {
      store[entry.key] = { at: entry.at, ttlMs: cfg.ttlMs, sources: entry.sources };
    }
    memory = store;
    return store;
  })().finally(() => {
    loadingFromDb = null;
  });
  return loadingFromDb;
}

/** Прогрев кэша на старте процесса (instrumentation.ts) — чтобы первый резолв
 *  не ждал загрузки из Supabase. Никогда не бросает: сбой загрузки = пустой кэш.
 *  Файловый бэкенд НЕ прогреваем: он и так грузится лениво, а файл на 93 МБ
 *  в dev-старте только замедлит запуск. */
export async function preloadProviderCache(): Promise<{ entries: number; backend: string }> {
  const cfg = getProvidersConfig().cache;
  if (!cfg.enabled) return { entries: 0, backend: 'disabled' };
  if (backend() === 'file') return { entries: 0, backend: 'file' };
  try {
    const store = backend() === 'db' && dbCacheConfigured()
      ? await loadFromDb()
      : await load(cfg.file);
    return { entries: Object.keys(store).length, backend: backend() };
  } catch {
    return { entries: 0, backend: backend() };
  }
}

/** Одна запись за раз (очередь `writing`) + атомарная подмена файла.
 *
 *  Зачем mutex: при HYDRATE_CONCURRENCY>1 в один процесс одновременно приходит
 *  десяток резолвов. `memory` меняется синхронно (без гонок), но flush — асинхронный:
 *  два параллельных `fs.writeFile` по одному пути могут дать обрезанный JSON на 98 МБ
 *  (читатель в этот момент видит половину файла). Поэтому:
 *   1) все flush'и сериализованы цепочкой `writing`;
 *   2) файл пишется в `<file>.<pid>.tmp` и подменяется через rename (атомарно);
 *   3) перед записью сверяемся с диском — если файл менял ДРУГОЙ процесс, сливаем его
 *      ключи (наши свежие выигрывают), чтобы параллельные гидрации не теряли данные. */
async function writeFileAtomic(file: string): Promise<void> {
  const store = memory ?? {};
  await fs.mkdir(path.dirname(file), { recursive: true });
  const signature = await readSignature(file);
  let merged: CacheShape = store;
  if (signature !== loadedSignature) {
    try {
      const disk = JSON.parse(await fs.readFile(file, 'utf8')) as CacheShape;
      if (disk && typeof disk === 'object' && !Array.isArray(disk)) {
        merged = { ...disk, ...store };
        memory = merged;
      }
    } catch {
      /* Чужой файл битый/недочитанный — пишем свой (он у нас в памяти целый). */
    }
  }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(merged));
  await fs.rename(tmp, file);
  loadedSignature = await readSignature(file);
}

/** Дебаунс-запись: коалесцируем частые miss'ы в один flush (PROVIDER_CACHE_WRITE_DEBOUNCE_MS). */
function persist(file: string) {
  if (!fileBackendUsable()) return;
  const debounce = Number(process.env.PROVIDER_CACHE_WRITE_DEBOUNCE_MS ?? 750);
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writing = writing
      .then(() => writeFileAtomic(file))
      .catch(() => {});
  }, debounce);
}

export const cacheKey = (slug: string, episode: number) => `ep:${slug}:${episode}`;

/** Проверяет срок действия записи одинаково для файлового и KV-кэша. */
export function isCacheEntryExpired(
  entry: { at: number; ttlMs?: number },
  defaultTtlMs: number,
): boolean {
  const ttlMs = entry.ttlMs ?? defaultTtlMs;
  return !Number.isFinite(entry.at) || !Number.isFinite(ttlMs) || Date.now() - entry.at > ttlMs;
}

/** A cached episode is "direct" only if a provider resolved that exact episode.
 * Legacy keys ending in :sN were generated by rewriting another episode's URL. */
export function isDirectProviderSource(source: EpisodeSource): boolean {
  return source.providerId !== 'demo' &&
    !source.guessed &&
    !source.synthesized &&
    !/:s\d+$/.test(source.id);
}

function directResult(result: EpisodeSources): EpisodeSources | null {
  const sources = result.sources
    .filter(isDirectProviderSource)
    .map((source) => {
      const embedUrl = normalizeProviderUrl(source.embedUrl);
      const files = (source.files ?? [])
        .map((file) => {
          const url = normalizeProviderUrl(file.url);
          return url ? { ...file, url } : null;
        })
        .filter((file): file is NonNullable<typeof file> => file !== null);
      if (!embedUrl && !files.length) return null;
      return {
        ...source,
        ...(embedUrl ? { embedUrl } : { embedUrl: undefined }),
        ...(source.files ? { files } : {}),
      };
    })
    .filter((source): source is EpisodeSource => source !== null);
  if (!sources.length) return null;
  return {
    ...result,
    sources,
    sourcesUsed: [...new Set(sources.map((source) => source.providerId))].sort(),
  };
}

/* KV-ключи: запись серии и индекс эпизодов тайтла. */
const kvEpKey = (key: string) => `ep:${key}`; // key уже 'ep:slug:N' → 'ep:ep:slug:N' (совместимость с прежними чтениями)
const kvIdxKey = (slug: string) => `epidx:${slug}`;

async function kvAddIndex(slug: string, episode: number) {
  try {
    const raw = await kvGet(kvIdxKey(slug));
    const list = raw ? ((JSON.parse(raw) as number[]).filter((n) => Number.isFinite(n))) : [];
    if (!list.includes(episode)) list.push(episode);
    list.sort((a, b) => a - b);
    await kvSet(kvIdxKey(slug), JSON.stringify(list.slice(-2000)), 30 * 86400);
  } catch {
    /* индекс — best-effort */
  }
}

/** Все кэшированные серии тайтла (для синтеза и индикации доступности). */
export async function cacheEntriesForSlug(slug: string): Promise<{ episode: number; sources: EpisodeSources }[]> {
  const cfg = getProvidersConfig().cache;
  if (!cfg.enabled) return [];
  const out: { episode: number; sources: EpisodeSources }[] = [];
  if (backend() === 'kv' && kvEnabled()) {
    const indexKey = kvIdxKey(slug);
    let idxRaw: string | null;
    try {
      idxRaw = await kvGet(indexKey);
    } catch {
      // Keep the index intact on network/Redis errors: null and unreachable must differ.
      return [];
    }

    let eps: number[] = [];
    if (idxRaw) {
      try {
        eps = (JSON.parse(idxRaw) as unknown[])
          .filter((n): n is number => Number.isSafeInteger(n) && Number(n) > 0);
      } catch {
        // A corrupt index cannot be used safely; delete only after a successful GET.
        await kvDel(indexKey);
        return [];
      }
    }

    // Batch episode reads: an individual GET per episode overloaded Redis for
    // long series (e.g. hundreds of episodes). Four workers keep the burst bounded.
    const episodes = [...new Set(eps)].sort((a, b) => a - b);
    const batchSize = 100;
    const batches: number[][] = [];
    for (let offset = 0; offset < episodes.length; offset += batchSize) {
      batches.push(episodes.slice(offset, offset + batchSize));
    }
    const valuesByEpisode = new Map<number, { raw: string | null; failed: boolean }>();
    let nextBatch = 0;
    await Promise.all(Array.from({ length: Math.min(4, batches.length) }, async () => {
      while (nextBatch < batches.length) {
        const batch = batches[nextBatch++];
        try {
          const values = await kvMget(batch.map((episode) => kvEpKey(cacheKey(slug, episode))));
          if (values.length !== batch.length) throw new Error('Upstash MGET returned an unexpected result length.');
          batch.forEach((episode, index) => valuesByEpisode.set(episode, {
            raw: values[index],
            failed: false,
          }));
        } catch {
          // A failed batch is not proof that its entries are stale; don't prune the index.
          for (const episode of batch) valuesByEpisode.set(episode, { raw: null, failed: true });
        }
      }
    }));

    const rows = episodes.map((episode) => {
      const stored = valuesByEpisode.get(episode);
      if (!stored || stored.failed) return { episode, sources: null, failed: true };
      if (!stored.raw) return { episode, sources: null, failed: false };
      try {
        const entry = decodeEpisodeCacheValue(stored.raw) as { at: number; ttlMs?: number; sources: EpisodeSources };
        if (isCacheEntryExpired(entry, cfg.ttlMs)) {
          return { episode, sources: null, failed: false };
        }
        return { episode, sources: directResult(entry.sources), failed: false };
      } catch {
        return { episode, sources: null, failed: true };
      }
    });

    const out = rows
      .filter((row): row is typeof row & { sources: EpisodeSources } => Boolean(row.sources))
      .map((row) => ({ episode: row.episode, sources: row.sources }))
      .sort((a, b) => a.episode - b.episode);

    // Indexes intentionally outlive cache records. Prune stale entries on reads,
    // but never prune when any episode read failed due to a transient Redis error.
    if (!rows.some((row) => row.failed)) {
      const activeEpisodes = out.map((row) => row.episode).slice(-2000);
      const normalizedIndexed = [...new Set(eps)].sort((a, b) => a - b).slice(-2000);
      if (JSON.stringify(activeEpisodes) !== JSON.stringify(normalizedIndexed)) {
        if (activeEpisodes.length) {
          await kvSet(indexKey, JSON.stringify(activeEpisodes), 30 * 86400);
        } else if (idxRaw) {
          await kvDel(indexKey);
        }
      }
    }
    return out;
  }
  const store = await load(cfg.file);
  const prefix = `ep:${slug}:`;
  for (const [key, entry] of Object.entries(store)) {
    if (!key.startsWith(prefix)) continue;
    const ep = Number(key.slice(prefix.length));
    if (!Number.isInteger(ep) || ep < 1 || isCacheEntryExpired(entry, cfg.ttlMs)) continue;
    const sources = directResult(entry.sources);
    if (sources) out.push({ episode: ep, sources });
  }
  return out.sort((a, b) => a.episode - b.episode);
}

export async function cacheGet(key: string): Promise<EpisodeSources | null> {
  const cfg = getProvidersConfig().cache;
  if (!cfg.enabled) return null;
  if (backend() === 'kv' && kvEnabled()) {
    let raw: string | null;
    try {
      raw = await kvGet(kvEpKey(key));
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const entry = decodeEpisodeCacheValue(raw) as { at: number; ttlMs?: number; sources: EpisodeSources };
      if (isCacheEntryExpired(entry, cfg.ttlMs)) return null;
      return directResult(entry.sources);
    } catch {
      return null;
    }
  }
  const store = await load(cfg.file);
  const entry = store[key];
  if (!entry) return null;
  if (isCacheEntryExpired(entry, cfg.ttlMs)) return null;
  return directResult(entry.sources);
}

/** Пишем только реальные источники провайдеров (demo не кэшируем). */
export async function cacheSet(key: string, sources: EpisodeSources): Promise<void> {
  const cfg = getProvidersConfig().cache;
  if (!cfg.enabled || !cfg.write) return;
  const direct = directResult(sources);
  if (!direct) return;
  const entry = {
    at: Date.now(),
    ttlMs: cfg.ttlMs,
    sources: { ...direct, fromCache: false },
  };
  if (backend() === 'db' && dbCacheConfigured()) {
    /* UPSERT в Supabase: одна строка на озвучку в episode_source_urls + шапка
       в episode_sources. Файл НЕ пишем (он больше не в git), а память обновляем
       сразу — следующий cacheGet уже видит серию без похода в БД. */
    const m = key.match(/^ep:(.+):(\d+)$/);
    if (!m) return;
    const animeId = await animeIdOfSlug(m[1]);
    if (!animeId) {
      console.warn('[providers] cache-db: нет anime_id для slug', m[1]);
      return;
    }
    await dbUpsertEpisode(animeId, Number(m[2]), direct.sources);
    // Do not trigger a bulk DB preload from a write path. Update memory only when
    // the background preload has already completed; Supabase remains the source of truth.
    if (memory) memory[key] = entry;
    return;
  }
  if (backend() === 'kv' && kvEnabled()) {
    /* Аудит 30.09 (P0-5): KV-запись + индекс эпизодов тайтла. */
    await kvSet(kvEpKey(key), encodeEpisodeCacheValue(entry), Math.round(cfg.ttlMs / 1000));
    const m = key.match(/^ep:(.+):(\d+)$/);
    if (m) await kvAddIndex(m[1], Number(m[2]));
    return;
  }
  const store = await load(cfg.file);
  store[key] = entry;
  persist(cfg.file);
}

/** slug → AniList id для UPSERT'а (каталог грузим лениво, один раз на процесс). */
let slugToAnimeId: Map<string, number> | null = null;

async function animeIdOfSlug(slug: string): Promise<number | null> {
  if (!slugToAnimeId) {
    const { loadTitles } = await import('@/lib/catalog');
    slugToAnimeId = new Map(loadTitles(true).map((t) => [t.slug, t.anilistId]));
  }
  return slugToAnimeId.get(slug) ?? null;
}

/** Дождаться записи. Для db-бэкенда писать нечего: каждый cacheSet уже UPSERT'нул. */
export async function cacheFlush(): Promise<void> {
  const cfg = getProvidersConfig().cache;
  if (backend() === 'db') {
    await Promise.resolve();
    return;
  }
  if (!cfg.enabled || !fileBackendUsable() || !memory) return;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  writing = writing.then(() => writeFileAtomic(cfg.file)).catch(() => {});
  await writing;
}

export async function cacheStats(): Promise<{ entries: number; file: string }> {
  const cfg = getProvidersConfig().cache;
  if (backend() === 'db') {
    // Health/stat requests must not cause a cold bulk preload either.
    const counts = await dbCacheCounts();
    return {
      entries: Object.keys(memory ?? {}).length,
      file: counts.urls === null ? 'supabase' : `supabase (urls=${counts.urls}, headers=${counts.headers ?? '?'})`,
    };
  }
  const store = await load(cfg.file);
  return { entries: Object.keys(store).length, file: cfg.file };
}

export type { ProviderContext };
