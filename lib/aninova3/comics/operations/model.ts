export type JsonObject = Record<string, unknown>;

/**
 * B3-D read-only operations view models.
 *
 * These types mirror only the columns the review UI needs. They deliberately
 * omit write paths: every B3-D surface is a projection over existing tables.
 */

export interface ComicWorkRow {
  id: string;
  internal_key: string;
  slug: string;
  title_ru: string | null;
  title_ru_status: string;
  kind: string;
  country_code: string | null;
  publication_year: number | null;
  publishing_status: string;
  is_adult: boolean;
  publication_status: string;
  published_at: string | null;
  source_kind_raw: string | null;
  content_rating_status: string;
  total_chapters_known: number | null;
  volumes_known: number | null;
  cover_url: string | null;
  updated_at: string;
}

export interface ComicPersonRow {
  id: string;
  canonical_name: string;
  display_name_ru: string | null;
  name_status: string;
  identity_status: string;
  name_bucket_key: string | null;
  source_name: string;
  source_person_id: string | null;
  source_url: string | null;
  verification_status: string;
  is_public: boolean;
}

export type ReviewStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';
export type ReviewSeverity = 'low' | 'medium' | 'high';
export type ReviewReason =
  | 'missing_ru_title'
  | 'name_mismatch'
  | 'duplicate_alias'
  | 'duplicate_external_id'
  | 'ambiguous_external_id'
  | 'rights_unknown'
  | 'rights_expired'
  | 'source_conflict'
  | 'unsupported_relation'
  | 'unsupported_reading_mode'
  | 'manual'
  | 'source_metadata_conflict'
  | 'kind_unknown'
  | 'duplicate_public_title'
  | 'relation_evidence_conflict'
  | 'ambiguous_people_identity'
  | 'missing_provenance';

export interface ReviewItemRow {
  id: string;
  work_id: string | null;
  item_type: string;
  item_ref: string | null;
  reason: ReviewReason;
  severity: ReviewSeverity;
  status: ReviewStatus;
  priority: number;
  details: JsonObject;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface SourceObservationRow {
  id: string;
  work_id: string;
  field_name: string;
  source_name: string;
  external_id: string | null;
  join_key: string | null;
  source_url: string | null;
  observed_at: string;
  confidence: number | null;
  verification_status: string;
  source_payload_hash: string;
  value_json: unknown;
  is_conflict: boolean;
  conflict_group: string | null;
  created_at: string;
}

export interface ExternalIdRow {
  id: string;
  work_id: string;
  source_name: string;
  external_id: string;
  source_url: string | null;
  is_primary: boolean;
  fetched_at: string;
  last_verified_at: string | null;
  verification_status: string;
  confidence: number | null;
  source_payload_hash: string | null;
}

export interface AliasRow {
  id: string;
  work_id: string;
  alias: string;
  alias_type: string;
  language: string;
  is_public: boolean;
  source_name: string;
  source_url: string | null;
  fetched_at: string;
  checked_at: string | null;
  confidence: number | null;
  verification_status: string;
}

export interface AdaptationRow {
  id: string;
  anime_id: number;
  comic_work_id: string;
  raw_relation_type: string;
  normalized_relation_type: string;
  direction: string;
  confidence_level: string;
  basis: string;
  is_primary: boolean;
  source_name: string;
  source_url: string | null;
  observed_at: string;
  checked_at: string | null;
  verification_status: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApprovedRightRow {
  id: string;
  work_id: string;
  reading_source_id: string | null;
  permission: string;
  status: string;
  evidence_ref: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
}

export interface CatalogCounts {
  external_ids: number;
  aliases: number;
  credits: number;
  source_observations: number;
  source_observation_conflicts: number;
  source_observations_missing_url: number;
  chapters: number;
  chapters_with_pages: number;
  public_chapters: number;
  reading_sources: number;
  reading_sources_active: number;
  public_works: number;
}

export interface CatalogSnapshot {
  generated_at: string;
  source: 'database' | 'dry-run-plan';
  works: ComicWorkRow[];
  people: ComicPersonRow[];
  review_items: ReviewItemRow[];
  adaptations: AdaptationRow[];
  observations: SourceObservationRow[];
  approved_rights: ApprovedRightRow[];
  counts: CatalogCounts;
}

export const REVIEW_REASONS: ReviewReason[] = [
  'missing_ru_title',
  'name_mismatch',
  'duplicate_alias',
  'duplicate_external_id',
  'ambiguous_external_id',
  'rights_unknown',
  'rights_expired',
  'source_conflict',
  'unsupported_relation',
  'unsupported_reading_mode',
  'manual',
  'source_metadata_conflict',
  'kind_unknown',
  'duplicate_public_title',
  'relation_evidence_conflict',
  'ambiguous_people_identity',
  'missing_provenance',
];

export const REVIEW_STATUSES: ReviewStatus[] = ['open', 'in_review', 'resolved', 'dismissed'];
export const REVIEW_SEVERITIES: ReviewSeverity[] = ['low', 'medium', 'high'];

/** B3-C measured evidence conflict; it is not proof of adaptation direction. */
export const CONTRADICTORY_ANIME_IDS = [85, 2291, 9963, 164212] as const;

export const SOURCE_CONFLICT_REASONS: ReviewReason[] = ['source_conflict', 'source_metadata_conflict'];
export const AMBIGUOUS_EXTERNAL_ID_REASONS: ReviewReason[] = ['ambiguous_external_id', 'duplicate_external_id'];
export const RELATION_CONFLICT_REASONS: ReviewReason[] = ['relation_evidence_conflict'];
export const AUTHOR_IDENTITY_REASONS: ReviewReason[] = ['ambiguous_people_identity'];
export const DUPLICATE_CANDIDATE_REASONS: ReviewReason[] = [
  'duplicate_alias',
  'duplicate_external_id',
  'duplicate_public_title',
];

export function isReviewReason(value: string): value is ReviewReason {
  return (REVIEW_REASONS as string[]).includes(value);
}

export function isReviewStatus(value: string): value is ReviewStatus {
  return (REVIEW_STATUSES as string[]).includes(value);
}

export function asRecord(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : [];
}

export function workLabel(work: ComicWorkRow | null | undefined): string {
  if (!work) return 'Без привязки к работе';
  return `${work.internal_key}${work.title_ru ? ` · ${work.title_ru}` : ' · RU-название не подтверждено'}`;
}

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'ru');
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}
