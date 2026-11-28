/**
 * B3-E: единый контракт чтения каталога Comics.
 *
 * Два явных режима:
 *   db             — Supabase (public.comic_public_*), режим по умолчанию;
 *   legacy-preview — прежний curated JSON B1, только при явном opt-in
 *                    (COMICS_LEGACY_PREVIEW=1 или NODE_ENV !== production).
 *
 * Молчаливого fallback нет: если БД не сконфигурирована и legacy запрещён,
 * контракт бросает ComicsCatalogUnavailableError, а слой API отвечает 503.
 */
import { titleById, titleFromDbRow } from '@/lib/catalog';
import {
  CATALOG_ROLE_LABELS,
  catalogIndex,
  normalizeQuery,
  queryCatalog,
  type CatalogEntry,
  type CatalogResult,
  type CatalogRole,
} from './catalog';
import type { ComicsCatalogQuery } from './catalog-params';
import {
  ComicsDbReadError,
  comicsDbConfig,
  getPublicWorkBySlug,
  listPublicAdaptations,
  listPublicChapters,
  listPublicWorks,
  listTitlesByIds,
  mapAdaptationRow,
  mapChapterRow,
  mapPublicWorkRow,
  normalizeCatalogRole,
  normalizeDbKind,
  readGenreCounts,
  readKindCounts,
  readRoleCounts,
  type PublicWorkRow,
} from './db';
import type { ComicChapter, ComicKind, LinkedAnime } from './model';
import { getComicByLegacySlug, comicStore } from './store';
import { resolveComicAdaptations } from './source-links';

export type ComicsReadSource = 'db' | 'legacy-preview';

export interface ComicsReadNotice {
  code: 'legacy-preview';
  message: string;
}

export interface ComicsCatalogRead extends CatalogResult {
  source: ComicsReadSource;
  notice: ComicsReadNotice | null;
}

export type ComicBySlugRead =
  | {
      status: 'found';
      source: ComicsReadSource;
      notice: ComicsReadNotice | null;
      entry: CatalogEntry;
      chapters: ComicChapter[];
      adaptations: LinkedAnime[];
    }
  | { status: 'moved'; slug: string }
  | { status: 'not-found' };

export type ComicsReadUnavailableCode = 'not-configured' | 'read-failed';

export class ComicsCatalogUnavailableError extends Error {
  readonly code: ComicsReadUnavailableCode;
  constructor(code: ComicsReadUnavailableCode, message: string) {
    super(message);
    this.name = 'ComicsCatalogUnavailableError';
    this.code = code;
  }
}

const LEGACY_NOTICE: ComicsReadNotice = {
  code: 'legacy-preview',
  message:
    'Источник — curated JSON preview B1, а не база данных. Список неполный и не подтверждает публикацию в БД.',
};

