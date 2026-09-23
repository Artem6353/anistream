import type { EpisodeSources, ProviderContext } from './types';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { kvEnabled, kvGet, kvSet } from './cache-kv';

/**
 * Cache-first хранилище EpisodeSources (self-growing, как в оригинале):
 * hit → отдаём сразу; miss → bridge/провайдеры → сохраняем.
 * Файл: .cache/providers-resolve-cache.json (KODIK_CACHE_FILE).
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

/** Все кэшированные серии тайтла (для синтеза и индикации доступности). */
export async function cacheEntriesForSlug(slug: string): Promise<{ episode: number; sources: EpisodeSources }[]> {
  const cfg = getProvidersConfig().cache;
  if (!cfg.enabled) return [];
  const store = await load(cfg.file);
  const prefix = `ep:${slug}:`;
  const out: { episode: number; sources: EpisodeSources }[] = [];
  for (const [key, entry] of Object.entries(store)) {
    if (!key.startsWith(prefix)) continue;
    const ep = Number(key.slice(prefix.length));
    if (Number.isFinite(ep)) out.push({ episode: ep, sources: entry.sources });
  }
  return out.sort((a, b) => a.episode - b.episode);
}

export async function cacheGet(key: string): Promise<EpisodeSources | null> {
  const cfg = getProvidersConfig().cache;
  if (!cfg.enabled) return null;
  if (kvEnabled()) {
    const raw = await kvGet(`ep:${key}`);
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as { at: number; ttlMs?: number; sources: EpisodeSources };
      if (Date.now() - entry.at > (entry.ttlMs ?? cfg.ttlMs)) return null;
      return entry.sources;
    } catch {
      return null;
    }
  }
  const store = await load(cfg.file);
  const entry = store[key];
  if (!entry) return null;
  const ttl = entry.ttlMs ?? cfg.ttlMs;
  if (Date.now() - entry.at > ttl) return null;
  return entry.sources;
}

/** Пишем только реальные источники провайдеров (demo не кэшируем). */
export async function cacheSet(key: string, sources: EpisodeSources): Promise<void> {
  const cfg = getProvidersConfig().cache;
  if (!cfg.enabled || !cfg.write) return;
  if (!sources.sources.some((s) => s.providerId !== 'demo')) return;
  const store = await load(cfg.file);
  store[key] = { at: Date.now(), sources: { ...sources, fromCache: false } };
  persist(cfg.file);
}

export async function cacheStats(): Promise<{ entries: number; file: string }> {
  const cfg = getProvidersConfig().cache;
  const store = await load(cfg.file);
  return { entries: Object.keys(store).length, file: cfg.file };
}

export type { ProviderContext };
