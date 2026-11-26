import {
  AMBIGUOUS_EXTERNAL_ID_REASONS,
  AUTHOR_IDENTITY_REASONS,
  RELATION_CONFLICT_REASONS,
  REVIEW_REASONS,
  REVIEW_SEVERITIES,
  REVIEW_STATUSES,
  SOURCE_CONFLICT_REASONS,
  asRecord,
  asStringArray,
  compareText,
  isReviewReason,
  isReviewStatus,
  uniqueSorted,
  workLabel,
  type AdaptationRow,
  type AliasRow,
  type ComicWorkRow,
  type ExternalIdRow,
  type ReviewItemRow,
  type ReviewReason,
  type ReviewSeverity,
  type ReviewStatus,
  type SourceObservationRow,
} from './model';

export type ReviewSort = 'priority' | 'created_at' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface ReviewQuery {
  reason?: ReviewReason;
  workId?: string;
  status?: ReviewStatus;
  priorityMin?: number;
  source?: string;
  sourceConflict?: boolean;
  ambiguousExternalId?: boolean;
  relationEvidenceConflict?: boolean;
  authorIdentityConflict?: boolean;
  createdFrom?: string;
  createdTo?: string;
  q?: string;
  groupByWork?: boolean;
  sort?: ReviewSort;
  dir?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface ReviewGroup {
  workId: string | null;
  label: string;
  internalKey: string | null;
  titleRu: string | null;
  count: number;
  maxPriority: number;
  reasons: string[];
  items: ReviewItemRow[];
}

export interface ReviewSummary {
  total: number;
  by_reason: Record<ReviewReason, number>;
  by_status: Record<ReviewStatus, number>;
  by_severity: Record<ReviewSeverity, number>;
  by_source: Record<string, number>;
}

export interface ReviewQueueResult {
  query: ReviewQuery;
  items: ReviewItemRow[];
  groups: ReviewGroup[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  summary: ReviewSummary;
}

export interface ProvenanceRef {
  kind: 'observation' | 'external_id' | 'alias' | 'adaptation';
  sourceName: string;
  sourceUrl: string | null;
  externalId: string | null;
  joinKey: string | null;
  fetchedAt: string;
  verificationStatus: string;
}

export interface ReviewDetail {
  item: ReviewItemRow;
  work: ComicWorkRow | null;
  exactWorkLink: boolean;
  relatedItems: ReviewItemRow[];
  observations: SourceObservationRow[];
  externalIds: ExternalIdRow[];
  aliases: AliasRow[];
  adaptations: AdaptationRow[];
  provenance: ProvenanceRef[];
  sourceNames: string[];
  warnings: string[];
}

function asParam(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : undefined;
}

function asBool(value: string | string[] | undefined): boolean {
  const raw = asParam(value)?.toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function asPositiveInt(value: string | string[] | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(asParam(value) ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asDate(value: string | string[] | undefined, endOfDay: boolean): string | undefined {
  const raw = asParam(value);
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseReviewQuery(params: Record<string, string | string[] | undefined>): ReviewQuery {
  const reasonRaw = asParam(params.reason);
  const statusRaw = asParam(params.status);
  const sortRaw = asParam(params.sort);
  const dirRaw = asParam(params.dir);
  const priorityRaw = asParam(params.priority);
  const priority = priorityRaw === undefined ? undefined : Number.parseInt(priorityRaw, 10);
  return {
    reason: reasonRaw && isReviewReason(reasonRaw) ? reasonRaw : undefined,
    workId: asParam(params.work_id)?.slice(0, 64),
    status: statusRaw && isReviewStatus(statusRaw) ? statusRaw : undefined,
    priorityMin: priority !== undefined && Number.isFinite(priority) ? Math.min(100, Math.max(0, priority)) : undefined,
    source: asParam(params.source)?.toLowerCase().slice(0, 32),
    sourceConflict: asBool(params.source_conflict),
    ambiguousExternalId: asBool(params.ambiguous_external_id),
    relationEvidenceConflict: asBool(params.relation_evidence_conflict),
    authorIdentityConflict: asBool(params.author_identity_conflict),
    createdFrom: asDate(params.created_from, false),
    createdTo: asDate(params.created_to, true),
    q: asParam(params.q)?.slice(0, 100),
    groupByWork: asBool(params.group_by_work),
    sort: sortRaw === 'created_at' || sortRaw === 'status' ? sortRaw : 'priority',
    dir: dirRaw === 'asc' ? 'asc' : 'desc',
    page: asPositiveInt(params.page, 1, 1, 100000),
    pageSize: asPositiveInt(params.page_size, 25, 10, 100),
  };
}

function addSource(target: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  const normalized = value.trim().toLowerCase();
  if (/^[a-z][a-z0-9_]{1,31}$/.test(normalized)) target.add(normalized);
}

function collectSources(value: unknown, target: Set<string>, depth: number): void {
  if (depth > 5 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectSources(item, target, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  const record = asRecord(value);
  for (const [key, entry] of Object.entries(record)) {
    if (key === 'source_payload') continue;
    if (key === 'source' || key === 'source_name' || key === 'sourceName') {
      addSource(target, entry);
      continue;
    }
    if (key === 'sources') {
      for (const item of asStringArray(entry)) addSource(target, item);
      continue;
    }
    if (key === 'values' || key === 'linked_edges') {
      collectSources(entry, target, depth + 1);
    }
  }
}

export function collectSourceNames(item: ReviewItemRow): string[] {
  const sources = new Set<string>();
  collectSources(item.details, sources, 0);
  return [...sources].sort(compareText);
}

function matchesText(item: ReviewItemRow, work: ComicWorkRow | undefined, q: string): boolean {
  const needle = q.toLocaleLowerCase('ru');
  const haystack = [
    item.id,
    item.item_ref ?? '',
    item.reason,
    work?.internal_key ?? '',
    work?.title_ru ?? '',
    work?.slug ?? '',
  ].join(' ').toLocaleLowerCase('ru');
  return haystack.includes(needle);
}

export function filterReviewItems(
  items: ReviewItemRow[],
  works: ComicWorkRow[],
  query: ReviewQuery,
): ReviewItemRow[] {
  const workById = new Map(works.map((work) => [work.id, work]));
  const from = query.createdFrom ? Date.parse(query.createdFrom) : null;
  const to = query.createdTo ? Date.parse(query.createdTo) : null;
  return items.filter((item) => {
    if (query.reason && item.reason !== query.reason) return false;
    if (query.workId && item.work_id !== query.workId) return false;
    if (query.status && item.status !== query.status) return false;
    if (query.priorityMin !== undefined && item.priority < query.priorityMin) return false;
    if (query.sourceConflict && !SOURCE_CONFLICT_REASONS.includes(item.reason)) return false;
    if (query.ambiguousExternalId && !AMBIGUOUS_EXTERNAL_ID_REASONS.includes(item.reason)) return false;
    if (query.relationEvidenceConflict && !RELATION_CONFLICT_REASONS.includes(item.reason)) return false;
    if (query.authorIdentityConflict && !AUTHOR_IDENTITY_REASONS.includes(item.reason)) return false;
    const createdAt = Date.parse(item.created_at);
    if (from !== null && (Number.isNaN(createdAt) || createdAt < from)) return false;
    if (to !== null && (Number.isNaN(createdAt) || createdAt > to)) return false;
    if (query.source) {
      const sources = collectSourceNames(item);
      if (!sources.includes(query.source)) return false;
    }
    if (query.q) {
      const work = item.work_id ? workById.get(item.work_id) : undefined;
      if (!matchesText(item, work, query.q)) return false;
    }
    return true;
  });
}

function statusRank(status: ReviewStatus): number {
  return REVIEW_STATUSES.indexOf(status);
}

function sortItems(items: ReviewItemRow[], sort: ReviewSort = 'priority', dir: SortDirection = 'desc'): ReviewItemRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...items].sort((left, right) => {
    let result = 0;
    if (sort === 'created_at') {
      result = (Date.parse(left.created_at) || 0) - (Date.parse(right.created_at) || 0);
    } else if (sort === 'status') {
      result = statusRank(left.status) - statusRank(right.status);
    } else {
      result = left.priority - right.priority;
    }
    if (result !== 0) return result * sign;
    const created = (Date.parse(left.created_at) || 0) - (Date.parse(right.created_at) || 0);
    if (created !== 0) return created * -1;
    return left.id.localeCompare(right.id);
  });
}

export function summarizeReviewItems(items: ReviewItemRow[]): ReviewSummary {
  const byReason = Object.fromEntries(REVIEW_REASONS.map((reason) => [reason, 0])) as Record<ReviewReason, number>;
  const byStatus = Object.fromEntries(REVIEW_STATUSES.map((status) => [status, 0])) as Record<ReviewStatus, number>;
  const bySeverity = Object.fromEntries(REVIEW_SEVERITIES.map((severity) => [severity, 0])) as Record<ReviewSeverity, number>;
  const bySource: Record<string, number> = {};
  for (const item of items) {
    byReason[item.reason] += 1;
    byStatus[item.status] += 1;
    bySeverity[item.severity] += 1;
    for (const source of collectSourceNames(item)) bySource[source] = (bySource[source] ?? 0) + 1;
  }
  return { total: items.length, by_reason: byReason, by_status: byStatus, by_severity: bySeverity, by_source: bySource };
}

export function groupReviewItems(items: ReviewItemRow[], works: ComicWorkRow[]): ReviewGroup[] {
  const workById = new Map(works.map((work) => [work.id, work]));
  const groups = new Map<string, ReviewItemRow[]>();
  for (const item of items) {
    const key = item.work_id ?? '__unlinked__';
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([key, bucket]) => {
      const work = key === '__unlinked__' ? undefined : workById.get(key);
      const sorted = sortItems(bucket);
      return {
        workId: work?.id ?? null,
        label: workLabel(work),
        internalKey: work?.internal_key ?? null,
        titleRu: work?.title_ru ?? null,
        count: bucket.length,
        maxPriority: Math.max(...bucket.map((item) => item.priority)),
        reasons: uniqueSorted(bucket.map((item) => item.reason)),
        items: sorted,
      };
    })
    .sort((left, right) => right.maxPriority - left.maxPriority || compareText(left.label, right.label));
}

export function queryReviewQueue(
  items: ReviewItemRow[],
  works: ComicWorkRow[],
  query: ReviewQuery,
): ReviewQueueResult {
  const filtered = filterReviewItems(items, works, query);
  const sorted = sortItems(filtered, query.sort, query.dir);
  const summary = summarizeReviewItems(filtered);
  const pageSize = query.pageSize ?? 25;
  const groups = query.groupByWork ? groupReviewItems(sorted, works) : [];
  const sourceLength = query.groupByWork ? groups.length : sorted.length;
  const pageCount = Math.ceil(sourceLength / pageSize);
  const requestedPage = query.page ?? 1;
  const page = pageCount === 0 ? 1 : Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  const pageItems = query.groupByWork ? [] : sorted.slice(start, start + pageSize);
  const pageGroups = query.groupByWork ? groups.slice(start, start + pageSize) : [];
  return {
    query: { ...query, page, pageSize },
    items: pageItems,
    groups: pageGroups,
    total: sorted.length,
    page,
    pageSize,
    pageCount,
    summary,
  };
}

export function buildReviewDetail(input: {
  item: ReviewItemRow;
  work: ComicWorkRow | null;
  reviewItems: ReviewItemRow[];
  observations: SourceObservationRow[];
  externalIds: ExternalIdRow[];
  aliases: AliasRow[];
  adaptations: AdaptationRow[];
}): ReviewDetail {
  const { item, work, reviewItems, observations, externalIds, aliases, adaptations } = input;
  const exactWorkLink = item.work_id === null ? work === null : work?.id === item.work_id;
  const relatedItems = reviewItems.filter((entry) => entry.work_id === item.work_id).sort((left, right) => {
    if (left.id === item.id) return -1;
    if (right.id === item.id) return 1;
    return right.priority - left.priority || compareText(left.reason, right.reason);
  });
  const provenance: ProvenanceRef[] = [
    ...observations.map((row) => ({
      kind: 'observation' as const,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      externalId: row.external_id,
      joinKey: row.join_key,
      fetchedAt: row.observed_at,
      verificationStatus: row.verification_status,
    })),
    ...externalIds.map((row) => ({
      kind: 'external_id' as const,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      externalId: row.external_id,
      joinKey: null,
      fetchedAt: row.fetched_at,
      verificationStatus: row.verification_status,
    })),
    ...aliases.map((row) => ({
      kind: 'alias' as const,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      externalId: null,
      joinKey: null,
      fetchedAt: row.fetched_at,
      verificationStatus: row.verification_status,
    })),
    ...adaptations.map((row) => ({
      kind: 'adaptation' as const,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      externalId: String(row.anime_id),
      joinKey: null,
      fetchedAt: row.observed_at,
      verificationStatus: row.verification_status,
    })),
  ];
  const warnings: string[] = [];
  if (item.work_id !== null && work === null) warnings.push('Работа, на которую ссылается review item, не найдена в выборке.');
  if (item.work_id === null) warnings.push('Review item не привязан к работе; это не ошибка привязки.');
  if (provenance.length === 0) warnings.push('Связанных provenance-записей нет.');
  if (provenance.some((entry) => entry.sourceUrl === null)) warnings.push('У части provenance-записей отсутствует source URL.');
  return {
    item,
    work,
    exactWorkLink,
    relatedItems,
    observations,
    externalIds,
    aliases,
    adaptations,
    provenance,
    sourceNames: collectSourceNames(item),
    warnings,
  };
}
