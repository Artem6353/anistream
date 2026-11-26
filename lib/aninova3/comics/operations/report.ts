import { createHash } from 'node:crypto';
import { buildSourceConflicts, type SourceConflictGroup } from './conflicts';
import { buildDashboard, type Dashboard } from './dashboard';
import { buildRelationInspection, type RelationInspection, type RelationLink } from './relations';
import { summarizeReviewItems } from './review';
import type { CatalogSnapshot, ReviewItemRow } from './model';

export const B3D_REPORT_SCHEMA_VERSION = 'b3d.1';
export const B3D_CATALOG_SCHEMA_VERSION = 'b3c.1';

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface PublicationGates {
  all_works_draft: boolean;
  public_works_zero: boolean;
  public_chapters_zero: boolean;
  approved_rights_zero: boolean;
  approved_works_zero: boolean;
  verified_non_adult_zero: boolean;
  adult_zero: boolean;
  relation_primary_zero: boolean;
  relation_public_zero: boolean;
  identified_authors_zero: boolean;
  note: string;
}

export interface ReportComparison {
  available: boolean;
  reason: string | null;
  previous_generated_at: string | null;
  review_queue_delta: { total: number; by_reason: Record<string, number> } | null;
  new_conflict_keys: string[] | null;
  resolved_conflict_keys: string[] | null;
  eligibility_changes: {
    public_works: number;
    public_chapters: number;
    draft: number;
    approved: number;
    published: number;
    approved_rights: number;
  } | null;
}

export interface QualityReport {
  schema_version: string;
  catalog_schema_version: string;
  generated_at: string;
  commit_sha: string;
  source_mode: string;
  dashboard: Dashboard;
  review_queue: {
    total: number;
    by_status: Record<string, number>;
    by_reason: Record<string, number>;
    by_severity: Record<string, number>;
    by_source: Record<string, number>;
  };
  source_conflicts: {
    work_count: number;
    item_count: number;
    observation_conflict_rows: number;
    group_count: number;
    groups_by_field: Record<string, number>;
    keys: string[];
    examples: SourceConflictGroup[];
  };
  relations: {
    summary: RelationInspection['summary'];
    contradictory_anime_ids: number[];
    known_contradictory_ids: number[];
    can_auto_confirm: false;
    highlighted: Array<{ anime_id: number; link_count: number; hint_count: number; links: RelationLink[] }>;
  };
  publication: Dashboard['publication'] & { gates: PublicationGates };
  comparison: ReportComparison;
  warnings: string[];
  errors: string[];
  input_checksums: Record<string, string>;
  report_checksum: string;
}

function publicationGates(dashboard: Dashboard, relationSummary: RelationInspection['summary']): PublicationGates {
  return {
    all_works_draft: dashboard.publication.draft === dashboard.metadata.works_total,
    public_works_zero: dashboard.publication.public_works === 0,
    public_chapters_zero: dashboard.publication.public_chapters === 0,
    approved_rights_zero: dashboard.publication.approved_rights === 0,
    approved_works_zero: dashboard.publication.approved === 0,
    verified_non_adult_zero: dashboard.publication.verified_non_adult === 0,
    adult_zero: dashboard.publication.adult === 0,
    relation_primary_zero: relationSummary.primary === 0,
    relation_public_zero: relationSummary.public === 0,
    identified_authors_zero: dashboard.quality.identified_authors === 0,
    note: 'Гейты проверяются по read-only counters. Публикация и чтение глав не выводятся из наличия метаданных.',
  };
}

