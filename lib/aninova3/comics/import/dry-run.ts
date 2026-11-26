import { loadArtifacts } from './artifacts';
import { buildNormalizedCatalog } from './normalize';
import { analyzeDuplicates } from './dedup';
import { buildPlan, countOperations, reportCounts } from './planner';
import { assertApplyMode, assertNoRemoteDatabaseEnvironment } from './safety';
import type {
  CandidateRecord,
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

function isReviewHint(record: { duplicate_mal?: unknown }): record is ReviewHintRecord {
  return Array.isArray(record.duplicate_mal);
}

export function selectCanaryWorkIds(catalog: NormalizedCatalog, size = 20): number[] {
  const wanted = Math.max(1, Math.min(50, Math.floor(size)));
  const all = new Set(catalog.works.map((work) => Number(work.internal_key.split(':').at(-1))));
  const selected: number[] = [];
  const seen = new Set<number>();
  const push = (id: number): void => {
    if (!all.has(id) || seen.has(id) || selected.length >= wanted) return;
    seen.add(id);
    selected.push(id);
  };
  for (const id of DEFAULT_CANARY_IDS) push(id);
  for (const work of catalog.works) {
    if (selected.length >= wanted) break;
    const id = Number(work.internal_key.split(':').at(-1));
    if (catalog.annotations.get(id)?.verified_status === 'SOURCE_VERIFIED') push(id);
  }
  for (const work of catalog.works) {
    if (selected.length >= wanted) break;
    push(Number(work.internal_key.split(':').at(-1)));
  }
  return selected.sort((a, b) => a - b);
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
    warnings.push(`${normalized.skippedAdaptations} adaptation edges were skipped because the anime id is absent from titles.json`);
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
  });
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
