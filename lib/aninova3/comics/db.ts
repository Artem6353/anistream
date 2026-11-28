/**
 * B3-E: чтение публичного comics-каталога из Supabase (PostgREST).
 *
 * Слой только читает PUBLIC-представления (`comic_public_*`), созданные
 * B3-B/B3-C/B3-E. Он не знает service-ключа и не умеет писать: анонимный ключ +
 * RLS-гейты представлений — единственная линия доступа.
 *
 * Важно: успешный ответ PostgREST здесь не доказывает, что гейты совпадают с
 * production Supabase — это проверяется отдельно (см. docs/comics/B3E_REPORT.md).
 */
import type { DbTitle } from '@/lib/catalog';
import type { Title } from '@/lib/types';
import type {
  ComicChapter,
  ComicKind,
  ComicPublishingStatus,
  ComicWork,
  DirectionBasis,
  DirectionConfidence,
  DirectionConflict,
  LinkedAnime,
  WorkRelationKind,
} from './model';
import type { CatalogRole } from './catalog';
import type { ComicsCatalogQuery } from './catalog-params';

const REQUEST_TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 300;
const MAX_IDS_PER_QUERY = 100;

export const PUBLIC_CATALOG_VIEW = 'comic_public_catalog';
export const PUBLIC_ADAPTATIONS_VIEW = 'comic_public_adaptations';
export const PUBLIC_CHAPTERS_VIEW = 'comic_public_chapters';

export type ComicsDbConfigReason = 'missing_env' | 'invalid_url' | 'service_key_rejected';

export type ComicsDbConfigResult =
  | { ok: true; config: { url: string; anonKey: string } }
  | { ok: false; reason: ComicsDbConfigReason };

let cachedConfig: ComicsDbConfigResult | null = null;

/** JWT service-ключ отклоняется: публичный слой не должен иметь write-доступ. */
function looksLikeServiceKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

export function comicsDbConfig(): ComicsDbConfigResult {
  if (cachedConfig) return cachedConfig;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !anonKey) {
    cachedConfig = { ok: false, reason: 'missing_env' };
    return cachedConfig;
  }
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    cachedConfig = { ok: false, reason: 'invalid_url' };
    return cachedConfig;
  }
  if (looksLikeServiceKey(anonKey)) {
    cachedConfig = { ok: false, reason: 'service_key_rejected' };
    return cachedConfig;
  }
  cachedConfig = { ok: true, config: { url, anonKey } };
  return cachedConfig;
}

export function isComicsDbConfigured(): boolean {
  return comicsDbConfig().ok;
}

export function resetComicsDbStateForTesting(): void {
  cachedConfig = null;
}

export class ComicsDbReadError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ComicsDbReadError';
    this.status = status;
  }
}

export class ComicsDbNotConfiguredError extends Error {
  readonly reason: ComicsDbConfigReason;
  constructor(reason: ComicsDbConfigReason) {
    super(`comics public read is not configured: ${reason}`);
    this.name = 'ComicsDbNotConfiguredError';
    this.reason = reason;
  }
}

interface RestResult<T> {
  rows: T[];
  total: number | null;
}

function parseTotal(header: string | null): number | null {
  if (!header) return null;
  const match = /^\d+-\d+\/(\d+|\*)$/.exec(header.trim());
  if (!match || match[1] === '*') return null;
  const total = Number.parseInt(match[1], 10);
  return Number.isFinite(total) ? total : null;
}

async function restGet<T>(
  view: string,
  params: URLSearchParams,
  options: { count?: boolean; select?: string } = {},
): Promise<RestResult<T>> {
  const resolved = comicsDbConfig();
  if (!resolved.ok) throw new ComicsDbNotConfiguredError(resolved.reason);
  const { url, anonKey } = resolved.config;
  const query = new URLSearchParams(params);
  if (options.select) query.set('select', options.select);
  const target = `${url}/rest/v1/${view}?${query.toString()}`;
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };
  if (options.count) headers.Prefer = 'count=exact';

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(target, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = (await response.text().catch(() => '')).slice(0, 300);
        if ((response.status === 429 || response.status >= 500) && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        throw new ComicsDbReadError(response.status, `PostgREST ${view} responded ${response.status}: ${body}`);
      }
      const rows = (await response.json()) as T[];
      return {
        rows: Array.isArray(rows) ? rows : [],
        total: parseTotal(response.headers.get('content-range')),
      };
    } catch (error) {
      if (error instanceof ComicsDbReadError) throw error;
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : 'unknown transport error';
  throw new ComicsDbReadError(0, `PostgREST ${view} is unreachable: ${message}`);
}