function buildComparison(
  current: Dashboard,
  currentConflictKeys: string[],
  previous: QualityReport | null,
): ReportComparison {
  if (!previous) {
    return {
      available: false,
      reason: 'previous_report_not_provided',
      previous_generated_at: null,
      review_queue_delta: null,
      new_conflict_keys: null,
      resolved_conflict_keys: null,
      eligibility_changes: null,
    };
  }
  const previousReasons = previous.review_queue?.by_reason ?? {};
  const byReason: Record<string, number> = {};
  for (const [reason, count] of Object.entries(current.review.by_reason)) {
    byReason[reason] = count - (previousReasons[reason] ?? 0);
  }
  const previousKeys = new Set(previous.source_conflicts?.keys ?? []);
  const currentKeys = new Set(currentConflictKeys);
  return {
    available: true,
    reason: null,
    previous_generated_at: previous.generated_at ?? null,
    review_queue_delta: {
      total: current.review.total - (previous.review_queue?.total ?? 0),
      by_reason: byReason,
    },
    new_conflict_keys: currentConflictKeys.filter((key) => !previousKeys.has(key)),
    resolved_conflict_keys: [...previousKeys].filter((key) => !currentKeys.has(key)).sort(),
    eligibility_changes: {
      public_works: current.publication.public_works - (previous.publication?.public_works ?? 0),
      public_chapters: current.publication.public_chapters - (previous.publication?.public_chapters ?? 0),
      draft: current.publication.draft - (previous.publication?.draft ?? 0),
      approved: current.publication.approved - (previous.publication?.approved ?? 0),
      published: current.publication.published - (previous.publication?.published ?? 0),
      approved_rights: current.publication.approved_rights - (previous.publication?.approved_rights ?? 0),
    },
  };
}

export function buildQualityReport(input: {
  snapshot: CatalogSnapshot;
  previous?: QualityReport | null;
  generatedAt: string;
  commitSha: string;
  inputChecksums: Record<string, string>;
  warnings?: string[];
  errors?: string[];
}): QualityReport {
  const { snapshot } = input;
  const dashboard = buildDashboard(snapshot);
  const summary = summarizeReviewItems(snapshot.review_items);
  const conflictGroups = buildSourceConflicts(snapshot.observations, snapshot.review_items);
  const conflictKeys = conflictGroups.map((group) => group.key).sort();
  const groupsByField: Record<string, number> = {};
  for (const group of conflictGroups) groupsByField[group.field] = (groupsByField[group.field] ?? 0) + 1;
  const relations = buildRelationInspection(snapshot.adaptations, snapshot.works, snapshot.review_items);
  const warnings = [...(input.warnings ?? [])];
  if (snapshot.observations.length === 0 && dashboard.quality.source_conflict_items > 0) {
    warnings.push('Source observations не загружены в snapshot: conflict groups/examples недоступны, счётчики review queue сохранены.');
  }
  const report: QualityReport = {
    schema_version: B3D_REPORT_SCHEMA_VERSION,
    catalog_schema_version: B3D_CATALOG_SCHEMA_VERSION,
    generated_at: input.generatedAt,
    commit_sha: input.commitSha,
    source_mode: snapshot.source,
    dashboard,
    review_queue: {
      total: summary.total,
      by_status: summary.by_status,
      by_reason: summary.by_reason,
      by_severity: summary.by_severity,
      by_source: summary.by_source,
    },
    source_conflicts: {
      work_count: dashboard.quality.source_conflict_works,
      item_count: dashboard.quality.source_conflict_items,
      observation_conflict_rows: snapshot.counts.source_observation_conflicts,
      group_count: conflictGroups.length,
      groups_by_field: groupsByField,
      keys: conflictKeys,
      examples: conflictGroups.slice(0, 5),
    },
    relations: {
      summary: relations.summary,
      contradictory_anime_ids: dashboard.quality.contradictory_anime_ids,
      known_contradictory_ids: relations.knownContradictoryIds,
      can_auto_confirm: false,
      highlighted: relations.knownContradictoryIds.map((animeId) => {
        const links = relations.links.filter((link) => link.animeId === animeId);
        return {
          anime_id: animeId,
          link_count: links.length,
          hint_count: relations.contradictions.find((entry) => entry.animeId === animeId)?.hintCount ?? 0,
          links,
        };
      }),
    },
    publication: {
      ...dashboard.publication,
      gates: publicationGates(dashboard, relations.summary),
    },
    comparison: buildComparison(dashboard, conflictKeys, input.previous ?? null),
    warnings,
    errors: [...(input.errors ?? [])],
    input_checksums: { ...input.inputChecksums },
    report_checksum: '',
  };
  report.report_checksum = sha256Hex(canonicalJson({ ...report, report_checksum: undefined }));
  return report;
}

export function reportFileContent(report: QualityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function reviewReasonCounts(items: ReviewItemRow[]): Record<string, number> {
  return summarizeReviewItems(items).by_reason;
}
