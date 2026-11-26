import { B3B_PIPELINE_VERSION } from './types';
import { canonicalJson, sha256, stableUuid } from './canonical';
import type { DedupResult } from './dedup';
import type {
  ImportOperation,
  ImportPlan,
  NormalizedAdaptation,
  NormalizedAlias,
  NormalizedCatalog,
  NormalizedCredit,
  NormalizedExternalId,
  NormalizedPerson,
  NormalizedReviewItem,
  NormalizedWork,
  ReportCounts,
  InsertOperation,
  WorkAnnotations,
} from './types';

export interface PlanOptions {
  selectedAnilistIds?: Set<number>;
  generatedAt: string;
  dedup: DedupResult;
}

const TABLE_ORDER = [
  'comic_works',
  'comic_external_ids',
  'comic_aliases',
  'comic_people',
  'comic_credits',
  'comic_adaptations',
  'comic_review_queue',
] as const;

function anilistIdOf(work: NormalizedWork): number {
  return Number(work.internal_key.split(':').at(-1));
}

function addOperation<T>(
  operations: Array<ImportOperation<Record<string, unknown>>>,
  table: string,
  op: 'INSERT' | 'UPDATE' | 'SKIP' | 'REJECT',
  id: string | null,
  row: T | null,
  reason: string | null = null,
  conflictKey: string | null = null,
): void {
  operations.push({
    table,
    op,
    key: `${table}:${id ?? conflictKey ?? ''}`,
    id,
    row: row ? (row as unknown as Record<string, unknown>) : null,
    conflict_key: conflictKey,
    reason,
  });
}

function hashRow(value: unknown): string {
  return sha256(canonicalJson(value));
}