function legacyPreviewAllowed(): boolean {
  const flag = (process.env.COMICS_LEGACY_PREVIEW ?? '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

export type ComicsReadMode =
  | { mode: 'db' }
  | { mode: 'legacy-preview'; notice: ComicsReadNotice }
  | { mode: 'unavailable'; code: ComicsReadUnavailableCode; reason: string };

export function resolveComicsReadMode(): ComicsReadMode {
  const configured = comicsDbConfig();
  const forced = (process.env.COMICS_CATALOG_SOURCE ?? '').trim().toLowerCase();
  if (forced === 'legacy' || forced === 'legacy-preview') {
    if (!legacyPreviewAllowed()) {
      return {
        mode: 'unavailable',
        code: 'not-configured',
        reason: 'COMICS_CATALOG_SOURCE=legacy is not allowed in this environment',
      };
    }
    return { mode: 'legacy-preview', notice: LEGACY_NOTICE };
  }
  if (configured.ok) return { mode: 'db' };
  if (legacyPreviewAllowed()) return { mode: 'legacy-preview', notice: LEGACY_NOTICE };
  return {
    mode: 'unavailable',
    code: 'not-configured',
    reason:
      configured.reason === 'service_key_rejected'
        ? 'service_role key rejected: the public comics layer requires the anon key'
        : 'Supabase public read is not configured',
  };
}

function legacyEntries(): CatalogEntry[] {
  return catalogIndex(comicStore(), (id) => titleById.get(id));
}

function entryFromRow(row: PublicWorkRow): CatalogEntry {
  const role = normalizeCatalogRole(row.role);
  const comic = mapPublicWorkRow(row);
  return {
    comic,
    title: comic.titleRu,
    role,
    roleLabel: CATALOG_ROLE_LABELS[role],
    genres: comic.genres,
    sourceAnimeCount: row.source_anime_count ?? 0,
    search: normalizeQuery(`${comic.titleRu} ${row.search_aliases ?? ''}`),
  };
}

function kindsFacet(rows: { kind: string; work_count: number }[]): { value: string; count: number }[] {
  return rows
    .map((row) => ({ value: normalizeDbKind(row.kind) as ComicKind, count: row.work_count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ru'));
}

function rolesFacet(counts: Record<CatalogRole, number>): { value: CatalogRole; label: string; count: number }[] {
  return (Object.keys(CATALOG_ROLE_LABELS) as CatalogRole[]).map((value) => ({
    value,
    label: CATALOG_ROLE_LABELS[value],
    count: counts[value] ?? 0,
  }));
}

async function readDbCatalog(query: ComicsCatalogQuery): Promise<ComicsCatalogRead> {
  const first = await listPublicWorks(query);
  const total = first.total;
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  let page = query.page;
  let rows = first.rows;

  /* Как и legacy-каталог: страница за пределами выдачи показывает последнюю. */
  if (!rows.length && total > 0 && page > pages) {
    page = pages;
    const retried = await listPublicWorks({ ...query, page });
    rows = retried.rows;
  }

  const [kindRows, genreRows, roleCounts] = await Promise.all([
    readKindCounts(),
    readGenreCounts(),
    readRoleCounts(),
  ]);

  return {
    source: 'db',
    notice: null,
    items: rows.map(entryFromRow),
    total,
    page,
    pages,
    pageSize: query.pageSize,
    facets: {
      genres: genreRows.map((row) => ({ value: row.genre, count: row.work_count })),
      kinds: kindsFacet(kindRows),
      roles: rolesFacet(roleCounts),
    },
    applied: { q: query.q, genre: query.genre, kind: query.kind ?? '', role: query.role ?? '', sort: query.sort },
  };
}

function readLegacyCatalog(query: ComicsCatalogQuery, notice: ComicsReadNotice): ComicsCatalogRead {
  const result = queryCatalog(legacyEntries(), {
    q: query.q,
    genre: query.genre,
    kind: query.kind ?? '',
    role: query.role ?? '',
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { ...result, source: 'legacy-preview', notice };
}

export async function readComicsCatalog(query: ComicsCatalogQuery): Promise<ComicsCatalogRead> {
  const mode = resolveComicsReadMode();
  if (mode.mode === 'unavailable') {
    throw new ComicsCatalogUnavailableError(mode.code, mode.reason);
  }
  if (mode.mode === 'legacy-preview') return readLegacyCatalog(query, mode.notice);
  try {
    return await readDbCatalog(query);
  } catch (error) {
    if (error instanceof ComicsDbReadError) {
      throw new ComicsCatalogUnavailableError('read-failed', error.message);
    }
    throw error;
  }
}

async function readDbWork(slug: string): Promise<ComicBySlugRead> {
  const row = await getPublicWorkBySlug(slug);
  if (!row) return { status: 'not-found' };

  const [chapterRows, adaptationRows] = await Promise.all([
    listPublicChapters(row.id),
    listPublicAdaptations(row.id),
  ]);
  const chapters = chapterRows.map(mapChapterRow);
  const animeIds = adaptationRows.map((adaptation) => adaptation.anime_id);
  const titles = animeIds.length ? await listTitlesByIds(animeIds) : [];
  const byAnilistId = new Map(titles.map((title) => [title.anilist_id, title]));
  const adaptations: LinkedAnime[] = [];
  for (const adaptation of adaptationRows) {
    const anime = byAnilistId.get(adaptation.anime_id);
    /* Нет строки тайтла — связь не выдумываем и не показываем. */
    if (!anime) continue;
    adaptations.push(mapAdaptationRow(adaptation, titleFromDbRow(anime)));
  }

  const entry = entryFromRow(row);
  entry.comic.chapters = chapters;
  return {
    status: 'found',
    source: 'db',
    notice: null,
    entry,
    chapters,
    adaptations,
  };
}

function readLegacyWork(slug: string, notice: ComicsReadNotice): ComicBySlugRead {
  const entries = legacyEntries();
  const entry = entries.find((candidate) => candidate.comic.slug === slug);
  if (entry) {
    return {
      status: 'found',
      source: 'legacy-preview',
      notice,
      entry,
      chapters: entry.comic.chapters,
      adaptations: resolveComicAdaptations(entry.comic, { titles: titleById }),
    };
  }
  const legacy = getComicByLegacySlug(slug);
  if (!legacy) return { status: 'not-found' };
  const canonical = entries.find((candidate) => candidate.comic.id === legacy.id);
  return canonical ? { status: 'moved', slug: canonical.comic.slug } : { status: 'not-found' };
}

export async function readComicBySlug(slug: string): Promise<ComicBySlugRead> {
  const clean = String(slug ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/i.test(clean)) return { status: 'not-found' };

  const mode = resolveComicsReadMode();
  if (mode.mode === 'unavailable') {
    throw new ComicsCatalogUnavailableError(mode.code, mode.reason);
  }
  if (mode.mode === 'legacy-preview') return readLegacyWork(clean, mode.notice);
  try {
    return await readDbWork(clean);
  } catch (error) {
    if (error instanceof ComicsDbReadError) {
      throw new ComicsCatalogUnavailableError('read-failed', error.message);
    }
    throw error;
  }
}

/** Служебная информация для health/отладки: режим и причина, без секретов. */
export function comicsReadSourceInfo(): {
  mode: ComicsReadMode['mode'];
  reason: string | null;
  dbConfigured: boolean;
} {
  const mode = resolveComicsReadMode();
  return {
    mode: mode.mode,
    reason: mode.mode === 'unavailable' ? mode.reason : null,
    dbConfigured: comicsDbConfig().ok,
  };
}
