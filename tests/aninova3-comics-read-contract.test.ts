import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseComicsCatalogQuery } from '@/lib/aninova3/comics/catalog-params';
import { resetComicsDbStateForTesting } from '@/lib/aninova3/comics/db';
import {
  ComicsCatalogUnavailableError,
  comicsReadSourceInfo,
  readComicBySlug,
  readComicsCatalog,
  resolveComicsReadMode,
} from '@/lib/aninova3/comics/public-catalog';

const BASE_URL = 'https://project.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature';
const WORK_ID = '11111111-1111-4111-8111-111111111111';

const workRow = {
  id: WORK_ID,
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
};

const chapterRow = {
  id: '22222222-2222-4222-8222-222222222222',
  work_id: WORK_ID,
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

const adaptationRow = {
  anime_id: 21,
  comic_work_id: WORK_ID,
  raw_relation_type: 'SOURCE',
  normalized_relation_type: 'SOURCE',
  direction: 'comic_is_source',
  confidence_level: 'confirmed',
  basis: 'catalog-manga',
  is_primary: true,
  source_name: 'AniList',
  observed_at: '2026-11-01T00:00:00Z',
  checked_at: '2026-11-02T00:00:00Z',
};

const titleRow = {
  id: 1,
  slug: 'one-piece-anime',
  anilist_id: 21,
  mal_id: 21,
  shikimori_id: null,
  title_ru: 'Ван-Пис',
  title_en: 'One Piece',
  title_romaji: 'One Piece',
  format: 'TV',
  status: 'RELEASING',
  year: 1999,
  season: 'FALL',
  episodes_total: null,
  episodes_released: 1000,
  score: 88,
  popularity: 1000,
  genres: ['Action'],
  studios: ['Toei Animation'],
  source: 'MANGA',
  duration: 24,
  is_adult: false,
  description_ru: 'Описание аниме',
  description_alt: null,
  poster: 'https://img.example/poster.jpg',
  banner: null,
  trailer: null,
  meta_source: 'anilist',
  hidden: false,
};

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function stubDbEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', BASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_ANON_KEY', '');
  vi.stubEnv('COMICS_CATALOG_SOURCE', '');
  vi.stubEnv('COMICS_LEGACY_PREVIEW', '');
}

function installDbMock(options: { skipWork?: boolean; emptyPage?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path.endsWith('/comic_public_catalog')) {
      if (url.searchParams.get('slug')) {
        return jsonResponse(options.skipWork ? [] : [workRow], { 'content-range': options.skipWork ? '*/0' : '0-0/1' });
      }
      if (url.searchParams.get('role')) {
        const role = url.searchParams.get('role');
        const count = role === 'eq.source' ? 2 : role === 'eq.comic-by-anime' ? 1 : 0;
        return jsonResponse([], { 'content-range': `0-0/${count}` });
      }
      if (options.emptyPage && url.searchParams.get('offset') !== '0') {
        return jsonResponse([], { 'content-range': '0-0/1' });
      }
      return jsonResponse([workRow], { 'content-range': '0-0/1' });
    }
    if (path.endsWith('/comic_public_chapters')) return jsonResponse([chapterRow]);
    if (path.endsWith('/comic_public_adaptations')) return jsonResponse([adaptationRow]);
    if (path.endsWith('/titles')) return jsonResponse([titleRow]);
    if (path.endsWith('/comic_public_kind_counts')) return jsonResponse([{ kind: 'manga', work_count: 1 }]);
    if (path.endsWith('/comic_public_genre_counts')) return jsonResponse([{ genre: 'action', work_count: 1 }]);
    return jsonResponse([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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

describe('resolveComicsReadMode', () => {
  it('при сконфигурированной БД читает из БД', () => {
    stubDbEnv();
    expect(resolveComicsReadMode()).toEqual({ mode: 'db' });
  });

  it('в production без БД не подставляет legacy-данные', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('COMICS_CATALOG_SOURCE', '');
    vi.stubEnv('COMICS_LEGACY_PREVIEW', '');
    expect(resolveComicsReadMode()).toMatchObject({ mode: 'unavailable', code: 'not-configured' });
  });

  it('явный legacy в production запрещён, а в разработке разрешён с notice', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('COMICS_CATALOG_SOURCE', 'legacy');
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveComicsReadMode()).toMatchObject({ mode: 'unavailable', code: 'not-configured' });
    vi.stubEnv('NODE_ENV', 'test');
    expect(resolveComicsReadMode()).toMatchObject({ mode: 'legacy-preview' });
  });

  it('сообщает о service_role-ключе без утечки значения', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', BASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', `h.${payload}.s`);
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COMICS_LEGACY_PREVIEW', '');
    vi.stubEnv('COMICS_CATALOG_SOURCE', '');
    const mode = resolveComicsReadMode();
    expect(mode).toMatchObject({ mode: 'unavailable', code: 'not-configured' });
    expect(mode.mode === 'unavailable' ? mode.reason : '').toMatch(/service_role/);
    expect(mode.mode === 'unavailable' ? mode.reason : '').not.toContain(payload);
  });
});

