import { loadArtifacts } from './artifacts';
import { buildNormalizedCatalog } from './normalize';
import { normalizedTitle } from './canonical';
import { analyzeDuplicates } from './dedup';
import { buildPlan, countOperations, reportCounts } from './planner';
import { assertApplyMode, assertNoRemoteDatabaseEnvironment } from './safety';
import type {
  AdultStatus,
  CandidateRecord,
  CanaryCoverage,
  GraphComicRecord,
  GraphRelationRecord,
  ImportPlan,
  ImportReport,
  NormalizedCatalog,
  ReviewHintRecord,
  VerifiedMetadataRecord,
} from './types';

export interface DryRunOptions {
  repoRoot?: string;
  now?: string;
  mode?: string;
  canarySize?: number;
}

const DEFAULT_CANARY_IDS = [131323, 131433, 131454, 131637, 30025, 41203, 30001];

function isGraphComic(record: { anilist_id?: unknown; format?: unknown }): record is GraphComicRecord {
  return typeof record.anilist_id === 'number' && (record.format === 'MANGA' || record.format === 'ONE_SHOT');
}

function isGraphRelation(record: { anime_id?: unknown; comic_anilist_id?: unknown; raw_relation_type?: unknown }): record is GraphRelationRecord {
  return typeof record.anime_id === 'number' && typeof record.comic_anilist_id === 'number' && typeof record.raw_relation_type === 'string';
}

function isVerified(record: { anilist_id?: unknown; status?: unknown; checked_at?: unknown }): record is VerifiedMetadataRecord {
  return typeof record.anilist_id === 'number' && typeof record.status === 'string';
}

function isCandidate(record: { anilist_id?: unknown; status?: unknown }): record is CandidateRecord {
  return typeof record.anilist_id === 'number' && typeof record.status === 'string';
}

function isReviewHint(record: { category?: unknown; comic_anilist_ids?: unknown; source_payload_hash?: unknown }): record is ReviewHintRecord {
  return typeof record.category === 'string' && Array.isArray(record.comic_anilist_ids) && typeof record.source_payload_hash === 'string';
}

function anilistIdOfWork(work: NormalizedCatalog['works'][number]): number {
  return Number(work.internal_key.split(':').at(-1));
}

export function selectCanaryWorkIds(catalog: NormalizedCatalog, size = 20): number[] {
  const wanted = Math.max(1, Math.min(50, Math.floor(size)));
  const all = new Set(catalog.works.map(anilistIdOfWork));
  const selected: number[] = [];
  const seen = new Set<number>();
  const push = (id: number | null | undefined): void => {
    if (!id || !all.has(id) || seen.has(id) || selected.length >= wanted) return;
    seen.add(id);
    selected.push(id);
  };
  for (const id of DEFAULT_CANARY_IDS) push(id);
  const b1dSeen = new Set<string>();
  for (const hint of catalog.queue_hints) {
    if (b1dSeen.has(hint.category)) continue;
    b1dSeen.add(hint.category);
    if (hint.category === 'duplicateMal') {
      for (const comicId of hint.comic_anilist_ids) push(comicId);
    } else {
      push(hint.comic_anilist_ids[0]);
    }
  }
  for (const country of ['KR', 'CN']) {
    const work = catalog.works.find((item) => item.country_code === country);
    if (work) push(anilistIdOfWork(work));
  }
  const personById = new Map(catalog.people.map((person) => [person.id, person]));
  const creditsByWork = new Map<string, typeof catalog.credits>();
  for (const credit of catalog.credits) {
    const bucket = creditsByWork.get(credit.work_id) ?? [];
    bucket.push(credit);
    creditsByWork.set(credit.work_id, bucket);
  }
  const authorWorks = new Map<string, number[]>();
  for (const work of catalog.works) {
    for (const credit of creditsByWork.get(work.id) ?? []) {
      const person = personById.get(credit.person_id);
      if (!person) continue;
      const key = normalizedTitle(person.canonical_name);
      const bucket = authorWorks.get(key) ?? [];
      bucket.push(anilistIdOfWork(work));
      authorWorks.set(key, bucket);
    }
  }
  for (const ids of authorWorks.values()) {
    if (new Set(ids).size < 2) continue;
    for (const id of [...new Set(ids)].slice(0, 2)) push(id);
    break;
  }
  const conflictFields = new Set<string>();
  for (const conflict of catalog.conflicts) {
    if (conflictFields.has(conflict.field)) continue;
    if (!['publication_year', 'chapters', 'volumes', 'mal_id', 'title_ru', 'kind'].includes(conflict.field)) continue;
    conflictFields.add(conflict.field);
    push(conflict.anilist_id);
  }
  const unknownKind = catalog.works.find((work) => work.kind === 'unknown');
  if (unknownKind) push(anilistIdOfWork(unknownKind));
  for (const work of catalog.works) {
    if (selected.length >= wanted) break;
    const id = anilistIdOfWork(work);
    if (catalog.annotations.get(id)?.verified_status === 'SOURCE_VERIFIED') push(id);
  }
  for (const work of catalog.works) {
    if (selected.length >= wanted) break;
    push(anilistIdOfWork(work));
  }
  return selected.sort((a, b) => a - b);
}

