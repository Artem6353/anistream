import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Кэш резолвов в Supabase (feat/db-cache).
 *
 * Что проверяем:
 *  1. `cacheSet` делает UPSERT в episode_sources + episode_source_urls (а не пишет файл);
 *  2. «перезапуск процесса» читает кэш из БД в память и отдаёт серию без похода в провайдеры;
 *  3. TTL соблюдается так же, как у файлового кэша;
 *  4. JSON-файл не создаётся вообще (он больше не в git).
 *
 * Сеть не используется: fetch подменён эмулятором PostgREST.
 */

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { episode_sources: [], episode_source_urls: [] };
let posts: { table: string; conflict: string; rows: Row[] }[] = [];

const KEY_OF: Record<string, (r: Row) => string> = {
  episode_sources: (r) => `${r.anime_id}|${r.provider}|${r.translation_id}`,
  episode_source_urls: (r) => `${r.anime_id}|${r.provider}|${r.translation_id}|${r.episode}`,
};

function parseRange(header: string | null): [number, number] {
  if (!header) return [0, 999];
  const [start, end] = header.split('-').map(Number);
  return [start, end];
}

function stubPostgrest() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const table = url.pathname.replace('/rest/v1/', '');
      if (!db[table]) return new Response('{"message":"unknown table"}', { status: 404 });

      if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
        const rows = JSON.parse(String(init?.body ?? '[]')) as Row[];
        const conflict = url.searchParams.get('on_conflict') ?? '';
        posts.push({ table, conflict, rows });
        const keyOf = KEY_OF[table];
        for (const row of rows) {
          const existing = db[table].find((r) => keyOf(r) === keyOf(row));
          if (existing) Object.assign(existing, row);
          else db[table].push({ ...row });
        }
        return new Response(null, { status: 201 });
      }

      const status = url.searchParams.get('status');
      let rows = db[table].slice();
      if (status === 'eq.ok') rows = rows.filter((r) => r.status === 'ok');
      const [start, end] = parseRange(new Headers(init?.headers as Record<string, string>).get('range'));
      rows = rows.slice(start, end + 1);
      return Response.json(rows);
    }),
  );
}

const SOURCE = (tid: string, label: string) => ({
  id: `kodik:${tid}:1`,
  label,
  providerId: 'kodik',
  providerName: 'Kodik',
  kind: 'embed' as const,
  embedUrl: `https://kodik.example/seria/${tid}/720p`,
  translationId: tid,
  voice: 'voice' as const,
});

let cacheFile = '';

