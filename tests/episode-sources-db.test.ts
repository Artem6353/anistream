import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  episode_sources: [],
  episode_source_urls: [],
};

function installPostgrestMock() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.replace('/rest/v1/', '');
    let rows = (tables[table] ?? []).slice();

    const animeId = url.searchParams.get('anime_id');
    if (animeId?.startsWith('eq.')) rows = rows.filter((row) => String(row.anime_id) === animeId.slice(3));
    if (url.searchParams.get('status') === 'eq.ok') rows = rows.filter((row) => row.status === 'ok');
    const episode = url.searchParams.get('episode');
    if (episode?.startsWith('eq.')) rows = rows.filter((row) => String(row.episode) === episode.slice(3));

    const range = new Headers(init?.headers as HeadersInit).get('Range');
    if (range) {
      const [start, end] = range.split('-').map(Number);
      rows = rows.slice(start, end + 1);
    }
    return Response.json(rows);
  }));
}

async function loadModule() {
  vi.resetModules();
  return import('../lib/episode-sources');
}

beforeEach(() => {
  tables.episode_sources.length = 0;
  tables.episode_source_urls.length = 0;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-service-key');
  installPostgrestMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Supabase episode-source resolution', () => {
  it('uses the exact Kodik URL for the requested episode, not the material-level base URL', async () => {
    tables.episode_sources.push({
      anime_id: 457, provider: 'kodik', translation_id: '1045', translation_title: 'AniLibria',
      translation_type: 'voice', kind: 'embed', embed_url: 'https://kodikplayer.com/serial/wrong-base',
      status: 'ok',
    });
    tables.episode_source_urls.push({
      anime_id: 457, provider: 'kodik', translation_id: '1045', episode: 5,
      kind: 'embed', embed_url: 'https://kodikplayer.com/seria/exact-episode-5', status: 'ok',
    });

    const { dbEpisodeSources } = await loadModule();
    const result = await dbEpisodeSources(457, 5);

    expect(result?.sources).toHaveLength(1);
    expect(result?.sources[0].embedUrl).toBe('https://kodikplayer.com/seria/exact-episode-5');
    expect(result?.sources[0].synthesized).toBeUndefined();
  });

  it('does not expose a Kodik base URL as though it were a link to another episode', async () => {
    tables.episode_sources.push({
      anime_id: 457, provider: 'kodik', translation_id: '1045', translation_title: 'AniLibria',
      translation_type: 'voice', kind: 'embed', embed_url: 'https://kodikplayer.com/seria/episode-1',
      status: 'ok',
    });

    const { dbEpisodeSources } = await loadModule();
    expect(await dbEpisodeSources(457, 5)).toBeNull();
  });

  it('rewrites CVH and AniBoom templates for the requested episode and labels them unverified', async () => {
    tables.episode_sources.push(
      {
        anime_id: 457, provider: 'cvh', translation_id: '2', translation_title: 'AniLibria',
        translation_type: 'voice', kind: 'embed', embed_url: 'https://animego.me/cdn-iframe/457/1/1?dubbing=AnilibriaTV',
        episodes_count: 26, status: 'ok',
      },
      {
        anime_id: 457, provider: 'aniboom', translation_id: '9', translation_title: '2x2',
        translation_type: 'voice', kind: 'embed', embed_url: 'https://aniboom.one/embed/abc123?episode=1&translation=9',
        episodes_count: 26, status: 'ok',
      },
    );

    const { dbEpisodeSources } = await loadModule();
    const result = await dbEpisodeSources(457, 5);

    expect(result?.sources).toHaveLength(2);
    const cvh = result?.sources.find((source) => source.providerId === 'cvh');
    const aniboom = result?.sources.find((source) => source.providerId === 'aniboom');
    expect(cvh?.embedUrl).toBe('https://animego.me/cdn-iframe/457/1/5?dubbing=AnilibriaTV');
    expect(cvh?.synthesized).toBe(true);
    expect(new URL(aniboom?.embedUrl ?? '').searchParams.get('episode')).toBe('5');
    expect(aniboom?.synthesized).toBe(true);
  });

  it('does not synthesize AniBoom past the provider-reported episode count', async () => {
    tables.episode_sources.push({
      anime_id: 21, provider: 'aniboom', translation_id: '0', translation_title: 'AniBoom · 2x2',
      translation_type: 'voice', kind: 'embed',
      embed_url: 'https://aniboom.one/embed/JRwXrQgM0L5?episode=1&translation=9',
      episodes_count: 1, status: 'ok',
    });

    const { dbEpisodeSources } = await loadModule();
    expect(await dbEpisodeSources(21, 25)).toBeNull();
  });

  it('keeps exact per-episode URLs even when the template episode count is smaller', async () => {
    tables.episode_sources.push({
      anime_id: 457, provider: 'cvh', translation_id: '2', translation_title: 'SHIZA Project',
      translation_type: 'voice', kind: 'embed',
      embed_url: 'https://animego.me/cdn-iframe/457/1/1?dubbing=SHIZA%20Project',
      episodes_count: 1, status: 'ok',
    });
    tables.episode_source_urls.push({
      anime_id: 457, provider: 'cvh', translation_id: '2', episode: 2,
      kind: 'embed', embed_url: 'https://animego.me/cdn-iframe/457/1/2?dubbing=SHIZA%20Project', status: 'ok',
    });

    const { dbEpisodeSources } = await loadModule();
    const result = await dbEpisodeSources(457, 2);
    expect(result?.sources[0].embedUrl).toContain('/2?dubbing=');
    expect(result?.sources[0].synthesized).toBeUndefined();
  });

  it('reads exact episode coverage and valid CVH template providers from Supabase', async () => {
    tables.episode_source_urls.push(
      { anime_id: 457, provider: 'kodik', translation_id: '1045', episode: 1, embed_url: 'https://kodik.test/1', status: 'ok' },
      { anime_id: 457, provider: 'kodik', translation_id: '1045', episode: 5, embed_url: 'https://kodik.test/5', status: 'ok' },
    );
    tables.episode_sources.push({
      anime_id: 457, provider: 'cvh', translation_id: '2', translation_title: 'AniLibria',
      translation_type: 'voice', kind: 'embed', embed_url: 'https://animego.me/cdn-iframe/457/1/1?dubbing=AniLibriaTV',
      episodes_count: 26, status: 'ok',
    });

    const { dbEpisodeAvailability } = await loadModule();
    const result = await dbEpisodeAvailability(457, 26);

    expect(result?.directEpisodes).toEqual([1, 5]);
    expect(result?.templateProviders).toEqual(['cvh']);
    expect(result?.templateMaxEpisodes).toEqual({ cvh: 26 });
  });
});
