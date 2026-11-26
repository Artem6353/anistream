/**
 * B3-B import contracts. These types are the boundary between saved source
 * artifacts, normalization, deduplication and a later explicitly-approved apply.
 * They do not represent public API models and must not be imported by UI code.
 */

export const B3C_PIPELINE_VERSION = 'b3c.1' as const;
export const B3B_PIPELINE_VERSION = B3C_PIPELINE_VERSION;

export type TermsReviewStatus = 'unknown' | 'pending_review' | 'approved' | 'rejected' | 'expired';
export type SourceVerificationStatus =
  | 'recorded'
  | 'source_verified'
  | 'candidate'
  | 'conflict'
  | 'disputed'
  | 'rejected';

export type SourceName = 'anilist' | 'shikimori' | 'mal' | 'b1d_review_queue' | 'shikimori_candidates';
export type WorkKind = 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'comic' | 'one_shot' | 'unknown';
export type AdultStatus = 'unknown' | 'verified_non_adult' | 'adult';
export type PersonIdentityStatus = 'unidentified_name_bucket' | 'source_identified' | 'manually_verified';

export interface SourceEnvelope {
  source_name: SourceName;
  /** Identifier issued by this exact source, or null when the source has none. */
  external_id: string | null;
  /** Cross-source resolution key (AniList id here); never presented as a source id. */
  join_key: string | null;
  source_url: string | null;
  fetched_at: string;
  source_snapshot_at: string;
  terms_review_status: TermsReviewStatus;
  attribution_requirements: string[];
  confidence: number | null;
  verification_status: SourceVerificationStatus;
  source_payload_hash: string;
}

export interface GraphComicRecord extends SourceEnvelope {
  anilist_id: number;
  mal_id: number | null;
  format: 'MANGA' | 'ONE_SHOT';
  country: string | null;
  title_original: string;
  title_native: string | null;
  year: number | null;
  status: string;
  chapters: number | null;
  volumes: number | null;
  cover_url: string | null;
  authors: string[];
}

export interface GraphRelationRecord extends SourceEnvelope {
  anime_id: number;
  comic_anilist_id: number;
  raw_relation_type: string;
  observed_at: string;
}

export interface VerifiedMetadataRecord extends SourceEnvelope {
  anilist_id: number;
  status: 'SOURCE_VERIFIED' | 'NAME_MISMATCH' | 'PENDING_REVIEW' | 'NO_RU_TITLE' | 'UNKNOWN';
  mal_id: number | null;
  shikimori_id: number | null;
  title_ru: string | null;
  license_name_ru: string | null;
  genres: string[];
  kind: string | null;
  year: number | null;
  volumes: number | null;
  chapters: number | null;
  cover_url: string | null;
  checked_at: string | null;
  defects: string[];
  anime_ids: number[];
}

export interface CandidateRecord extends SourceEnvelope {
  anilist_id: number;
  mal_id: number | null;
  title_ru: string | null;
  kind: string | null;
  year: number | null;
  status: string;
  reason: string | null;
  checked_at: string | null;
}

export type B1DReviewCategory =
  | 'multiSourceNeedsReview'
  | 'comicAdaptsAnime'
  | 'adaptationAfterAnime'
  | 'duplicateMal';

export type B1DLinkStatus = 'unverified' | 'matched' | 'partial' | 'unmatched';

/** One original B1D review row. The full source payload is retained verbatim. */
export interface ReviewHintRecord extends SourceEnvelope {
  category: B1DReviewCategory;
  anime_ids: number[];
  comic_anilist_ids: number[];
  payload: Record<string, unknown>;
  link_status: B1DLinkStatus;
  row_count: number;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  record_id?: string;
}

export interface AdapterContext {
  now: string;
  artifact_path: string;
  artifact_checksum: string;
}

export type AdapterRecord = GraphComicRecord | VerifiedMetadataRecord | CandidateRecord;

export interface AdapterBatch {
  records: AdapterRecord[];
  relations: GraphRelationRecord[];
  review_hints: ReviewHintRecord[];
  issues: ValidationIssue[];
  metadata: { declared_total: number | null; generated_at: string | null };
}

