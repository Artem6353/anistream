import type { ImportOperation, ImportPlan, ImportReport } from '../import/types';
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

type Row = Record<string, unknown>;

function rowsFor<T>(plan: ImportPlan, table: string): T[] {
  return plan.operations
    .filter((operation): operation is ImportOperation<Row> & { op: 'INSERT'; row: Row } =>
      operation.table === table && operation.op === 'INSERT' && operation.row !== null)
    .map((operation) => operation.row as T);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function normalizeWork(row: Row, fallbackTime: string): ComicWorkRow {
  return {
    id: String(row.id),
    internal_key: String(row.internal_key),
    slug: String(row.slug),
    title_ru: text(row.title_ru),
    title_ru_status: String(row.title_ru_status ?? 'unverified'),
    kind: String(row.kind ?? 'unknown'),
    country_code: text(row.country_code),
    publication_year: numberOrNull(row.publication_year),
    publishing_status: String(row.publishing_status ?? 'unknown'),
    is_adult: booleanValue(row.is_adult),
    publication_status: String(row.publication_status ?? 'draft'),
    published_at: text(row.published_at),
    source_kind_raw: text(row.source_kind_raw),
    content_rating_status: String(row.content_rating_status ?? 'unknown'),
    total_chapters_known: numberOrNull(row.total_chapters_known),
    volumes_known: numberOrNull(row.volumes_known),
    cover_url: text(row.cover_url),
    updated_at: text(row.updated_at) ?? fallbackTime,
  };
}

function normalizePerson(row: Row): ComicPersonRow {
  return {
    id: String(row.id),
    canonical_name: String(row.canonical_name),
    display_name_ru: text(row.display_name_ru),
    name_status: String(row.name_status ?? 'unverified'),
    identity_status: String(row.identity_status ?? 'unidentified_name_bucket'),
    name_bucket_key: text(row.name_bucket_key),
    source_name: String(row.source_name),
    source_person_id: text(row.source_person_id),
    source_url: text(row.source_url),
    verification_status: String(row.verification_status ?? 'recorded'),
    is_public: booleanValue(row.is_public),
  };
}

function normalizeReview(row: Row, fallbackTime: string): ReviewItemRow {
  return {
    id: String(row.id),
    work_id: text(row.work_id),
    item_type: String(row.item_type),
    item_ref: text(row.item_ref),
    reason: String(row.reason) as ReviewItemRow['reason'],
    severity: String(row.severity ?? 'medium') as ReviewItemRow['severity'],
    status: String(row.status ?? 'open') as ReviewItemRow['status'],
    priority: typeof row.priority === 'number' ? row.priority : 50,
    details: row.details !== null && typeof row.details === 'object' && !Array.isArray(row.details) ? row.details as Record<string, unknown> : {},
    created_at: text(row.created_at) ?? fallbackTime,
    updated_at: text(row.updated_at) ?? fallbackTime,
    resolved_at: text(row.resolved_at),
    resolved_by: text(row.resolved_by),
  };
}

function normalizeObservation(row: Row): SourceObservationRow {
  return {
    id: String(row.id),
    work_id: String(row.work_id),
    field_name: String(row.field_name),
    source_name: String(row.source_name),
    external_id: text(row.external_id),
    join_key: text(row.join_key),
    source_url: text(row.source_url),
    observed_at: String(row.observed_at),
    confidence: numberOrNull(row.confidence),
    verification_status: String(row.verification_status ?? 'recorded'),
    source_payload_hash: String(row.source_payload_hash),
    value_json: row.value_json,
    is_conflict: booleanValue(row.is_conflict),
    conflict_group: text(row.conflict_group),
    created_at: String(row.created_at ?? row.observed_at),
  };
}

function normalizeAdaptation(row: Row): AdaptationRow {
  return {
    id: String(row.id),
    anime_id: Number(row.anime_id),
    comic_work_id: String(row.comic_work_id),
    raw_relation_type: String(row.raw_relation_type),
    normalized_relation_type: String(row.normalized_relation_type ?? 'unknown'),
    direction: String(row.direction ?? 'unknown'),
    confidence_level: String(row.confidence_level ?? 'unknown'),
    basis: String(row.basis ?? 'unknown'),
    is_primary: booleanValue(row.is_primary),
    source_name: String(row.source_name),
    source_url: text(row.source_url),
    observed_at: String(row.observed_at),
    checked_at: text(row.checked_at),
    verification_status: String(row.verification_status ?? 'recorded'),
    is_public: booleanValue(row.is_public),
    created_at: String(row.created_at ?? row.observed_at),
    updated_at: String(row.updated_at ?? row.observed_at),
  };
}

function approvedRights(row: Row): ApprovedRightRow {
  return {
    id: String(row.id),
    work_id: String(row.work_id),
    reading_source_id: text(row.reading_source_id),
    permission: String(row.permission),
    status: String(row.status),
    evidence_ref: text(row.evidence_ref),
    reviewed_by: text(row.reviewed_by),
    reviewed_at: text(row.reviewed_at),
    valid_from: text(row.valid_from),
    valid_until: text(row.valid_until),
  };
}


export function buildSnapshotFromPlan(report: ImportReport): CatalogSnapshot {
  const at = report.generated_at;
  const plan: ImportPlan = report.plan;
  const works = rowsFor<Row>(plan, 'comic_works').map((row) => normalizeWork(row, at));
  const people = rowsFor<Row>(plan, 'comic_people').map(normalizePerson);
  const reviewItems = rowsFor<Row>(plan, 'comic_review_queue').map((row) => normalizeReview(row, at));
  const observations = rowsFor<Row>(plan, 'comic_source_observations').map(normalizeObservation);
  const adaptations = rowsFor<Row>(plan, 'comic_adaptations').map(normalizeAdaptation);
  const externalIds = rowsFor<Row>(plan, 'comic_external_ids') as unknown as ExternalIdRow[];
  const aliases = rowsFor<Row>(plan, 'comic_aliases') as unknown as AliasRow[];
  const rights = rowsFor<Row>(plan, 'comic_rights').map(approvedRights).filter((right) => right.status === 'approved');
  const chapters = rowsFor<Row>(plan, 'comic_chapters');
  const readingSources = rowsFor<Row>(plan, 'comic_reading_sources');
  const credits = rowsFor<Row>(plan, 'comic_credits');
  return {
    generated_at: at,
    source: 'dry-run-plan',
    works,
    people,
    review_items: reviewItems,
    adaptations,
    observations,
    approved_rights: rights,
    counts: {
      external_ids: externalIds.length,
      aliases: aliases.length,
      credits: credits.length,
      source_observations: observations.length,
      source_observation_conflicts: observations.filter((row) => row.is_conflict).length,
      source_observations_missing_url: observations.filter((row) => row.source_url === null).length,
      chapters: chapters.length,
      chapters_with_pages: chapters.filter((row) => typeof row.page_count === 'number' && row.page_count > 0).length,
      public_chapters: 0,
      reading_sources: readingSources.length,
      reading_sources_active: readingSources.filter((row) => row.is_active === true).length,
      public_works: 0,
    },
  };
}

export function planRows<T>(plan: ImportPlan, table: string): T[] {
  return rowsFor<T>(plan, table);
}
