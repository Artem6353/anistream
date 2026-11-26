import { B3C_PIPELINE_VERSION } from './types';
import { canonicalJson, normalizedTitle, sha256, stableUuid } from './canonical';
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
  NormalizedSourceObservation,
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
  'comic_source_observations',
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

function boundedValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (typeof value === 'string') return value.slice(0, 300);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => boundedValue(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      result[key] = boundedValue(item, depth + 1);
    }
    return result;
  }
  return '[value]';
}

function boundedDetails(details: Record<string, unknown>, preserveSourcePayload = false): Record<string, unknown> {
  const { source_payload: originalPayload, ...rest } = details;
  const result = boundedValue(rest) as Record<string, unknown>;
  if (preserveSourcePayload && originalPayload !== undefined) {
    result.source_payload = originalPayload;
    return result;
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 15000) {
    return { truncated: true, keys: Object.keys(details).slice(0, 30), summary: 'details exceeded 15000 bytes' };
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

function uniqueStatuses(people: NormalizedPerson[]): string[] {
  return [...new Set(people.map((person) => person.name_status))].sort();
}

export function buildPlan(catalog: NormalizedCatalog, options: PlanOptions): ImportPlan {
  const selected = options.selectedAnilistIds;
  const includeWork = (work: NormalizedWork): boolean => !selected || selected.has(anilistIdOf(work));
  const works = catalog.works.filter(includeWork).sort((a, b) => a.internal_key.localeCompare(b.internal_key));
  const workIdByAnilist = new Map(works.map((work) => [anilistIdOf(work), work.id]));
  const internalKeyById = new Map(works.map((work) => [work.id, work.internal_key]));
  const catalogInternalKeyById = new Map(catalog.works.map((work) => [work.id, work.internal_key]));
  const sourceObservations = catalog.source_observations.filter((row) => internalKeyById.has(row.work_id));
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
  for (const observation of [...sourceObservations].sort((a, b) => a.id.localeCompare(b.id))) {
    addOperation(operations, 'comic_source_observations', 'INSERT', observation.id, observation);
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
        reason: 'duplicate_public_title',
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
    if (work.kind === 'unknown') {
      addReview(reviews, seenReviews, {
        work_id: work.id,
        item_type: 'work',
        item_ref: 'kind_unknown',
        reason: 'kind_unknown',
        severity: 'medium',
        priority: 65,
        details: boundedDetails({
          anilist_id: anilistId,
          source_kind_raw: work.source_kind_raw,
          country_code: work.country_code,
          action: 'keep_kind_unknown_until_verified',
        }),
      });
    }
    for (const conflict of catalog.conflicts.filter((item) => item.work_id === work.id)) {
      addReview(reviews, seenReviews, {
        work_id: work.id,
        item_type: 'work',
        item_ref: `conflict:${conflict.field}`,
        reason: 'source_metadata_conflict',
        severity: conflict.field === 'mal_id' ? 'high' : 'medium',
        priority: conflict.field === 'mal_id' ? 100 : 80,
        details: boundedDetails({
          anilist_id: anilistId,
          field: conflict.field,
          values: conflict.values,
          canonical_action: 'no_winner_no_overwrite',
        }),
      });
      if (conflict.field === 'mal_id') {
        addReview(reviews, seenReviews, {
          work_id: work.id,
          item_type: 'external_id',
          item_ref: `mal-conflict:${conflict.values.map((value) => String(value.value)).sort().join(':')}`,
          reason: 'ambiguous_external_id',
          severity: 'high',
          priority: 100,
          details: boundedDetails({
            anilist_id: anilistId,
            mal_ids: conflict.values.filter((value) => value.source_name !== 'shikimori_candidates').map((value) => value.value),
            sources: conflict.values.map((value) => value.source_name),
            action: 'assign_no_mal_id',
          }),
        });
      }
    }
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
      if (!conflict.startsWith('duplicate_public_title') && !conflict.startsWith('duplicate_external_id')) continue;
      const reason = conflict.startsWith('duplicate_public_title')
        ? 'duplicate_public_title'
        : 'duplicate_external_id';
      addReview(reviews, seenReviews, {
        work_id: work.id,
        item_type: 'work',
        item_ref: conflict.slice(0, 200),
        reason,
        severity: 'high',
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

  const adaptationByAnimeComic = new Map<string, NormalizedAdaptation>();
  for (const item of catalog.adaptations) {
    const comicAnilist = Number(catalogInternalKeyById.get(item.comic_work_id)?.split(':').at(-1));
    if (Number.isFinite(comicAnilist)) adaptationByAnimeComic.set(`${item.anime_id}:${comicAnilist}`, item);
  }

  const creditWorkByPerson = new Map(credits.map((credit) => [credit.person_id, credit.work_id]));
  const peopleByNormalizedName = new Map<string, NormalizedPerson[]>();
  for (const person of people) {
    const key = normalizedTitle(person.canonical_name);
    const bucket = peopleByNormalizedName.get(key) ?? [];
    bucket.push(person);
    peopleByNormalizedName.set(key, bucket);
  }
  for (const [name, bucket] of peopleByNormalizedName) {
    const workIdsForName = new Set(bucket.map((person) => creditWorkByPerson.get(person.id)).filter(Boolean));
    if (workIdsForName.size < 2) continue;
    addReview(reviews, seenReviews, {
      work_id: null,
      item_type: 'person',
      item_ref: `author-name:${name}`.slice(0, 300),
      reason: 'ambiguous_people_identity',
      severity: 'medium',
      priority: 85,
      details: boundedDetails({
        normalized_name: name,
        name_buckets: bucket.length,
        work_count: workIdsForName.size,
        source_person_ids: bucket.map((person) => person.source_person_id),
        name_statuses: uniqueStatuses(bucket),
        identity_status: 'unidentified_name_bucket',
        action: 'do_not_merge_by_name',
      }),
    });
  }

  const relationQuality = catalog.relation_quality;
  for (const issue of relationQuality.issues) {
    if (issue.code === 'unknown_relation_type') continue;
    if (issue.code === 'contradictory_direction' || issue.code === 'multiple_primary') continue;
    const comicAnilist = issue.comic_anilist_id;
    const workId = comicAnilist ? workIdByAnilist.get(comicAnilist) ?? null : null;
    addReview(reviews, seenReviews, {
      work_id: workId,
      item_type: issue.code === 'missing_anime' || issue.code === 'missing_comic' || issue.code === 'missing_evidence' ? 'relation' : 'adaptation',
      item_ref: `relation:${issue.code}:${issue.anime_id ?? '?'}:${comicAnilist ?? '?'}`.slice(0, 300),
      reason: issue.code === 'duplicate_edge' ? 'source_conflict' : 'missing_provenance',
      severity: issue.code === 'missing_anime' || issue.code === 'missing_comic' ? 'high' : 'medium',
      priority: issue.code === 'missing_anime' || issue.code === 'missing_comic' ? 90 : 70,
      details: boundedDetails({ ...issue, action: issue.code === 'duplicate_edge' ? 'keep_first_observation' : 'block_relation_use' }),
    });
  }
  for (const rawType of relationQuality.unknownRawTypeNames) {
    const count = relationQuality.issues.filter((issue) => issue.code === 'unknown_relation_type' && issue.raw_relation_type === rawType).length;
    addReview(reviews, seenReviews, {
      work_id: null,
      item_type: 'relation',
      item_ref: `raw-relation:${rawType}`.slice(0, 300),
      reason: 'unsupported_relation',
      severity: 'medium',
      priority: 75,
      details: boundedDetails({ raw_relation_type: rawType, edge_count: count, normalized_relation_type: 'unknown', action: 'manual_mapping_required' }),
    });
  }
  if (relationQuality.multiplePrimary > 0) {
    addReview(reviews, seenReviews, {
      work_id: null,
      item_type: 'adaptation',
      item_ref: 'multiple-primary-adaptations',
      reason: 'source_conflict',
      severity: 'high',
      priority: 100,
      details: boundedDetails({ count: relationQuality.multiplePrimary, action: 'manual_primary_choice' }),
    });
  }


  for (const hint of catalog.queue_hints) {
    const linked = hint.comic_anilist_ids.flatMap((comicId) => hint.anime_ids.map((animeId) => {
      const adaptation = adaptationByAnimeComic.get(`${animeId}:${comicId}`);
      return {
        comic_anilist_id: comicId,
        anime_id: animeId,
        matched: Boolean(adaptation),
        adaptation_id: adaptation?.id ?? null,
        raw_relation_type: adaptation?.raw_relation_type ?? null,
        normalized_relation_type: adaptation?.normalized_relation_type ?? null,
        evidence_url: adaptation?.source_url ?? null,
      };
    }));
    const matchedCount = linked.filter((item) => item.matched).length;
    const duplicateMalResolved = hint.category === 'duplicateMal'
      && hint.comic_anilist_ids.length > 0
      && hint.comic_anilist_ids.every((comicId) => workIdByAnilist.has(comicId));
    const linkStatus = hint.category === 'duplicateMal'
      ? (duplicateMalResolved ? 'matched' : 'unmatched')
      : linked.length === 0 || matchedCount === 0
        ? 'unmatched'
        : matchedCount === linked.length ? 'matched' : 'partial';
    const primaryComicId = hint.comic_anilist_ids[0] ?? null;
    const workId = primaryComicId ? workIdByAnilist.get(primaryComicId) ?? null : null;
    const baseDetails = {
      b1d_category: hint.category,
      b1d_external_id: hint.external_id,
      b1d_link_status: linkStatus,
      anime_ids: hint.anime_ids,
      comic_anilist_ids: hint.comic_anilist_ids,
      linked_edges: linked,
      catalog_domain: 'comics',
      comics_relevance: 'graph_candidate_unconfirmed',
      source_payload_hash: hint.source_payload_hash,
      source_name: hint.source_name,
      source_url: hint.source_url,
      source_payload: hint.payload,
      action: 'review_only_no_adaptation_change',
    };
    const linkProof = linked
      .filter((item) => item.matched)
      .map((item) => adaptationByAnimeComic.get(`${item.anime_id}:${item.comic_anilist_id}`)?.id)
      .filter(Boolean);
    addReview(reviews, seenReviews, {
      work_id: workId,
      item_type: hint.category === 'duplicateMal' ? 'external_id' : 'adaptation',
      item_ref: `b1d:${hint.external_id}`.slice(0, 300),
      reason: linkStatus === 'unmatched' ? 'missing_provenance' : (hint.category === 'duplicateMal' ? 'duplicate_external_id' : 'relation_evidence_conflict'),
      severity: hint.category === 'duplicateMal' ? 'high' : 'medium',
      priority: hint.category === 'duplicateMal' ? 100 : 85,
      details: boundedDetails({ ...baseDetails, linked_adaptation_ids: linkProof, unmatched_reason: linkStatus === 'unmatched' ? 'no matching comic_adaptations edge for any hinted anime/comic pair' : null }, true),
    });
  }

  reviews.sort((a, b) => `${a.work_id ?? ''}|${a.reason}|${a.item_ref ?? ''}`.localeCompare(`${b.work_id ?? ''}|${b.reason}|${b.item_ref ?? ''}`));
  for (const review of reviews) {
    addOperation(operations, 'comic_review_queue', 'INSERT', review.id, review);
  }

  const workIds = works.map(anilistIdOf).sort((a, b) => a - b);
  const hash = sha256(canonicalJson({
    schema_version: B3C_PIPELINE_VERSION,
    workIds,
    operations,
  }));
  const operationsFor = <T>(table: string): Array<InsertOperation<T>> =>
    operations
      .filter((operation) => operation.table === table && operation.op === 'INSERT')
      .map((operation) => operation as unknown as InsertOperation<T>);
  return {
    schema_version: B3C_PIPELINE_VERSION,
    operations,
    workIds,
    works: operationsFor<NormalizedWork>('comic_works'),
    sourceObservations: operationsFor<NormalizedSourceObservation>('comic_source_observations'),
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
    relationQuality,
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
    b1dHintsTotal: number;
    b1dHintsUnmatched: number;
    ambiguousExternalIds: number;
    authorNameRecords: number;
    identifiedAuthors: number;
  },
): ReportCounts {
  const operations = countOperations(plan);
  const reviewWorkIds = new Set(plan.reviewQueue.map((item) => item.row?.work_id).filter((id): id is string => Boolean(id)));
  const works = plan.works.map((item) => item.row);
  const b1dRows = plan.reviewQueue.filter((item) => typeof item.row?.details?.b1d_category === 'string');
  const byCategory: Record<string, number> = {};
  for (const item of b1dRows) {
    const category = String(item.row.details.b1d_category);
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  }
  const sourceConflictWorks = new Set(
    plan.reviewQueue
      .filter((item) => item.row?.reason === 'source_metadata_conflict' && item.row?.work_id)
      .map((item) => item.row.work_id as string),
  );
  const b1dUnmatched = b1dRows.filter((item) => item.row?.details?.b1d_link_status === 'unmatched').length;
  return {
    sourceGraphComics: input.graphComics,
    sourceGraphEdges: input.graphEdges,
    verifiedMetadataRecords: input.verifiedMetadataRecords,
    metadataCandidates: input.metadataCandidates,
    verifiedMetaDeclaredTotal: input.verifiedMetaDeclaredTotal,
    normalizedWorks: plan.workIds.length,
    readyWorks: operations.byTable.comic_works?.INSERT ?? 0,
    readySourceObservations: operations.byTable.comic_source_observations?.INSERT ?? 0,
    readyExternalIds: operations.byTable.comic_external_ids?.INSERT ?? 0,
    readyAliases: operations.byTable.comic_aliases?.INSERT ?? 0,
    readyPeople: operations.byTable.comic_people?.INSERT ?? 0,
    readyCredits: operations.byTable.comic_credits?.INSERT ?? 0,
    readyAdaptations: operations.byTable.comic_adaptations?.INSERT ?? 0,
    skippedOperations: operations.skipped,
    requiresReview: reviewWorkIds.size,
    reviewItems: plan.reviewQueue.length,
    duplicateCandidates: input.duplicateCandidates,
    rejectedWorks: operations.byTable.comic_works?.REJECT ?? 0,
    approvedRights: input.approvedRights,
    publicChapters: input.publicChapters,
    worksWithVerifiedRuTitle: works.filter((work) => work.title_ru_status === 'source_verified' && work.title_ru !== null).length,
    worksUnknownKind: works.filter((work) => work.kind === 'unknown').length,
    worksWithSourceConflicts: sourceConflictWorks.size,
    worksAdultUnknown: works.filter((work) => work.content_rating_status === 'unknown').length,
    worksVerifiedNonAdult: works.filter((work) => work.content_rating_status === 'verified_non_adult').length,
    worksAdult: works.filter((work) => work.content_rating_status === 'adult').length,
    ambiguousExternalIds: input.ambiguousExternalIds,
    b1dHintsTotal: input.b1dHintsTotal,
    b1dHintsQueued: b1dRows.length,
    b1dHintsUnmatched: b1dUnmatched || input.b1dHintsUnmatched,
    b1dHintsByCategory: byCategory,
    authorNameRecords: input.authorNameRecords,
    authorNameBuckets: plan.people.length,
    identifiedAuthors: input.identifiedAuthors,
    relationMissingAnime: plan.relationQuality.missingAnime,
    relationMissingComic: plan.relationQuality.missingComic,
    relationDuplicateEdges: plan.relationQuality.duplicateEdges,
    relationUnknownTypes: plan.relationQuality.unknownRawTypes,
  };
}

export function hashPlan(plan: ImportPlan): string {
  return hashRow({ schema_version: plan.schema_version, workIds: plan.workIds, operations: plan.operations });
}
