import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Title } from '@/lib/types';
import {
  ComicsDbNotConfiguredError,
  comicsDbConfig,
  getPublicWorkBySlug,
  listPublicWorks,
  mapAdaptationRow,
  mapChapterRow,
  mapPublicWorkRow,
  normalizeCatalogRole,
  normalizeDbKind,
  resetComicsDbStateForTesting,
  type PublicAdaptationRow,
  type PublicChapterRow,
  type PublicWorkRow,
} from '@/lib/aninova3/comics/db';
import { parseComicsCatalogQuery } from '@/lib/aninova3/comics/catalog-params';

const BASE_URL = 'https://project.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature';

function stubSupabaseEnv(overrides: Record<string, string> = {}) {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', BASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_ANON_KEY', '');
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function workRow(overrides: Partial<PublicWorkRow> = {}): PublicWorkRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'one-piece',
    title_ru: 'Ван-Пис',
    kind: 'manga',
    publication_year: 1997,
    publishing_status: 'ongoing',
    description_ru: 'Описание',
    cover_url: null,
    total_chapters_known: 1100,
    volumes_known: null,
    genres: ['action'],
    release_date: null,
    release_date_precision: null,
    published_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-20T00:00:00Z',
    country_code: 'JP',
    search_aliases: 'One Piece',
    source_anime_count: 2,
    role: 'source',
    ...overrides,
  };
}

beforeEach(() => {
  resetComicsDbStateForTesting();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetComicsDbStateForTesting();
});