/**
 * A source adapter only reads already-saved artifacts. It must never fetch a
 * network resource, and it must not promote a source fact into a public title.
 */
export interface SourceAdapter {
  readonly source_name: SourceName;
  readonly adapter_version: string;
  readonly artifact_path: string;
  read(raw: unknown): unknown;
  validate(value: unknown): ValidationIssue[];
  normalize(value: unknown, context: AdapterContext): AdapterBatch;
}

export type TitleStatus =
  | 'unverified'
  | 'candidate'
  | 'source_verified'
  | 'editorially_verified'
  | 'name_mismatch'
  | 'no_ru_title'
  | 'rejected';

export interface NormalizedWork {
  id: string;
  internal_key: string;
  slug: string;
  title_ru: string | null;
  title_ru_status: TitleStatus;
  kind: WorkKind;
  /** Raw source format, preserved separately from the normalized kind. */
  source_kind_raw: string;
  country_code: string | null;
  publication_year: number | null;
  release_date: null;
  release_date_precision: 'unknown';
  publishing_status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
  description_ru: null;
  cover_url: string | null;
  total_chapters_known: number | null;
  volumes_known: number | null;
  genres: string[];
  is_adult: false;
  content_rating_status: AdultStatus;
  content_rating_source: string | null;
  content_rating_checked_at: string | null;
  content_rating_evidence_url: string | null;
  publication_status: 'draft';
  published_at: null;
  origin_source_name: 'anilist';
  origin_source_url: string;
  origin_fetched_at: string;
  metadata_checked_at: string | null;
  metadata_confidence: number | null;
}

export interface NormalizedExternalId {
  id: string;
  work_id: string;
  source_name: 'anilist' | 'mal' | 'shikimori';
  external_id: string;
  source_url: string | null;
  is_primary: boolean;
  fetched_at: string;
  last_verified_at: string;
  verification_status: 'recorded' | 'source_verified';
  confidence: number;
  source_payload_hash: string;
}

export interface NormalizedAlias {
  id: string;
  work_id: string;
  alias: string;
  alias_type: 'official_russian' | 'alternative_title' | 'transliteration' | 'search_alias' | 'original_title' | 'native_title';
  language: string;
  is_public: boolean;
  source_name: 'anilist' | 'shikimori';
  source_url: string | null;
  fetched_at: string;
  checked_at: string | null;
  confidence: number;
  verification_status: 'candidate' | 'source_verified' | 'conflict';
}

export interface NormalizedPerson {
  id: string;
  canonical_name: string;
  display_name_ru: null;
  name_status: 'unverified';
  identity_status: PersonIdentityStatus;
  name_bucket_key: string;
  source_name: 'anilist';
  source_person_id: null;
  source_url: string;
  fetched_at: string;
  checked_at: null;
  confidence: number;
  verification_status: 'recorded';
  is_public: false;
}

export type NormalizedRelationType =
  | 'ADAPTATION'
  | 'ALTERNATIVE'
  | 'CHARACTER'
  | 'PARENT'
  | 'PREQUEL'
  | 'SEQUEL'
  | 'SIDE_STORY'
  | 'SPIN_OFF'
  | 'OTHER'
  | 'unknown';

export type ObservationField =
  | 'kind'
  | 'publication_year'
  | 'chapters'
  | 'volumes'
  | 'mal_id'
  | 'shikimori_id'
  | 'title_ru'
  | 'title_original'
  | 'adult_status';

export interface NormalizedSourceObservation {
  id: string;
  work_id: string;
  field_name: ObservationField;
  source_name: SourceName;
  external_id: string | null;
  join_key: string | null;
  source_url: string | null;
  observed_at: string;
  confidence: number | null;
  verification_status: SourceVerificationStatus;
  source_payload_hash: string;
  value_json: string | number | boolean;
  is_conflict: boolean;
  conflict_group: string | null;
}

export interface WorkConflict {
  work_id: string;
  anilist_id: number;
  field: ObservationField;
  conflict_group: string;
  values: Array<{
    source_name: SourceName;
    external_id: string | null;
    join_key: string | null;
    value: string | number | boolean;
    source_url: string | null;
    observed_at: string;
    confidence: number | null;
    source_payload_hash: string;
  }>;
}

