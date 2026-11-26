/**
 * B3-B import contracts. These types are the boundary between saved source
 * artifacts, normalization, deduplication and a later explicitly-approved apply.
 * They do not represent public API models and must not be imported by UI code.
 */

export const B3B_PIPELINE_VERSION = 'b3b.1' as const;

export type TermsReviewStatus = 'unknown' | 'pending_review' | 'approved' | 'rejected' | 'expired';
export type SourceVerificationStatus =
  | 'recorded'
  | 'source_verified'
  | 'candidate'
  | 'conflict'
  | 'disputed'
  | 'rejected';

export type SourceName = 'anilist' | 'shikimori' | 'mal' | 'b1d_review_queue' | 'anilist_candidates';

export interface SourceEnvelope {
  source_name: SourceName;
  external_id: string;
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
  status: string;
  reason: string | null;
  checked_at: string | null;
}

export interface ReviewHintRecord extends SourceEnvelope {
  duplicate_mal: Array<{ mal_id: number; anilist_ids: number[] }>;
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

export type WorkKind = 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'comic' | 'one_shot';
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
  source_name: 'anilist';
  source_person_id: null;
  source_url: string;
  fetched_at: string;
  checked_at: null;
  confidence: number;
  verification_status: 'recorded';
  is_public: false;
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
  direction: 'unknown';
  confidence_level: 'unknown';
  basis: 'anilist_relation_only';
  is_primary: false;
  source_name: 'anilist';
  source_url: string;
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
    | 'unsupported_relation'
    | 'unsupported_reading_mode'
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

export interface NormalizedCatalog extends NormalizedBatch {
  annotations: Map<number, WorkAnnotations>;
  queue_hints: ReviewHintRecord[];
}

export interface NormalizedBatch {
  works: NormalizedWork[];
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
  readyExternalIds: number;
  readyAliases: number;
  readyPeople: number;
  readyCredits: number;
  readyAdaptations: number;
  skippedOperations: number;
  requiresReview: number;
  duplicateCandidates: number;
  rejectedWorks: number;
  approvedRights: number;
  publicChapters: number;
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
  sourceReview: SourceReviewRecord[];
}
