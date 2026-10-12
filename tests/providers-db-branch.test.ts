import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Задача 4 (2026-10-13): тест ветки «источники из БД» маршрута
 * GET /api/providers/[slug]/[episode] с мок-fetch.
 *
 * Порядок по ТЗ 1.6.2: Redis hot-cache → Supabase (episode_sources +
 * episode_source_urls) → живые провайдеры → честное «источников нет».
 * Здесь проверяем именно вторую ступень: Supabase отвечает строками со
 * status='ok', маршрут отдаёт их плееру без обращения к bridge/синтезу.
 *
 * Env выставляется ДО динамического импорта маршрута: lib/episode-sources и
 * lib/providers/cache-kv читают Supabase/Upstash-переменные в module-scope.
 */

const SUPA_URL = 'https://db-branch-test.supabase.co';

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-test';
/* Файловый бэкенд кэша и записи отключены: тест не должен трогать .cache/. */
process.env.PROVIDER_CACHE_FILE_BACKEND = '0';
process.env.PROVIDER_CACHE_WRITE = '0';
/* Демо-источник выключен: считаем только реальные строки БД. */
process.env.DEMO_PROVIDER_ENABLED = '0';
/* Синтез/подбор выключен (прод-профиль, ТЗ 1.6.4): пустая БД → честный пустой
   список, а не десятки непроверенных кнопок. */
process.env.PROVIDER_UNVERIFIED_FALLBACK = '0';
/* Upstash не настроен → горячий кэш пропускается, остаётся ветка БД. */
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const SOURCE_ROWS = [
  {
    anime_id: 11061,
    provider: 'kodik',
    translation_id: '610',
    translation_title: 'Kodik',
    translation_type: 'voice',
    kind: 'embed',
    embed_url: 'https://kodikplayer.com/serial/556839/1',
    episodes_count: 148,
    checked_at: '2026-10-11T19:44:46.913+00:00',
    status: 'ok',
  },
  {
    anime_id: 11061,
    provider: 'kodik',
    translation_id: '609',
    translation_title: 'Kodik - Попугайская озвучка',
    translation_type: 'voice',
    kind: 'embed',
    embed_url: 'https://kodikplayer.com/serial/556840/1',
    episodes_count: 148,
    checked_at: '2026-10-11T19:44:46.913+00:00',
    status: 'ok',
  },
];

/* Per-episode ссылка важнее общего embed: у Kodik hash уникален для серии. */
const URL_ROWS = [
  {
    provider: 'kodik',
    translation_id: '610',
    episode: 1,
    kind: 'embed',
    embed_url: 'https://kodikplayer.com/serial/556839/1abc',
    status: 'ok',
  },
];

const defaultFetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);
  if (url.includes('/rest/v1/episode_sources?')) return Response.json(SOURCE_ROWS);
  if (url.includes('/rest/v1/episode_source_urls?')) return Response.json(URL_ROWS);
  /* Прочие таблицы (episode_progress и т.п.) — пусто: тайтл finished, граница из каталога. */
  return Response.json([]);
};

const fetchMock = vi.fn(defaultFetchImpl);

type RouteModule = typeof import('../app/api/providers/[slug]/[episode]/route');
let GET: RouteModule['GET'];

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  GET = (await import('../app/api/providers/[slug]/[episode]/route')).GET;
});

function req(url = 'https://aninova.test/api/providers/hunter-hunter-2011/1') {
  return new Request(url);
}

const params = { params: Promise.resolve({ slug: 'hunter-hunter-2011', episode: '1' }) };

const emptyImpl = async (input: RequestInfo | URL): Promise<Response> => {
  void input;
  return Response.json([]);
};

const brokenImpl = async (input: RequestInfo | URL): Promise<Response> => {
  void input;
  return new Response('boom', { status: 500 });
};

describe('ветка «источники из БД» (мок-fetch)', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(defaultFetchImpl);
  });

  it('отдаёт строки episode_sources/episode_source_urls как JSON 200', async () => {
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as {
      sources: { providerId: string; embedUrl?: string; translationId?: string }[];
      fromCache?: boolean;
    };
    const kodik = body.sources.filter((s) => s.providerId === 'kodik');
    expect(kodik).toHaveLength(2);
    /* Per-episode embed из episode_source_urls побеждает общий embed тайтла. */
    expect(kodik.find((s) => s.translationId === '610')?.embedUrl).toBe(
      'https://kodikplayer.com/serial/556839/1abc',
    );
    expect(kodik.find((s) => s.translationId === '609')?.embedUrl).toBe(
      'https://kodikplayer.com/serial/556840/1',
    );
    expect(body.fromCache).toBe(true);
  });

  it('ходит в PostgREST с anime_id и номером серии', () => {
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/rest/v1/episode_sources?anime_id=eq.11061'))).toBe(true);
    expect(
      urls.some((u) => u.includes('/rest/v1/episode_source_urls?anime_id=eq.11061&episode=eq.1')),
    ).toBe(true);
  });

  it('пустая БД → честный пустой список, а не ошибка и не синтез', async () => {
    fetchMock.mockImplementation(emptyImpl);
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sources: unknown[] };
    expect(body.sources).toEqual([]);
  });

  it('Supabase отвечает 500 → маршрут деградирует в 200 с пустым списком, не бросает', async () => {
    fetchMock.mockImplementation(brokenImpl);
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sources: unknown[] };
    expect(Array.isArray(body.sources)).toBe(true);
  });
});