function boundedDetails(details: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      result[key] = value.slice(0, 20);
    } else if (typeof value === 'string') {
      result[key] = value.slice(0, 300);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function addReview(
  reviews: NormalizedReviewItem[],
  seen: Set<string>,
  input: Omit<NormalizedReviewItem, 'id' | 'status'>, 
): void {
  const key = `${input.work_id ?? ''}|${input.item_type}|${input.reason}|${input.item_ref ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  reviews.push({
    ...input,
    id: stableUuid(`review:${key}`),
    status: 'open',
  });
}

function annotationConflictList(annotation: WorkAnnotations | undefined): string[] {
  return annotation?.conflicts ?? [];
}

export function buildPlan(catalog: NormalizedCatalog, options: PlanOptions): ImportPlan {
  const selected = options.selectedAnilistIds;
  const includeWork = (work: NormalizedWork): boolean => !selected || selected.has(anilistIdOf(work));
  const works = catalog.works.filter(includeWork).sort((a, b) => a.internal_key.localeCompare(b.internal_key));
  const workIdByAnilist = new Map(works.map((work) => [anilistIdOf(work), work.id]));
  const internalKeyById = new Map(works.map((work) => [work.id, work.internal_key]));
  const externalIds = catalog.external_ids.filter((row) => internalKeyById.has(row.work_id));
  const aliases = catalog.aliases.filter((row) => internalKeyById.has(row.work_id));
  const personIds = new Set(catalog.credits.filter((row) => internalKeyById.has(row.work_id)).map((row) => row.person_id));
  const people = catalog.people.filter((row) => personIds.has(row.id));
  const credits = catalog.credits.filter((row) => internalKeyById.has(row.work_id));
  const adaptations = catalog.adaptations.filter((row) => internalKeyById.has(row.comic_work_id));
  const operations: Array<ImportOperation<Record<string, unknown>>> = [];
  const reviews: NormalizedReviewItem[] = [];
  const seenReviews = new Set<string>();

  for (const work of works) {
    addOperation(operations, 'comic_works', 'INSERT', work.id, work);
  }

  const ambiguous = options.dedup.analysis.ambiguousExternalIds;
  for (const external of [...externalIds].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${external.source_name}:${external.external_id}`;
    const work = works.find((item) => item.id === external.work_id);
    if (ambiguous.has(key)) {
      const skipKey = `${key}:${external.work_id}`;
      addOperation(operations, 'comic_external_ids', 'SKIP', null, null,
        `ambiguous external id ${key}: shared by ${options.dedup.analysis.externalIdGroups.find((group) => `${group.source_name}:${group.external_id}` === key)?.internal_keys.length ?? 0} works`, skipKey);
      if (work) {
        const group = options.dedup.analysis.externalIdGroups.find((item) => `${item.source_name}:${item.external_id}` === key);
        addReview(reviews, seenReviews, {
          work_id: work.id,
          item_type: 'external_id',
          item_ref: key,
          reason: 'ambiguous_external_id',
          severity: 'high',
          priority: 100,
          details: boundedDetails({
            source: external.source_name,
            external_id: external.external_id,
            anilist_ids: group?.internal_keys.map((value) => Number(value.split(':').at(-1))) ?? [],
            action: 'skipped_external_id',
          }),
        });
      }
      continue;
    }
    addOperation(operations, 'comic_external_ids', 'INSERT', external.id, external);
  }

  for (const alias of [...aliases].sort((a, b) => a.id.localeCompare(b.id))) {
    addOperation(operations, 'comic_aliases', 'INSERT', alias.id, alias);
  }
  for (const person of [...people].sort((a, b) => a.id.localeCompare(b.id))) {
    addOperation(operations, 'comic_people', 'INSERT', person.id, person);
  }
  for (const credit of [...credits].sort((a, b) => a.id.localeCompare(b.id))) {
    addOperation(operations, 'comic_credits', 'INSERT', credit.id, credit);
  }
  for (const adaptation of [...adaptations].sort((a, b) => a.id.localeCompare(b.id))) {
    addOperation(operations, 'comic_adaptations', 'INSERT', adaptation.id, adaptation);
  }

  for (const group of options.dedup.analysis.externalIdGroups) {
    const key = `${group.source_name}:${group.external_id}`;
    for (const internalKey of group.internal_keys) {
      const anilistId = Number(internalKey.split(':').at(-1));
      const workId = workIdByAnilist.get(anilistId);
      if (!workId) continue;
      addReview(reviews, seenReviews, {
        work_id: workId,
        item_type: 'external_id',
        item_ref: key,
        reason: 'ambiguous_external_id',
        severity: 'high',
        priority: 100,
        details: boundedDetails({
          source: group.source_name,
          external_id: group.external_id,
          anilist_ids: group.internal_keys.map((value) => Number(value.split(':').at(-1))),
          action: 'skipped_external_id',
        }),
      });
    }
  }

  for (const group of options.dedup.analysis.titleGroups) {
    for (const internalKey of group.internal_keys) {
      const anilistId = Number(internalKey.split(':').at(-1));
      const workId = workIdByAnilist.get(anilistId);
      if (!workId) continue;
      addReview(reviews, seenReviews, {
        work_id: workId,
        item_type: 'work',
        item_ref: group.normalized_title,
        reason: 'duplicate_alias',
        severity: 'medium',
        priority: 70,
        details: boundedDetails({
          normalized_title: group.normalized_title,
          anilist_ids: group.internal_keys.map((value) => Number(value.split(':').at(-1))),
          action: 'do_not_merge',
        }),
      });
    }
  }

  for (const work of works) {
    const anilistId = anilistIdOf(work);
    const annotation = catalog.annotations.get(anilistId);
    if (annotation?.verified_status === 'NAME_MISMATCH') {
      addReview(reviews, seenReviews, {
        work_id: work.id,
        item_type: 'work',
        item_ref: 'name_mismatch',
        reason: 'name_mismatch',
        severity: 'high',
        priority: 90,
        details: boundedDetails({ anilist_id: anilistId, candidate_title: annotation.candidate_title, action: 'draft_only' }),
      });
    }
    if (annotation?.verified_status === 'NO_RU_TITLE') {
      addReview(reviews, seenReviews, {
        work_id: work.id,
        item_type: 'work',
        item_ref: 'missing_ru_title',
        reason: 'missing_ru_title',
        severity: 'low',
        priority: 40,
        details: boundedDetails({ anilist_id: anilistId, action: 'no_public_title' }),
      });
    }
    if (annotation?.verified_status === 'PENDING_REVIEW') {
      addReview(reviews, seenReviews, {
        work_id: work.id,
        item_type: 'work',
        item_ref: 'metadata_pending_review',
        reason: 'manual',
        severity: 'low',
        priority: 30,
        details: boundedDetails({ anilist_id: anilistId, action: 'internal_candidate_only' }),
      });
    }
    for (const conflict of annotationConflictList(annotation)) {
      const reason = conflict.startsWith('duplicate_public_title')
        ? 'duplicate_alias'
        : conflict.startsWith('duplicate_external_id')
          ? 'duplicate_external_id'
          : 'source_conflict';
      addReview(reviews, seenReviews, {
        work_id: work.id,
        item_type: 'work',
        item_ref: conflict.slice(0, 200),
        reason,
        severity: reason === 'source_conflict' ? 'medium' : 'high',
        priority: 80,
        details: boundedDetails({ anilist_id: anilistId, conflict, action: 'do_not_merge' }),
      });
    }
    if (annotation?.has_verified && annotation.verified_status === 'SOURCE_VERIFIED' && work.title_ru === null) {
      addReview(reviews, seenReviews, {
        work_id: work.id,
        item_type: 'work',
        item_ref: 'source_verified_without_public_title',
        reason: 'manual',
        severity: 'high',
        priority: 95,
        details: boundedDetails({ anilist_id: anilistId, action: 'block_publication' }),
      });
    }
  }

  for (const hint of catalog.queue_hints) {
    for (const duplicate of hint.duplicate_mal) {
      const key = `mal:${duplicate.mal_id}`;
      if (options.dedup.analysis.ambiguousExternalIds.has(key)) continue;
      for (const anilistId of duplicate.anilist_ids.slice(0, 20)) {
        const workId = workIdByAnilist.get(anilistId);
        if (!workId) continue;
        addReview(reviews, seenReviews, {
          work_id: workId,
          item_type: 'external_id',
          item_ref: key,
          reason: 'ambiguous_external_id',
          severity: 'high',
          priority: 100,
          details: boundedDetails({
            source: 'b1d_review_queue',
            external_id: duplicate.mal_id,
            anilist_ids: duplicate.anilist_ids,
            action: 'manual_confirmation_required',
          }),
        });
      }
    }
  }

  reviews.sort((a, b) => `${a.work_id ?? ''}|${a.reason}|${a.item_ref ?? ''}`.localeCompare(`${b.work_id ?? ''}|${b.reason}|${b.item_ref ?? ''}`));
  for (const review of reviews) {
    addOperation(operations, 'comic_review_queue', 'INSERT', review.id, review);
  }

  const workIds = works.map(anilistIdOf).sort((a, b) => a - b);
  const hash = sha256(canonicalJson({
    schema_version: B3B_PIPELINE_VERSION,
    workIds,
    operations,
  }));
  const operationsFor = <T>(table: string): Array<InsertOperation<T>> =>
    operations
      .filter((operation) => operation.table === table && operation.op === 'INSERT')
      .map((operation) => operation as unknown as InsertOperation<T>);
  return {
    schema_version: B3B_PIPELINE_VERSION,
    operations,
    workIds,
    works: operationsFor<NormalizedWork>('comic_works'),
    externalIds: operationsFor<NormalizedExternalId>('comic_external_ids'),
    aliases: operationsFor<NormalizedAlias>('comic_aliases'),
    people: operationsFor<NormalizedPerson>('comic_people'),
    credits: operationsFor<NormalizedCredit>('comic_credits'),
    adaptations: operationsFor<NormalizedAdaptation>('comic_adaptations'),
    relations: [],
    reviewQueue: operationsFor<NormalizedReviewItem>('comic_review_queue'),
    readingSources: [],
    chapters: [],
    rights: [],
    generatedAt: options.generatedAt,
    planHash: hash,
  };
}