describe('comicsDbConfig', () => {
  it('без env сообщает missing_env и не делает запросов', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    expect(comicsDbConfig()).toEqual({ ok: false, reason: 'missing_env' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(listPublicWorks(parseComicsCatalogQuery({}))).rejects.toBeInstanceOf(ComicsDbNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('отклоняет service_role JWT и sb_secret-ключ', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    stubSupabaseEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: `header.${payload}.signature` });
    expect(comicsDbConfig()).toEqual({ ok: false, reason: 'service_key_rejected' });
    resetComicsDbStateForTesting();
    stubSupabaseEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_abcdef' });
    expect(comicsDbConfig()).toEqual({ ok: false, reason: 'service_key_rejected' });
  });

  it('отклоняет не-URL', () => {
    stubSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' });
    expect(comicsDbConfig()).toEqual({ ok: false, reason: 'invalid_url' });
  });

  it('принимает anon-ключ и https URL', () => {
    stubSupabaseEnv();
    expect(comicsDbConfig()).toEqual({ ok: true, config: { url: BASE_URL, anonKey: ANON_KEY } });
  });
});

describe('listPublicWorks', () => {
  it('передаёт фильтры как PostgREST-параметры и читает точный total', async () => {
    stubSupabaseEnv();
    const fetchMock = vi.fn(async () =>
      jsonResponse([workRow()], { 'content-range': '0-0/57' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const query = parseComicsCatalogQuery({
      q: 'One Piece',
      genre: 'Action',
      kind: 'manga',
      role: 'source',
      sort: 'title',
      page: '2',
      pageSize: '24',
    });
    const result = await listPublicWorks(query);

    expect(result.total).toBe(57);
    expect(result.rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(target);
    expect(url.origin + url.pathname).toBe(`${BASE_URL}/rest/v1/comic_public_catalog`);
    const params = url.searchParams;
    expect(params.get('kind')).toBe('eq.manga');
    expect(params.get('role')).toBe('eq.source');
    expect(params.get('genres')).toBe('cs.{"Action"}');
    expect(params.get('or')).toBe('(title_ru.ilike.*One Piece*,search_aliases.ilike.*One Piece*)');
    expect(params.get('limit')).toBe('24');
    expect(params.get('offset')).toBe('24');
    expect(params.get('order')).toBe('title_ru.asc,id.asc');
    expect(params.get('select')).toContain('search_aliases');
    const headers = init.headers as Record<string, string>;
    expect(headers.Prefer).toBe('count=exact');
    expect(headers.apikey).toBe(ANON_KEY);
    expect(headers.Authorization).toBe(`Bearer ${ANON_KEY}`);
  });

  it('экранирует % и _ в поиске и кавычки в жанре', async () => {
    stubSupabaseEnv();
    const fetchMock = vi.fn(async () => jsonResponse([], { 'content-range': '*/0' }));
    vi.stubGlobal('fetch', fetchMock);
    const query = parseComicsCatalogQuery({ q: '100%_x', genre: 'Action"<>' });
    const result = await listPublicWorks(query);
    expect(result.total).toBe(0);
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get('or')).toBe('(title_ru.ilike.*100\\%\\_x*,search_aliases.ilike.*100\\%\\_x*)');
    /* Кавычки и скобки удаляет parseComicsCatalogQuery; arrayLiteral страхует остаток. */
    expect(url.searchParams.get('genres')).toBe('cs.{"Action <>"}');
  });

  it('повторяет запрос один раз при 503 и затем отдаёт данные', async () => {
    stubSupabaseEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse([workRow()], { 'content-range': '0-0/1' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listPublicWorks(parseComicsCatalogQuery({}));
    expect(result.rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('после второй ошибки бросает ComicsDbReadError со статусом', async () => {
    stubSupabaseEnv();
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listPublicWorks(parseComicsCatalogQuery({}))).rejects.toMatchObject({
      name: 'ComicsDbReadError',
      status: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getPublicWorkBySlug', () => {
  it('возвращает null на пустой ответ и кодирует slug', async () => {
    stubSupabaseEnv();
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getPublicWorkBySlug('one-piece')).resolves.toBeNull();
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get('slug')).toBe('eq.one-piece');
    expect(url.searchParams.get('limit')).toBe('1');
  });
});

describe('нормализация и маппинг строк', () => {
  it('normalizeDbKind не угадывает тип', () => {
    expect(normalizeDbKind('manga')).toBe('manga');
    expect(normalizeDbKind('ONE_SHOT')).toBe('one_shot');
    expect(normalizeDbKind('light_novel')).toBe('unknown');
    expect(normalizeDbKind(null)).toBe('unknown');
  });

  it('normalizeCatalogRole не подставляет несуществующую роль', () => {
    expect(normalizeCatalogRole('source')).toBe('source');
    expect(normalizeCatalogRole('comic-by-anime')).toBe('comic-by-anime');
    expect(normalizeCatalogRole('admin')).toBe('related');
  });

  it('mapPublicWorkRow помечает DB-происхождение и не выдумывает права', () => {
    const comic = mapPublicWorkRow(workRow());
    expect(comic.id).toBe('comic:db:11111111-1111-4111-8111-111111111111');
    expect(comic.dataSource).toBe('db-public');
    expect(comic.titleRu).toBe('Ван-Пис');
    expect(comic.kind).toBe('manga');
    expect(comic.publication.status).toBe('APPROVED');
    expect(comic.publication.rightsVerified).toBe(false);
    expect(comic.verification).toBe('SOURCE_VERIFIED');
    expect(comic.isDemo).toBe(false);
    expect(comic.chapters).toEqual([]);
    expect(comic.kindEvidence).toMatchObject({ sourceKind: 'MANGA', countryCode: 'JP', basis: 'source-kind' });
  });

  it('mapChapterRow сохраняет внешнюю ссылку и источник', () => {
    const row: PublicChapterRow = {
      id: '22222222-2222-4222-8222-222222222222',
      work_id: '11111111-1111-4111-8111-111111111111',
      chapter_number: 1,
      chapter_number_text: '1',
      chapter_kind: 'regular',
      volume_number: null,
      volume_text: null,
      title_ru: 'Глава 1',
      language: 'ru',
      page_count: 18,
      published_at: null,
      reading_source_id: null,
      source_name: 'Официальный сайт',
      attribution_text: null,
      reading_mode: 'external',
      reading_url: 'https://studio.example/read/1',
    };
    const chapter = mapChapterRow(row);
    expect(chapter).toMatchObject({
      number: 1,
      pages: 18,
      language: 'ru',
      availability: 'public',
      readingUrl: 'https://studio.example/read/1',
      sourceName: 'Официальный сайт',
    });
  });

  it('mapAdaptationRow не усиливает неизвестное направление', () => {
    const row: PublicAdaptationRow = {
      anime_id: 21,
      comic_work_id: '11111111-1111-4111-8111-111111111111',
      raw_relation_type: 'ADAPTATION',
      normalized_relation_type: 'ADAPTATION',
      direction: 'unknown',
      confidence_level: 'unknown',
      basis: 'none',
      is_primary: false,
      source_name: 'AniList',
      observed_at: '2026-11-01T00:00:00Z',
      checked_at: null,
    };
    const anime = {
      anilistId: 21,
      slug: 'anime',
      ru: 'Аниме',
      romaji: 'Anime',
      year: 2020,
      type: 'tv',
    } as Title;
    const link = mapAdaptationRow(row, anime);
    expect(link.role).toBe('RELATED');
    expect(link.direction).toBeNull();
    expect(link.confidence).toBe('unknown');
    expect(link.primary).toBe(false);
  });
});