export function buildCanaryCoverage(
  catalog: NormalizedCatalog,
  workIds: number[],
  externalIdGroups: Array<{ source_name: string; external_id: string; work_ids: number[] }> = [],
): CanaryCoverage {
  const selected = new Set(workIds);
  const byId = new Map(catalog.works.map((work) => [anilistIdOfWork(work), work]));
  const workById = new Map(catalog.works.map((work) => [work.id, work]));
  const personById = new Map(catalog.people.map((person) => [person.id, person]));
  const workIdsByName = new Map<string, Set<number>>();
  for (const credit of catalog.credits) {
    const work = workById.get(credit.work_id);
    if (!work || !selected.has(anilistIdOfWork(work))) continue;
    const person = personById.get(credit.person_id);
    if (!person) continue;
    const key = normalizedTitle(person.canonical_name);
    const ids = workIdsByName.get(key) ?? new Set<number>();
    ids.add(anilistIdOfWork(work));
    workIdsByName.set(key, ids);
  }
  const b1dByCategory: Record<string, number[]> = {};
  for (const hint of catalog.queue_hints) {
    const ids = b1dByCategory[hint.category] ?? [];
    const candidate = hint.comic_anilist_ids[0];
    if (candidate && selected.has(candidate) && !ids.includes(candidate)) ids.push(candidate);
    b1dByCategory[hint.category] = ids;
  }
  const duplicateMalIds = new Set<number>();
  for (const group of externalIdGroups) {
    if (group.source_name !== 'mal') continue;
    for (const anilistId of group.work_ids) duplicateMalIds.add(anilistId);
  }
  const adultStatuses: Record<AdultStatus, number[]> = { unknown: [], verified_non_adult: [], adult: [] };
  for (const id of workIds) {
    const status = byId.get(id)?.content_rating_status ?? 'unknown';
    adultStatuses[status].push(id);
  }
  return {
    work_ids: workIds,
    unknown_kind: workIds.filter((id) => byId.get(id)?.kind === 'unknown'),
    kr_manhwa_review: workIds.filter((id) => byId.get(id)?.country_code === 'KR'),
    cn_manhua_review: workIds.filter((id) => byId.get(id)?.country_code === 'CN'),
    year_conflict: workIds.filter((id) => catalog.conflicts.some((conflict) => conflict.anilist_id === id && conflict.field === 'publication_year')),
    chapters_conflict: workIds.filter((id) => catalog.conflicts.some((conflict) => conflict.anilist_id === id && conflict.field === 'chapters')),
    volumes_conflict: workIds.filter((id) => catalog.conflicts.some((conflict) => conflict.anilist_id === id && conflict.field === 'volumes')),
    mal_conflict: workIds.filter((id) => duplicateMalIds.has(id)
      || catalog.conflicts.some((conflict) => conflict.anilist_id === id && conflict.field === 'mal_id')),
    repeated_author_names: [...workIdsByName].filter(([, ids]) => ids.size > 1).map(([name]) => name).sort(),
    b1d_by_category: b1dByCategory,
    adult_statuses: adultStatuses,
  };
}