beforeEach(() => {
  db.episode_sources.length = 0;
  db.episode_source_urls.length = 0;
  posts = [];
  cacheFile = path.join(mkdtempSync(path.join(tmpdir(), 'anistream-db-cache-')), 'cache.json');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service-test-key');
  vi.stubEnv('PROVIDER_CACHE_BACKEND', 'db');
  vi.stubEnv('KODIK_CACHE_FILE', cacheFile);
  vi.stubEnv('PROVIDER_CACHE_ENABLED', '1');
  vi.stubEnv('PROVIDER_CACHE_WRITE', '1');
  stubPostgrest();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadCache() {
  return import('@/lib/providers/cache');
}

describe('кэш резолвов в Supabase', () => {
  it('cacheSet делает UPSERT в episode_source_urls и шапку в episode_sources', async () => {
    const { cacheSet } = await loadCache();
    await cacheSet('ep:one-piece:5', { sources: [SOURCE('610', 'AniLibria')] } as never);

    const urlsUpsert = posts.find((p) => p.table === 'episode_source_urls');
    const headersUpsert = posts.find((p) => p.table === 'episode_sources');
    expect(urlsUpsert?.conflict).toBe('anime_id,provider,translation_id,episode');
    expect(urlsUpsert?.rows[0]).toMatchObject({
      anime_id: 21, // AniList id «Ван-Пис» из каталога
      provider: 'kodik',
      translation_id: '610',
      episode: 5,
      status: 'ok',
      embed_url: 'https://kodik.example/seria/610/720p',
    });
    expect(headersUpsert?.rows[0]).toMatchObject({
      anime_id: 21,
      provider: 'kodik',
      translation_title: 'AniLibria',
      translation_type: 'voice',
      status: 'ok',
    });
    /* episodes_count не передаём: иначе UPSERT одной серии затирал бы счётчик тайтла. */
    expect(headersUpsert?.rows[0]).not.toHaveProperty('episodes_count');
  });

  it('после «перезапуска» серия читается из БД в память без файла на диске', async () => {
    const { cacheSet } = await loadCache();
    await cacheSet('ep:one-piece:5', { sources: [SOURCE('610', 'AniLibria')] } as never);

    vi.resetModules(); // новый процесс: память пуста, остаётся только БД
    const { cacheGet } = await loadCache();
    const hit = await cacheGet('ep:one-piece:5');

    expect(hit?.sources).toHaveLength(1);
    expect(hit?.sources[0]).toMatchObject({
      providerId: 'kodik',
      translationId: '610',
      label: 'AniLibria',
      embedUrl: 'https://kodik.example/seria/610/720p',
    });
    expect(existsSync(cacheFile)).toBe(false);
  });

  it('несколько озвучек одной серии собираются в одну запись', async () => {
    const { cacheSet } = await loadCache();
    await cacheSet('ep:one-piece:7', { sources: [SOURCE('610', 'AniLibria'), SOURCE('2', 'Субтитры')] } as never);

    vi.resetModules();
    const { cacheGet } = await loadCache();
    const hit = await cacheGet('ep:one-piece:7');
    expect(hit?.sources.map((s) => s.label).sort()).toEqual(['AniLibria', 'Субтитры']);
    expect(hit?.sourcesUsed).toEqual(['kodik']);
  });

  it('истёкшая запись не отдаётся (TTL как у файлового кэша)', async () => {
    db.episode_source_urls.push({
      anime_id: 21,
      provider: 'kodik',
      translation_id: '610',
      episode: 9,
      kind: 'embed',
      embed_url: 'https://kodik.example/seria/610/720p',
      checked_at: '2020-01-01T00:00:00.000Z',
      status: 'ok',
    });
    db.episode_sources.push({
      anime_id: 21,
      provider: 'kodik',
      translation_id: '610',
      translation_title: 'AniLibria',
      translation_type: 'voice',
      status: 'ok',
    });
    vi.stubEnv('KODIK_CACHE_TTL_MS', String(60_000));
    vi.resetModules();
    const { cacheGet } = await loadCache();
    expect(await cacheGet('ep:one-piece:9')).toBeNull();
  });

  it('demo и синтезированные источники не пишутся в БД', async () => {
    const { cacheSet } = await loadCache();
    await cacheSet('ep:one-piece:11', {
      sources: [
        { ...SOURCE('0', 'Demo'), providerId: 'demo' },
        { ...SOURCE('1', 'Синтез'), synthesized: true, embedUrl: 'https://kodik.example/seria/1/720p' },
      ],
    } as never);
    expect(posts).toHaveLength(0);
  });

  it('файловый бэкенд по-прежнему работает при PROVIDER_CACHE_BACKEND=file', async () => {
    vi.stubEnv('PROVIDER_CACHE_BACKEND', 'file');
    vi.stubEnv('PROVIDER_CACHE_FILE_BACKEND', '1');
    vi.stubEnv('PROVIDER_CACHE_WRITE_DEBOUNCE_MS', '0');
    vi.resetModules();
    const { cacheSet, cacheFlush } = await loadCache();
    await cacheSet('ep:one-piece:3', { sources: [SOURCE('610', 'AniLibria')] } as never);
    await cacheFlush();
    expect(posts).toHaveLength(0);
    expect(existsSync(cacheFile)).toBe(true);
  });
});