async function restCount(view: string, params: URLSearchParams): Promise<number> {
  const resolved = comicsDbConfig();
  if (!resolved.ok) throw new ComicsDbNotConfiguredError(resolved.reason);
  const { url, anonKey } = resolved.config;
  const query = new URLSearchParams(params);
  query.set('select', 'id');
  query.set('limit', '1');
  const response = await fetch(`${url}/rest/v1/${view}?${query.toString()}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
      Prefer: 'count=exact',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new ComicsDbReadError(response.status, `PostgREST ${view} count responded ${response.status}`);
  }
  const total = parseTotal(response.headers.get('content-range'));
  if (total === null) throw new ComicsDbReadError(0, `PostgREST ${view} count is missing`);
  return total;
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function arrayLiteral(value: string): string {
  return `{"${value.replace(/[\\"]/g, (match) => `\\${match}`)}"}`;
}

export interface PublicWorkRow {
  id: string;
  slug: string;
  title_ru: string | null;
  kind: string | null;
  publication_year: number | null;
  publishing_status: string | null;
  description_ru: string | null;
  cover_url: string | null;
  total_chapters_known: number | null;
  volumes_known: number | null;
  genres: string[] | null;
  release_date: string | null;
  release_date_precision: string | null;
  published_at: string | null;
  updated_at: string | null;
  country_code: string | null;
  search_aliases: string | null;
  source_anime_count: number | null;
  role: string | null;
}

export interface PublicChapterRow {
  id: string;
  work_id: string;
  chapter_number: number | string | null;
  chapter_number_text: string | null;
  chapter_kind: string | null;
  volume_number: number | string | null;
  volume_text: string | null;
  title_ru: string | null;
  language: string | null;
  page_count: number | null;
  published_at: string | null;
  reading_source_id: string | null;
  source_name: string | null;
  attribution_text: string | null;
  reading_mode: string | null;
  reading_url: string | null;
}

export interface PublicAdaptationRow {
  anime_id: number;
  comic_work_id: string;
  raw_relation_type: string;
  normalized_relation_type: string;
  direction: string;
  confidence_level: string;
  basis: string;
  is_primary: boolean;
  source_name: string;
  observed_at: string;
  checked_at: string | null;
}

const WORK_COLUMNS = [
  'id',
  'slug',
  'title_ru',
  'kind',
  'publication_year',
  'publishing_status',
  'description_ru',
  'cover_url',
  'total_chapters_known',
  'volumes_known',
  'genres',
  'release_date',
  'release_date_precision',
  'published_at',
  'updated_at',
  'country_code',
  'search_aliases',
  'source_anime_count',
  'role',
].join(',');

function orderFor(sort: ComicsCatalogQuery['sort']): string {
  switch (sort) {
    case 'year':
      return 'publication_year.desc.nullslast,title_ru.asc,id.asc';
    case 'chapters':
      return 'total_chapters_known.desc.nullslast,title_ru.asc,id.asc';
    case 'anime':
      return 'source_anime_count.desc,title_ru.asc,id.asc';
    default:
      return 'title_ru.asc,id.asc';
  }
}

export async function listPublicWorks(query: ComicsCatalogQuery): Promise<{ rows: PublicWorkRow[]; total: number }> {
  const params = new URLSearchParams();
  params.set('order', orderFor(query.sort));
  params.set('limit', String(query.pageSize));
  params.set('offset', String((query.page - 1) * query.pageSize));
  if (query.kind) params.set('kind', `eq.${query.kind}`);
  if (query.role) params.set('role', `eq.${query.role}`);
  if (query.genre) params.set('genres', `cs.${arrayLiteral(query.genre)}`);
  if (query.q) {
    const term = escapeIlike(query.q);
    params.set('or', `(title_ru.ilike.*${term}*,search_aliases.ilike.*${term}*)`);
  }
  const result = await restGet<PublicWorkRow>(PUBLIC_CATALOG_VIEW, params, {
    count: true,
    select: WORK_COLUMNS,
  });
  return { rows: result.rows, total: result.total ?? result.rows.length };
}

