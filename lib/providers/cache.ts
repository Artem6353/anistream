import type { EpisodeSources, ProviderContext } from './types';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { kvEnabled, kvGet, kvSet } from './cache-kv';

/**
 * Cache-first хранилище EpisodeSources (self-growing, как в оригинале):
 * hit → отдаём сразу; miss → bridge/провайдеры → сохраняем.
 * Файл: .cache/providers-resolve-cache.json (KODIK_CACHE_FILE).
 *
 * Аудит 30.09 (P0-5): KV-ветка (Upstash) раньше только ЧИТАЛА — kvSet не вызывался
 * нигде, т.е. при заданных UPSTASH_* кэш не работал вовсе (hit rate 0%) и
 * /api/availability всегда показывал demo. Теперь cacheSet пишет в KV, а
 * cacheEntriesForSlug ведёт в KV индекс эпизодов тайтла (epidx:<slug>).
 */

interface CacheShape {
  [key: string]: { at: number; ttlMs?: number; sources: EpisodeSources };
}

let memory: CacheShape | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(file: string): Promise<CacheShape> {
  if (memory) return memory;
  try {
    memory = JSON.parse(await fs.readFile(file, 'utf8')) as CacheShape;
  } catch {
    memory = {};
  }
  return memory;
}

/** Дебаунс-запись: коалесцируем частые miss'ы в один flush (PROVIDER_CACHE_WRITE_DEBOUNCE_MS). */
function persist(file: string) {
  const debounce = Number(process.env.PROVIDER_CACHE_WRITE_DEBOUNCE_MS ?? 750);
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writing = writing
      .then(async () => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(memory ?? {}));
      })
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
  if (kvEnabled()) {
    const idxRaw = await kvGet(kvIdxKey(slug));
    const eps = idxRaw ? ((JSON.parse(idxRaw) as number[]).filter((n) => Number.isFinite(n))) : [];
    const rows = await Promise.all(
      eps.map(async (ep) => {
        const raw = await kvGet(kvEpKey(cacheKey(slug, ep)));
        if (!raw) return null;
        try {
          const entry = JSON.parse(raw) as { at: number; ttlMs?: number; sources: EpisodeSources };
          if (isCacheEntryExpired(entry, cfg.ttlMs)) return null;
          return { episode: ep, sources: entry.sources };
        } catch {
          return null;
        }
      }),
    );
    for (const r of rows) if (r) out.push(r);
    return out.sort((a, b) => a.episode - b.episode);
  }
  const store = await load(cfg.file);
  const prefix = `ep:${slug}:`;
  for (const [key, entry] of Object.entries(store)) {
    if (!key.startsWith(prefix)) continue;
    const ep = Number(key.slice(prefix.length));
    if (!Number.isInteger(ep) || ep < 1 || isCacheEntryExpired(entry, cfg.ttlMs)) continue;
    out.push({ episode: ep, sources: entry.sources });
  }
  return out.sort((a, b) => a.episode - b.episode);
}

export async function cacheGet(key: string): Promise<EpisodeSources | null> {
  const cfg = getProvidersConfig().cache;
  if (!cfg.enabled) return null;
  if (kvEnabled()) {
    const raw = await kvGet(kvEpKey(key));
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as { at: number; ttlMs?: number; sources: EpisodeSources };
      if (isCacheEntryExpired(entry, cfg.ttlMs)) return null;
      return entry.sources;
    } catch {
      return null;
    }
  }
  const store = await load(cfg.file);
  const entry = store[key];
  if (!entry) return null;
  if (isCacheEntryExpired(entry, cfg.ttlMs)) return null;
  return entry.sources;
}

/** Пишем только реальные источники провайдеров (demo не кэшируем). */
export async function cacheSet(key: string, sources: EpisodeSources): Promise<void> {
  const cfg = getProvidersConfig().cache;
  if (!cfg.enabled || !cfg.write) return;
  if (!sources.sources.some((s) => s.providerId !== 'demo')) return;
  const entry = { at: Date.now(), ttlMs: cfg.ttlMs, sources: { ...sources, fromCache: false } };
  if (kvEnabled()) {
    /* Аудит 30.09 (P0-5): KV-запись + индекс эпизодов тайтла. */
    await kvSet(kvEpKey(key), JSON.stringify(entry), Math.round(cfg.ttlMs / 1000));
    const m = key.match(/^ep:(.+):(\d+)$/);
    if (m) await kvAddIndex(m[1], Number(m[2]));
    return;
  }
  const store = await load(cfg.file);
  store[key] = entry;
  persist(cfg.file);
}

export async function cacheStats(): Promise<{ entries: number; file: string }> {
  const cfg = getProvidersConfig().cache;
  const store = await load(cfg.file);
  return { entries: Object.keys(store).length, file: cfg.file };
}

export type { ProviderContext };
