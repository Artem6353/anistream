import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Атомарность и очередь записи файлового кэша провайдеров.
 *
 * При HYDRATE_CONCURRENCY>1 десяток резолвов пишет кэш одновременно. Раньше каждый
 * flush делал `fs.writeFile` прямо в цель: два параллельных flush'а (или второй
 * процесс + первый) могли оставить обрезанный JSON на 98 МБ и потерять ключи.
 * Теперь: сериализация в цепочке `writing`, запись в tmp + rename и слияние с
 * диском, если файл менял другой процесс.
 */

const SOURCE = (id: string) => ({
  id,
  label: 'voice',
  providerId: 'kodik',
  providerName: 'Kodik',
  kind: 'embed' as const,
  embedUrl: 'https://example.test/e',
  translationId: id,
});

let dir = '';
let file = '';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'anistream-cache-'));
  file = path.join(dir, 'cache.json');
  vi.stubEnv('PROVIDER_CACHE_FILE_BACKEND', '1');
  vi.stubEnv('KODIK_CACHE_FILE', file);
  vi.stubEnv('PROVIDER_CACHE_WRITE_DEBOUNCE_MS', '0');
  vi.stubEnv('PROVIDER_CACHE_ENABLED', '1');
  vi.stubEnv('PROVIDER_CACHE_WRITE', '1');
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadCache() {
  return import('@/lib/providers/cache');
}

describe('файловый кэш под конкурентной записью', () => {
  it('50 параллельных cacheSet → валидный JSON и все ключи на месте', async () => {
    const { cacheSet, cacheFlush } = await loadCache();
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => cacheSet(`ep:slug:${i + 1}`, { sources: [SOURCE(String(i))] } as never)),
    );
    await cacheFlush();
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(parsed)).toHaveLength(50);
    expect(parsed['ep:slug:1']).toBeTruthy();
    expect(parsed['ep:slug:50']).toBeTruthy();
  });

  it('не оставляет .tmp-файлов после flush', async () => {
    const { cacheSet, cacheFlush } = await loadCache();
    await cacheSet('ep:a:1', { sources: [SOURCE('1')] } as never);
    await cacheFlush();
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('сливает ключи, добавленные другим процессом между load и flush', async () => {
    const { cacheSet, cacheFlush } = await loadCache();
    // Первая запись создаёт файл и фиксирует отпечаток.
    await cacheSet('ep:ours:1', { sources: [SOURCE('1')] } as never);
    await cacheFlush();
    // «Второй процесс» дописал свой ключ.
    const onDisk = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...onDisk, 'ep:foreign:7': { at: Date.now(), sources: { sources: [] } } }));
    // Наш процесс пишет ещё одну серию — чужая запись не должна потеряться.
    await cacheSet('ep:ours:2', { sources: [SOURCE('2')] } as never);
    await cacheFlush();
    const merged = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(merged).sort()).toEqual(['ep:foreign:7', 'ep:ours:1', 'ep:ours:2']);
  });

  it('битый файл на диске не мешает записи (свой кэш в памяти цел)', async () => {
    const { cacheSet, cacheFlush } = await loadCache();
    await cacheSet('ep:a:1', { sources: [SOURCE('1')] } as never);
    await cacheFlush();
    writeFileSync(file, '{"truncated":');
    await cacheSet('ep:a:2', { sources: [SOURCE('2')] } as never);
    await cacheFlush();
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(parsed['ep:a:1']).toBeTruthy();
    expect(parsed['ep:a:2']).toBeTruthy();
  });
});