export async function getPublicWorkBySlug(slug: string): Promise<PublicWorkRow | null> {
  const params = new URLSearchParams();
  params.set('slug', `eq.${slug}`);
  params.set('limit', '1');
  const result = await restGet<PublicWorkRow>(PUBLIC_CATALOG_VIEW, params, { select: WORK_COLUMNS });
  return result.rows[0] ?? null;
}

export async function listPublicChapters(workId: string): Promise<PublicChapterRow[]> {
  const params = new URLSearchParams();
  params.set('work_id', `eq.${workId}`);
  params.set('order', 'chapter_number.asc.nullslast,id.asc');
  params.set('limit', '500');
  const result = await restGet<PublicChapterRow>(PUBLIC_CHAPTERS_VIEW, params, {
    select: [
      'id',
      'work_id',
      'chapter_number',
      'chapter_number_text',
      'chapter_kind',
      'volume_number',
      'volume_text',
      'title_ru',
      'language',
      'page_count',
      'published_at',
      'reading_source_id',
      'source_name',
      'attribution_text',
      'reading_mode',
      'reading_url',
    ].join(','),
  });
  return result.rows;
}

export async function listPublicAdaptations(workId: string): Promise<PublicAdaptationRow[]> {
  const params = new URLSearchParams();
  params.set('comic_work_id', `eq.${workId}`);
  params.set('order', 'is_primary.desc,anime_id.asc');
  params.set('limit', '200');
  const result = await restGet<PublicAdaptationRow>(PUBLIC_ADAPTATIONS_VIEW, params, {
    select: [
      'anime_id',
      'comic_work_id',
      'raw_relation_type',
      'normalized_relation_type',
      'direction',
      'confidence_level',
      'basis',
      'is_primary',
      'source_name',
      'observed_at',
      'checked_at',
    ].join(','),
  });
  return result.rows;
}

export async function listTitlesByIds(ids: number[]): Promise<DbTitle[]> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
  const rows: DbTitle[] = [];
  for (let index = 0; index < unique.length; index += MAX_IDS_PER_QUERY) {
    const chunk = unique.slice(index, index + MAX_IDS_PER_QUERY);
    if (!chunk.length) continue;
    const params = new URLSearchParams();
    params.set('anilist_id', `in.(${chunk.join(',')})`);
    params.set('limit', String(MAX_IDS_PER_QUERY));
    const result = await restGet<DbTitle>('titles', params, { select: '*' });
    rows.push(...result.rows);
  }
  return rows;
}

export async function readKindCounts(): Promise<{ kind: string; work_count: number }[]> {
  const params = new URLSearchParams();
  params.set('order', 'work_count.desc');
  params.set('limit', '50');
  const result = await restGet<{ kind: string; work_count: number }>('comic_public_kind_counts', params, {
    select: 'kind,work_count',
  });
  return result.rows;
}

export async function readGenreCounts(): Promise<{ genre: string; work_count: number }[]> {
  const params = new URLSearchParams();
  params.set('order', 'work_count.desc');
  params.set('limit', '60');
  const result = await restGet<{ genre: string; work_count: number }>('comic_public_genre_counts', params, {
    select: 'genre,work_count',
  });
  return result.rows;
}