export interface NormalizedCredit {
  id: string;
  work_id: string;
  person_id: string;
  role: 'author';
  billing_order: number;
  source_name: 'anilist';
  source_url: string;
  fetched_at: string;
  checked_at: null;
  confidence: number;
  verification_status: 'recorded';
  is_public: false;
}

export interface NormalizedAdaptation {
  id: string;
  anime_id: number;
  comic_work_id: string;
  raw_relation_type: string;
  normalized_relation_type: NormalizedRelationType;
  direction: 'unknown';
  confidence_level: 'unknown';
  basis: 'anilist_relation_only';
  is_primary: false;
  source_name: 'anilist';
  source_url: string | null;
  observed_at: string;
  checked_at: null;
  verification_status: 'recorded';
  is_public: false;
}

export interface NormalizedReviewItem {
  id: string;
  work_id: string | null;
  item_type: 'work' | 'external_id' | 'alias' | 'person' | 'credit' | 'relation' | 'adaptation' | 'chapter' | 'rights' | 'reading_source' | 'sync_run';
  item_ref: string | null;
  reason:
    | 'missing_ru_title'
    | 'name_mismatch'
    | 'duplicate_alias'
    | 'duplicate_external_id'
    | 'ambiguous_external_id'
    | 'rights_unknown'
    | 'rights_expired'
    | 'source_conflict'
    | 'source_metadata_conflict'
    | 'unsupported_relation'
    | 'unsupported_reading_mode'
    | 'kind_unknown'
    | 'duplicate_public_title'
    | 'relation_evidence_conflict'
    | 'ambiguous_people_identity'
    | 'missing_provenance'
    | 'manual';
  severity: 'low' | 'medium' | 'high';
  status: 'open';
  priority: number;
  details: Record<string, unknown>;
}

export interface ImportOperation<T> {
  table: string;
  op: 'INSERT' | 'UPDATE' | 'SKIP' | 'REJECT';
  key: string;
  id: string | null;
  row: T | null;
  conflict_key: string | null;
  reason: string | null;
}

export interface InsertOperation<T> extends Omit<ImportOperation<T>, 'op' | 'row'> {
  op: 'INSERT';
  row: T;
}

export interface WorkAnnotations {
  anilist_id: number;
  verified_status: VerifiedMetadataRecord['status'] | null;
  has_verified: boolean;
  conflicts: string[];
  mal_id: number | null;
  shikimori_id: number | null;
  candidate_title: string | null;
}

export interface RelationQualityIssue {
  code:
    | 'missing_anime'
    | 'missing_comic'
    | 'duplicate_edge'
    | 'contradictory_direction'
    | 'multiple_primary'
    | 'unknown_relation_type'
    | 'missing_evidence';
  anime_id: number | null;
  comic_anilist_id: number | null;
  raw_relation_type: string | null;
  detail: string;
}

export interface RelationQuality {
  totalEdges: number;
  insertedEdges: number;
  missingAnime: number;
  missingComic: number;
  duplicateEdges: number;
  contradictoryDirections: number;
  multiplePrimary: number;
  unknownRawTypes: number;
  missingEvidence: number;
  unknownRawTypeNames: string[];
  issues: RelationQualityIssue[];
}

export interface NormalizedCatalog extends NormalizedBatch {
  annotations: Map<number, WorkAnnotations>;
  queue_hints: ReviewHintRecord[];
  source_observations: NormalizedSourceObservation[];
  conflicts: WorkConflict[];
  relation_quality: RelationQuality;
}

export interface NormalizedBatch {
  works: NormalizedWork[];
  source_observations: NormalizedSourceObservation[];
  external_ids: NormalizedExternalId[];
  aliases: NormalizedAlias[];
  people: NormalizedPerson[];
  credits: NormalizedCredit[];
  adaptations: NormalizedAdaptation[];
  relations: never[];
  review_queue: NormalizedReviewItem[];
}