describe('readComicsCatalog (DB)', () => {
  it('собирает элементы, фасеты и точный total из представлений', async () => {
    stubDbEnv();
    const fetchMock = installDbMock();
    const result = await readComicsCatalog(parseComicsCatalogQuery({ q: 'ван' }));

    expect(result.source).toBe('db');
    expect(result.notice).toBeNull();
    expect(result.total).toBe(1);
    expect(result.pages).toBe(1);
    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item.comic.id).toBe(`comic:db:${WORK_ID}`);
    expect(item.comic.dataSource).toBe('db-public');
    expect(item.role).toBe('source');
    expect(item.roleLabel).toBe('Первоисточник аниме');
    expect(item.sourceAnimeCount).toBe(2);
    expect(item.search).toContain('one piece');
    expect(result.facets.kinds).toEqual([{ value: 'manga', count: 1 }]);
    expect(result.facets.genres).toEqual([{ value: 'action', count: 1 }]);
    expect(result.facets.roles).toEqual([
      { value: 'source', label: 'Первоисточник аниме', count: 2 },
      { value: 'comic-by-anime', label: 'Комикс по аниме', count: 1 },
      { value: 'related', label: 'Связанное произведение', count: 0 },
    ]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('страница за пределами выдачи показывает последнюю, а не пустоту', async () => {
    stubDbEnv();
    installDbMock({ emptyPage: true });
    const result = await readComicsCatalog(parseComicsCatalogQuery({ page: '5' }));
    expect(result.page).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it('ошибку PostgREST превращает в read-failed, а не в пустой каталог', async () => {
    stubDbEnv();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await expect(readComicsCatalog(parseComicsCatalogQuery({}))).rejects.toMatchObject({
      name: 'ComicsCatalogUnavailableError',
      code: 'read-failed',
    });
  });
});

describe('readComicBySlug (DB)', () => {
  it('отдаёт главы только с публичной ссылкой и связь с аниме', async () => {
    stubDbEnv();
    installDbMock();
    const result = await readComicBySlug('one-piece');
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.source).toBe('db');
    expect(result.entry.comic.chapters).toHaveLength(1);
    expect(result.chapters[0]).toMatchObject({
      number: 1,
      pages: 18,
      readingUrl: 'https://studio.example/read/1',
      sourceName: 'Официальный сайт',
    });
    expect(result.adaptations).toHaveLength(1);
    expect(result.adaptations[0]).toMatchObject({
      role: 'SOURCE',
      direction: 'comic-is-source',
      confidence: 'confirmed',
      basis: 'catalog-manga',
      primary: true,
    });
  });

  it('несуществующий slug — not-found', async () => {
    stubDbEnv();
    installDbMock({ skipWork: true });
    await expect(readComicBySlug('missing-work')).resolves.toEqual({ status: 'not-found' });
  });

  it('некорректный slug отклоняется до запроса', async () => {
    stubDbEnv();
    const fetchMock = installDbMock();
    await expect(readComicBySlug('a b')).resolves.toEqual({ status: 'not-found' });
    await expect(readComicBySlug('..')).resolves.toEqual({ status: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('legacy-preview', () => {
  it('возвращает данные B1 с явным notice и без запросов к сети', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('COMICS_CATALOG_SOURCE', '');
    vi.stubEnv('COMICS_LEGACY_PREVIEW', '');
    vi.stubEnv('NODE_ENV', 'test');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const info = comicsReadSourceInfo();
    expect(info).toMatchObject({ mode: 'legacy-preview', reason: null, dbConfigured: false });

    const result = await readComicsCatalog(parseComicsCatalogQuery({}));
    expect(result.source).toBe('legacy-preview');
    expect(result.notice?.code).toBe('legacy-preview');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('в production бросает not-configured вместо legacy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('COMICS_LEGACY_PREVIEW', '');
    vi.stubEnv('COMICS_CATALOG_SOURCE', '');
    await expect(readComicsCatalog(parseComicsCatalogQuery({}))).rejects.toBeInstanceOf(ComicsCatalogUnavailableError);
    await expect(readComicBySlug('one-piece')).rejects.toMatchObject({ code: 'not-configured' });
  });
});