export interface OperationCounts {
  byTable: Record<string, { INSERT: number; UPDATE: number; SKIP: number; REJECT: number }>;
  skipped: number;
  rejected: number;
}

export function countOperations(plan: ImportPlan): OperationCounts {
  const byTable: Record<string, { INSERT: number; UPDATE: number; SKIP: number; REJECT: number }> = {};
  for (const table of TABLE_ORDER) byTable[table] = { INSERT: 0, UPDATE: 0, SKIP: 0, REJECT: 0 };
  let skipped = 0;
  let rejected = 0;
  for (const operation of plan.operations) {
    byTable[operation.table] ??= { INSERT: 0, UPDATE: 0, SKIP: 0, REJECT: 0 };
    byTable[operation.table][operation.op] += 1;
    if (operation.op === 'SKIP') skipped += 1;
    if (operation.op === 'REJECT') rejected += 1;
  }
  return { byTable, skipped, rejected };
}

export function reportCounts(
  plan: ImportPlan,
  input: {
    graphComics: number;
    graphEdges: number;
    verifiedMetadataRecords: number;
    metadataCandidates: number;
    verifiedMetaDeclaredTotal: number;
    duplicateCandidates: number;
    approvedRights: number;
    publicChapters: number;
  },
): ReportCounts {
  const operations = countOperations(plan);
  const reviewWorkIds = new Set(plan.reviewQueue.map((item) => item.row?.work_id).filter((id): id is string => Boolean(id)));
  return {
    sourceGraphComics: input.graphComics,
    sourceGraphEdges: input.graphEdges,
    verifiedMetadataRecords: input.verifiedMetadataRecords,
    metadataCandidates: input.metadataCandidates,
    verifiedMetaDeclaredTotal: input.verifiedMetaDeclaredTotal,
    normalizedWorks: plan.workIds.length,
    readyWorks: operations.byTable.comic_works?.INSERT ?? 0,
    readyExternalIds: operations.byTable.comic_external_ids?.INSERT ?? 0,
    readyAliases: operations.byTable.comic_aliases?.INSERT ?? 0,
    readyPeople: operations.byTable.comic_people?.INSERT ?? 0,
    readyCredits: operations.byTable.comic_credits?.INSERT ?? 0,
    readyAdaptations: operations.byTable.comic_adaptations?.INSERT ?? 0,
    skippedOperations: operations.skipped,
    requiresReview: reviewWorkIds.size,
    duplicateCandidates: input.duplicateCandidates,
    rejectedWorks: operations.byTable.comic_works?.REJECT ?? 0,
    approvedRights: input.approvedRights,
    publicChapters: input.publicChapters,
  };
}

export function hashPlan(plan: ImportPlan): string {
  return hashRow({ schema_version: plan.schema_version, workIds: plan.workIds, operations: plan.operations });
}