export async function readRoleCounts(): Promise<Record<CatalogRole, number>> {
  const roles: CatalogRole[] = ['source', 'comic-by-anime', 'related'];
  const counts = await Promise.all(
    roles.map(async (role) => {
      const params = new URLSearchParams();
      params.set('role', `eq.${role}`);
      return [role, await restCount(PUBLIC_CATALOG_VIEW, params)] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<CatalogRole, number>;
}

const DB_KINDS: Record<string, ComicKind> = {
  manga: 'manga',
  manhwa: 'manhwa',
  manhua: 'manhua',
  webtoon: 'webtoon',
  comic: 'comic',
  one_shot: 'one_shot',
  oneshot: 'one_shot',
  unknown: 'unknown',
};

export function normalizeDbKind(value: string | null | undefined): ComicKind {
  return DB_KINDS[String(value ?? '').trim().toLowerCase()] ?? 'unknown';
}

const PUBLISHING_STATUSES: Record<string, ComicPublishingStatus> = {
  ongoing: 'ongoing',
  completed: 'completed',
  hiatus: 'hiatus',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  unknown: 'unknown',
};

export function normalizePublishingStatus(value: string | null | undefined): ComicPublishingStatus {
  return PUBLISHING_STATUSES[String(value ?? '').trim().toLowerCase()] ?? 'unknown';
}

const ROLE_MAP: Record<string, CatalogRole> = {
  source: 'source',
  'comic-by-anime': 'comic-by-anime',
  related: 'related',
};

export function normalizeCatalogRole(value: string | null | undefined): CatalogRole {
  return ROLE_MAP[String(value ?? '').trim()] ?? 'related';
}

export function mapPublicWorkRow(row: PublicWorkRow): ComicWork {
  const id = `comic:db:${row.id}`;
  return {
    id,
    slug: row.slug,
    titleRu: (row.title_ru ?? '').trim(),
    /* Представление не отдаёт оригинальное название: не подменяем им русское. */
    titleOriginal: '',
    kind: normalizeDbKind(row.kind),
    kindEvidence: {
      sourceFormat: null,
      sourceKind: row.kind ? String(row.kind).toUpperCase() : null,
      countryCode: row.country_code,
      basis: row.kind ? 'source-kind' : 'unknown',
    },
    authors: [],
    authorsVerified: false,
    year: row.publication_year ?? null,
    status: normalizePublishingStatus(row.publishing_status),
    cover: row.cover_url ?? null,
    descriptionRu: row.description_ru ?? null,
    chapters: [],
    totalChaptersKnown: row.total_chapters_known ?? null,
    externalIds: { internal: id },
    publication: {
      /* APPROVED здесь означает «прошло публичный гейт представления», а не
         права на главы: права на чтение по-прежнему проверяются отдельно. */
      status: 'APPROVED',
      russianTitleVerified: true,
      russianMetadataVerified: true,
      rightsVerified: false,
      verificationBasis: 'anilist-relation',
      verifiedAt: row.updated_at ?? undefined,
    },
    verification: 'SOURCE_VERIFIED',
    metadata: {
      status: 'SOURCE_VERIFIED',
      source: 'supabase.comic_public_catalog',
      sourceUrl: null,
      checkedAt: row.updated_at,
      licenseNameRu: null,
      licenseClaimSource: null,
      officialPublisherConfirmed: false,
    },
    genres: row.genres ?? [],
    roles: [],
    animeIds: [],
    titleRuCandidate: null,
    provenance: { source: 'anilist-relation', observedAt: row.updated_at ?? undefined, verification: 'recorded' },
    isDemo: false,
    dataSource: 'db-public',
  };
}

export function mapChapterRow(row: PublicChapterRow): ComicChapter {
  const number = Number(row.chapter_number);
  return {
    id: row.id,
    number: Number.isFinite(number) ? number : 0,
    titleRu: (row.title_ru ?? '').trim(),
    language: 'ru',
    pages: Number(row.page_count ?? 0) || 0,
    publishedAt: row.published_at ?? undefined,
    availability: 'public',
    readingUrl: row.reading_url,
    sourceName: row.source_name,
  };
}

const DIRECTION_MAP: Record<string, LinkedAnime['direction']> = {
  comic_is_source: 'comic-is-source',
  anime_is_source: 'comic-adapts-anime',
  unknown: null,
};

const CONFIDENCE_VALUES = new Set(['confirmed', 'inferred', 'unknown']);
const BASIS_VALUES = new Set([
  'catalog-manga',
  'catalog-original',
  'catalog-conflict',
  'catalog-other-medium',
  'dates-insufficient',
  'none',
]);

function normalizeConfidence(value: string): DirectionConfidence {
  return CONFIDENCE_VALUES.has(value) ? (value as DirectionConfidence) : 'unknown';
}

function normalizeBasis(value: string): DirectionBasis {
  return BASIS_VALUES.has(value) ? (value as DirectionBasis) : 'none';
}

function roleForDirection(direction: LinkedAnime['direction']): WorkRelationKind {
  if (direction === 'comic-is-source') return 'SOURCE';
  if (direction === 'comic-adapts-anime') return 'ADAPTATION';
  return 'RELATED';
}

export function mapAdaptationRow(row: PublicAdaptationRow, anime: Title): LinkedAnime {
  const direction = DIRECTION_MAP[row.direction] ?? null;
  const confidence = normalizeConfidence(row.confidence_level);
  const conflicts: DirectionConflict[] = [];
  return {
    anime,
    role: roleForDirection(direction),
    primary: Boolean(row.is_primary),
    evidence: 'anilist-relation',
    direction,
    confidence,
    basis: normalizeBasis(row.basis),
    conflicts,
    disputed: false,
  };
}