export function runDryRun(options: DryRunOptions = {}): ImportReport {
  assertApplyMode(options.mode ?? 'dry-run');
  assertNoRemoteDatabaseEnvironment();
  const repoRoot = options.repoRoot ?? process.cwd();
  const now = options.now ?? new Date().toISOString();
  const artifacts = loadArtifacts(repoRoot, now);
  const graphComics = artifacts.graph.batch.records.filter(isGraphComic);
  const graphRelations = artifacts.graph.batch.relations.filter(isGraphRelation);
  const verified = artifacts.metadata.batch.records.filter(isVerified);
  const candidates = artifacts.candidates.batch.records.filter(isCandidate);
  const queueHints = artifacts.queue.batch.review_hints.filter(isReviewHint);

  if (graphComics.length !== artifacts.graph.batch.records.length) {
    throw new Error('source graph normalization produced non-comic records');
  }
  if (graphRelations.length !== artifacts.graph.batch.relations.length) {
    throw new Error('source graph normalization produced invalid relations');
  }
  if (verified.length !== artifacts.metadata.batch.records.length) {
    throw new Error('metadata normalization produced invalid verified records');
  }
  if (candidates.length !== artifacts.candidates.batch.records.length) {
    throw new Error('candidate normalization produced invalid candidate records');
  }

  const normalized = buildNormalizedCatalog({
    graphComics,
    graphRelations,
    verified,
    candidates,
    queueHints,
    knownAnimeIds: artifacts.knownAnimeIds,
  });
  const catalog = normalized.catalog;
  const dedup = analyzeDuplicates(catalog);
  const plan = buildPlan(catalog, { generatedAt: now, dedup });
  const canaryIds = selectCanaryWorkIds(catalog, options.canarySize ?? 20);
  const canary = buildPlan(catalog, {
    generatedAt: now,
    dedup,
    selectedAnilistIds: new Set(canaryIds),
  });
  const operationCounts = countOperations(plan);
  const warnings = [
    ...artifacts.warnings,
    ...normalized.warnings,
  ];
  if (normalized.skippedAdaptations > 0) {
    warnings.push(`${normalized.skippedAdaptations} adaptation edges were skipped because the anime or comic side is absent`);
  }
  if (canary.works.length < 1) warnings.push('canary selection is empty');
  const errors = [...artifacts.errors];
  const counts = reportCounts(plan, {
    graphComics: graphComics.length,
    graphEdges: graphRelations.length,
    verifiedMetadataRecords: verified.length,
    metadataCandidates: candidates.length,
    verifiedMetaDeclaredTotal: artifacts.metadata.batch.metadata.declared_total ?? 0,
    duplicateCandidates: dedup.analysis.externalIdGroups.length + dedup.analysis.titleGroups.length,
    approvedRights: 0,
    publicChapters: 0,
    b1dHintsTotal: catalog.queue_hints.length,
    b1dHintsUnmatched: 0,
    ambiguousExternalIds: dedup.analysis.externalIdGroups.length,
    authorNameRecords: normalized.authorNameRecords,
    identifiedAuthors: normalized.identifiedAuthors,
  });
  const canaryCoverage = buildCanaryCoverage(catalog, canaryIds, dedup.analysis.externalIdGroups);
  return {
    schema_version: plan.schema_version,
    mode: 'dry-run',
    generated_at: now,
    counts,
    by_table: operationCounts.byTable,
    checksums: artifacts.checksums,
    warnings,
    errors,
    duplicates: {
      externalIdGroups: dedup.analysis.externalIdGroups,
      titleGroups: dedup.analysis.titleGroups,
    },
    plan,
    canary,
    planHash: plan.planHash,
    canaryHash: canary.planHash,
    relationQuality: normalized.relationQuality,
    canaryCoverage,
    sourceReview: artifacts.source_review,
  };
}

export function serializableReport(report: ImportReport): string {
  return JSON.stringify(report, null, 2);
}

export function planOnly(report: ImportReport): {
  plan: ImportPlan;
  canary: ImportPlan;
  planHash: string;
  canaryHash: string;
} {
  return { plan: report.plan, canary: report.canary, planHash: report.planHash, canaryHash: report.canaryHash };
}