export interface ImportPlan {
  schema_version: typeof B3B_PIPELINE_VERSION;
  operations: Array<ImportOperation<Record<string, unknown>>>;
  workIds: number[];
  works: Array<InsertOperation<NormalizedWork>>;
  sourceObservations: Array<InsertOperation<NormalizedSourceObservation>>;
  externalIds: Array<InsertOperation<NormalizedExternalId>>;
  aliases: Array<InsertOperation<NormalizedAlias>>;
  people: Array<InsertOperation<NormalizedPerson>>;
  credits: Array<InsertOperation<NormalizedCredit>>;
  adaptations: Array<InsertOperation<NormalizedAdaptation>>;
  relations: Array<InsertOperation<never>>;
  reviewQueue: Array<InsertOperation<NormalizedReviewItem>>;
  readingSources: Array<ImportOperation<never>>;
  chapters: Array<ImportOperation<never>>;
  rights: Array<ImportOperation<never>>;
  generatedAt: string;
  planHash: string;
  relationQuality: RelationQuality;
}

export interface ExternalIdGroup {
  source_name: 'mal' | 'shikimori';
  external_id: string;
  work_ids: number[];
  internal_keys: string[];
}

export interface TitleGroup {
  normalized_title: string;
  work_ids: number[];
  internal_keys: string[];
}

export interface DuplicateAnalysis {
  externalIdGroups: ExternalIdGroup[];
  titleGroups: TitleGroup[];
  ambiguousExternalIds: Set<string>;
}

export interface ReportCounts {
  sourceGraphComics: number;
  sourceGraphEdges: number;
  verifiedMetadataRecords: number;
  metadataCandidates: number;
  verifiedMetaDeclaredTotal: number;
  normalizedWorks: number;
  readyWorks: number;
  readySourceObservations: number;
  readyExternalIds: number;
  readyAliases: number;
  readyPeople: number;
  readyCredits: number;
  readyAdaptations: number;
  skippedOperations: number;
  requiresReview: number;
  reviewItems: number;
  duplicateCandidates: number;
  rejectedWorks: number;
  approvedRights: number;
  publicChapters: number;
  worksWithVerifiedRuTitle: number;
  worksUnknownKind: number;
  worksWithSourceConflicts: number;
  worksAdultUnknown: number;
  worksVerifiedNonAdult: number;
  worksAdult: number;
  ambiguousExternalIds: number;
  b1dHintsTotal: number;
  b1dHintsQueued: number;
  b1dHintsUnmatched: number;
  b1dHintsByCategory: Record<string, number>;
  authorNameRecords: number;
  authorNameBuckets: number;
  identifiedAuthors: number;
  relationMissingAnime: number;
  relationMissingComic: number;
  relationDuplicateEdges: number;
  relationUnknownTypes: number;
}

export interface SourceReviewRecord {
  source_name: string;
  artifact_path: string;
  checksum: string;
  terms_review_status: TermsReviewStatus;
  attribution_requirements: string[];
  records_read: number;
  meta_total: number | null;
}

export interface ImportReport {
  schema_version: typeof B3B_PIPELINE_VERSION;
  mode: 'dry-run';
  generated_at: string;
  counts: ReportCounts;
  by_table: Record<string, { INSERT: number; UPDATE: number; SKIP: number; REJECT: number }>;
  checksums: Record<string, string>;
  warnings: string[];
  errors: string[];
  duplicates: {
    externalIdGroups: ExternalIdGroup[];
    titleGroups: TitleGroup[];
  };
  plan: ImportPlan;
  canary: ImportPlan;
  planHash: string;
  canaryHash: string;
  relationQuality: RelationQuality;
  canaryCoverage: CanaryCoverage;
  sourceReview: SourceReviewRecord[];
}

export interface CanaryCoverage {
  work_ids: number[];
  unknown_kind: number[];
  kr_manhwa_review: number[];
  cn_manhua_review: number[];
  year_conflict: number[];
  chapters_conflict: number[];
  volumes_conflict: number[];
  mal_conflict: number[];
  repeated_author_names: string[];
  b1d_by_category: Record<string, number[]>;
  adult_statuses: Record<AdultStatus, number[]>;
}
