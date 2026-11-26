import {
  buildReviewDetail,
  queryReviewQueue,
  type ReviewDetail,
  type ReviewQuery,
  type ReviewQueueResult,
} from './review';
import { buildWorkConflictView, listConflictWorkIds, type WorkConflictView } from './conflicts';
import { buildRelationInspection, type RelationInspection } from './relations';
import type {
  AdaptationRow,
  AliasRow,
  ApprovedRightRow,
  CatalogSnapshot,
  ComicPersonRow,
  ComicWorkRow,
  ExternalIdRow,
  ReviewItemRow,
  SourceObservationRow,
} from './model';

const WORKS_SELECT = [
  'id', 'internal_key', 'slug', 'title_ru', 'title_ru_status', 'kind', 'country_code',
  'publication_year', 'publishing_status', 'is_adult', 'publication_status', 'published_at',
  'source_kind_raw', 'content_rating_status', 'total_chapters_known', 'volumes_known',
  'cover_url', 'updated_at',
].join(',');

const PEOPLE_SELECT = [
  'id', 'canonical_name', 'display_name_ru', 'name_status', 'identity_status', 'name_bucket_key',
  'source_name', 'source_person_id', 'source_url', 'verification_status', 'is_public',
].join(',');

const REVIEW_SELECT = [
  'id', 'work_id', 'item_type', 'item_ref', 'reason', 'severity', 'status', 'priority',
  'details', 'created_at', 'updated_at', 'resolved_at', 'resolved_by',
].join(',');

const OBSERVATION_SELECT = [
  'id', 'work_id', 'field_name', 'source_name', 'external_id', 'join_key', 'source_url',
  'observed_at', 'confidence', 'verification_status', 'source_payload_hash', 'value_json',
  'is_conflict', 'conflict_group', 'created_at',
].join(',');

const EXTERNAL_ID_SELECT = [
  'id', 'work_id', 'source_name', 'external_id', 'source_url', 'is_primary', 'fetched_at',
  'last_verified_at', 'verification_status', 'confidence', 'source_payload_hash',
].join(',');

const ALIAS_SELECT = [
  'id', 'work_id', 'alias', 'alias_type', 'language', 'is_public', 'source_name', 'source_url',
  'fetched_at', 'checked_at', 'confidence', 'verification_status',
].join(',');

const ADAPTATION_SELECT = [
  'id', 'anime_id', 'comic_work_id', 'raw_relation_type', 'normalized_relation_type', 'direction',
  'confidence_level', 'basis', 'is_primary', 'source_name', 'source_url', 'observed_at',
  'checked_at', 'verification_status', 'is_public', 'created_at', 'updated_at',
].join(',');

const RIGHTS_SELECT = [
  'id', 'work_id', 'reading_source_id', 'permission', 'status', 'evidence_ref', 'reviewed_by',
  'reviewed_at', 'valid_from', 'valid_until',
].join(',');

const PAGE_SIZE = 1000;
export const MAX_ROWS = 60000;
const REQUEST_TIMEOUT_MS = 15000;

export class CatalogReadConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogReadConfigurationError';
  }
}

export class CatalogReadError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'CatalogReadError';
    this.status = status;
  }
}

export class CatalogReadIncompleteError extends CatalogReadError {
  readonly table: string;
  readonly fetched: number;
  readonly total: number | null;
  readonly maxRows: number;
  constructor(table: string, fetched: number, total: number | null, maxRows: number) {
    super(
      `Supabase read ${table} is incomplete: fetched ${fetched} rows, reported total ${total === null ? 'unknown' : total}, limit ${maxRows}`,
    );
    this.name = 'CatalogReadIncompleteError';
    this.table = table;
    this.fetched = fetched;
    this.total = total;
    this.maxRows = maxRows;
  }
}

export interface SelectionCompleteness {
  table: string;
  fetched: number;
  total: number | null;
  lastPageSize: number;
  pageSize: number;
  maxRows: number;
}

/**
 * Fail-closed completeness check. A known total must be fully fetched and must
 * not exceed MAX_ROWS. With an unknown total, the only trustworthy end is a
 * short last page below MAX_ROWS; hitting the limit is never success.
 */
export function assertCompleteSelection(input: SelectionCompleteness): void {
  const { table, fetched, total, lastPageSize, pageSize, maxRows } = input;
  if (total !== null && total > maxRows) throw new CatalogReadIncompleteError(table, fetched, total, maxRows);
  if (total !== null && fetched !== total) throw new CatalogReadIncompleteError(table, fetched, total, maxRows);
  if (total === null && fetched >= maxRows) throw new CatalogReadIncompleteError(table, fetched, total, maxRows);
  if (total === null && lastPageSize >= pageSize) throw new CatalogReadIncompleteError(table, fetched, total, maxRows);
}

interface ReadConfig {
  baseUrl: string;
  key: string;
}

function readConfig(): ReadConfig {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl) throw new CatalogReadConfigurationError('NEXT_PUBLIC_SUPABASE_URL не задан.');
  if (!key) throw new CatalogReadConfigurationError('SUPABASE_SERVICE_KEY не задан; anon-ключ для admin-read не используется.');
  return { baseUrl, key };
}

export function isCatalogReadConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}

async function request(table: string, params: URLSearchParams, offset: number | null, limit: number): Promise<{ rows: unknown[]; total: number | null }> {
  const config = readConfig();
  const url = new URL(`/rest/v1/${table}`, config.baseUrl);
  for (const [key, value] of params.entries()) url.searchParams.append(key, value);
  const headers: Record<string, string> = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    Accept: 'application/json',
    Prefer: 'count=exact',
  };
  if (offset !== null) headers.Range = `${offset}-${offset + PAGE_SIZE - 1}`;
  else headers.Range = `0-${Math.max(0, limit - 1)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const contentRange = response.headers.get('content-range');
  const total = contentRange?.split('/')[1] && contentRange.split('/')[1] !== '*'
    ? Number.parseInt(contentRange.split('/')[1] as string, 10)
    : null;
  if (!response.ok) {
    const body = (await response.text()).slice(0, 400);
    throw new CatalogReadError(`Supabase read ${table} failed: HTTP ${response.status}${body ? ` — ${body}` : ''}`, response.status);
  }
  const body = await response.text();
  let rows: unknown[] = [];
  if (body) {
    try {
      const parsed: unknown = JSON.parse(body);
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new CatalogReadError(`Supabase read ${table} returned non-JSON payload`, response.status);
    }
  }
  return { rows, total: total !== null && Number.isFinite(total) ? total : null };
}

export async function fetchAll<T>(
  table: string,
  select: string,
  order: string,
  filters: Record<string, string> = {},
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  let total: number | null = null;
  let lastPageSize = 0;
  while (offset < MAX_ROWS) {
    const params = new URLSearchParams({ select, order });
    for (const [key, value] of Object.entries(filters)) params.set(key, value);
    const result = await request(table, params, offset, PAGE_SIZE);
    if (result.total !== null) total = result.total;
    lastPageSize = result.rows.length;
    rows.push(...(result.rows as T[]));
    if (total !== null && total > MAX_ROWS) break;
    if (rows.length >= MAX_ROWS) break;
    if (lastPageSize < PAGE_SIZE) break;
    if (total !== null && rows.length >= total) break;
    offset = rows.length;
  }
  assertCompleteSelection({ table, fetched: rows.length, total, lastPageSize, pageSize: PAGE_SIZE, maxRows: MAX_ROWS });
  return rows;
}

export async function fetchCount(table: string, filters: Record<string, string> = {}): Promise<number> {
  const params = new URLSearchParams({ select: 'id' });
  for (const [key, value] of Object.entries(filters)) params.set(key, value);
  const result = await request(table, params, 0, 1);
  if (result.total === null) throw new CatalogReadError(`Supabase count ${table} returned no Content-Range`);
  return result.total;
}

export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  const [
    works,
    people,
    reviewItems,
    adaptations,
    approvedRights,
    externalIds,
    aliases,
    credits,
    sourceObservations,
    conflictObservations,
    sourceObservationConflicts,
    sourceObservationsMissingUrl,
    chapters,
    chaptersWithPages,
    publicChapters,
    readingSources,
    readingSourcesActive,
    publicWorks,
  ] = await Promise.all([
    fetchAll<ComicWorkRow>('comic_works', WORKS_SELECT, 'internal_key.asc'),
    fetchAll<ComicPersonRow>('comic_people', PEOPLE_SELECT, 'id.asc'),
    fetchAll<ReviewItemRow>('comic_review_queue', REVIEW_SELECT, 'priority.desc,created_at.desc,id.asc'),
    fetchAll<AdaptationRow>('comic_adaptations', ADAPTATION_SELECT, 'anime_id.asc,id.asc'),
    fetchAll<ApprovedRightRow>('comic_rights', RIGHTS_SELECT, 'id.asc', { status: 'eq.approved' }),
    fetchCount('comic_external_ids'),
    fetchCount('comic_aliases'),
    fetchCount('comic_credits'),
    fetchCount('comic_source_observations'),
    fetchAll<SourceObservationRow>('comic_source_observations', OBSERVATION_SELECT, 'field_name.asc,source_name.asc,id.asc', { is_conflict: 'eq.true' }),
    fetchCount('comic_source_observations', { is_conflict: 'eq.true' }),
    fetchCount('comic_source_observations', { source_url: 'is.null' }),
    fetchCount('comic_chapters'),
    fetchCount('comic_chapters', { page_count: 'gt.0' }),
    fetchCount('comic_public_chapters'),
    fetchCount('comic_reading_sources'),
    fetchCount('comic_reading_sources', { is_active: 'eq.true' }),
    fetchCount('comic_public_works'),
  ]);
  return {
    generated_at: new Date().toISOString(),
    source: 'database',
    works,
    people,
    review_items: reviewItems,
    adaptations,
    observations: conflictObservations,
    approved_rights: approvedRights,
    counts: {
      external_ids: externalIds,
      aliases,
      credits,
      source_observations: sourceObservations,
      source_observation_conflicts: sourceObservationConflicts,
      source_observations_missing_url: sourceObservationsMissingUrl,
      chapters,
      chapters_with_pages: chaptersWithPages,
      public_chapters: publicChapters,
      reading_sources: readingSources,
      reading_sources_active: readingSourcesActive,
      public_works: publicWorks,
    },
  };
}

export interface ReviewWorkspace {
  queue: ReviewQueueResult;
  detail: ReviewDetail | null;
  works: ComicWorkRow[];
}

export async function loadReviewWorkspace(query: ReviewQuery, itemId?: string): Promise<ReviewWorkspace> {
  const [items, works] = await Promise.all([
    fetchAll<ReviewItemRow>('comic_review_queue', REVIEW_SELECT, 'priority.desc,created_at.desc,id.asc'),
    fetchAll<ComicWorkRow>('comic_works', WORKS_SELECT, 'internal_key.asc'),
  ]);
  const queue = queryReviewQueue(items, works, query);
  const selected = itemId ? items.find((item) => item.id === itemId) ?? null : null;
  if (!selected) return { queue, detail: null, works };
  const work = selected.work_id ? works.find((entry) => entry.id === selected.work_id) ?? null : null;
  if (!work) {
    return { queue, detail: buildReviewDetail({ item: selected, work: null, reviewItems: items, observations: [], externalIds: [], aliases: [], adaptations: [] }), works };
  }
  const [observations, externalIds, aliases, adaptations] = await Promise.all([
    fetchAll<SourceObservationRow>('comic_source_observations', OBSERVATION_SELECT, 'field_name.asc,source_name.asc,id.asc', { work_id: `eq.${work.id}` }),
    fetchAll<ExternalIdRow>('comic_external_ids', EXTERNAL_ID_SELECT, 'source_name.asc,id.asc', { work_id: `eq.${work.id}` }),
    fetchAll<AliasRow>('comic_aliases', ALIAS_SELECT, 'alias_type.asc,id.asc', { work_id: `eq.${work.id}` }),
    fetchAll<AdaptationRow>('comic_adaptations', ADAPTATION_SELECT, 'anime_id.asc,id.asc', { comic_work_id: `eq.${work.id}` }),
  ]);
  return {
    queue,
    works,
    detail: buildReviewDetail({ item: selected, work, reviewItems: items, observations, externalIds, aliases, adaptations }),
  };
}

export interface ConflictWorkspace {
  workIds: string[];
  selected: WorkConflictView | null;
  works: ComicWorkRow[];
}

export async function loadConflictWorkspace(workId?: string): Promise<ConflictWorkspace> {
  const [items, works] = await Promise.all([
    fetchAll<ReviewItemRow>('comic_review_queue', REVIEW_SELECT, 'priority.desc,created_at.desc,id.asc'),
    fetchAll<ComicWorkRow>('comic_works', WORKS_SELECT, 'internal_key.asc'),
  ]);
  const workIds = listConflictWorkIds(items);
  const selectedId = workId && workIds.includes(workId) ? workId : workIds[0];
  const work = works.find((entry) => entry.id === selectedId) ?? null;
  if (!work) return { workIds, selected: null, works };
  const observations = await fetchAll<SourceObservationRow>('comic_source_observations', OBSERVATION_SELECT, 'field_name.asc,source_name.asc,id.asc', { work_id: `eq.${work.id}` });
  return { workIds, selected: buildWorkConflictView(work, observations, items), works };
}

export interface RelationWorkspace {
  inspection: RelationInspection;
  works: ComicWorkRow[];
}

export async function loadRelationWorkspace(): Promise<RelationWorkspace> {
  const [adaptations, works, reviewItems] = await Promise.all([
    fetchAll<AdaptationRow>('comic_adaptations', ADAPTATION_SELECT, 'anime_id.asc,id.asc'),
    fetchAll<ComicWorkRow>('comic_works', WORKS_SELECT, 'internal_key.asc'),
    fetchAll<ReviewItemRow>('comic_review_queue', REVIEW_SELECT, 'priority.desc,created_at.desc,id.asc'),
  ]);
  return { inspection: buildRelationInspection(adaptations, works, reviewItems), works };
}
