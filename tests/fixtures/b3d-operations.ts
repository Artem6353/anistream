import type {
  AdaptationRow,
  AliasRow,
  ApprovedRightRow,
  CatalogSnapshot,
  ComicPersonRow,
  ComicWorkRow,
  ExternalIdRow,
  ReviewItemRow,
  ReviewReason,
  SourceObservationRow,
} from '../../lib/aninova3/comics/operations/model';

export const NOW = '2026-06-01T12:00:00.000Z';

export function work(id: string, over: Partial<ComicWorkRow> = {}): ComicWorkRow {
  return {
    id,
    internal_key: `key-${id}`,
    slug: `slug-${id}`,
    title_ru: `Русское ${id}`,
    title_ru_status: 'source_verified',
    kind: 'manga',
    country_code: 'JP',
    publication_year: 2020,
    publishing_status: 'finished',
    is_adult: false,
    publication_status: 'draft',
    published_at: null,
    source_kind_raw: 'MANGA',
    content_rating_status: 'unknown',
    total_chapters_known: 10,
    volumes_known: 1,
    cover_url: null,
    updated_at: NOW,
    ...over,
  };
}

export function person(id: string, over: Partial<ComicPersonRow> = {}): ComicPersonRow {
  return {
    id,
    canonical_name: `Person ${id}`,
    display_name_ru: null,
    name_status: 'unverified',
    identity_status: 'unidentified_name_bucket',
    name_bucket_key: `bucket-${id}`,
    source_name: 'anilist',
    source_person_id: null,
    source_url: `https://example.test/people/${id}`,
    verification_status: 'recorded',
    is_public: false,
    ...over,
  };
}

export function review(
  id: string,
  over: Partial<ReviewItemRow> & { reason?: ReviewReason } = {},
): ReviewItemRow {
  return {
    id,
    work_id: 'w1',
    item_type: 'quality',
    item_ref: null,
    reason: (over.reason ?? 'manual') as ReviewReason,
    severity: 'medium',
    status: 'open',
    priority: 50,
    details: {},
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    resolved_at: null,
    resolved_by: null,
    ...over,
  };
}

export function observation(id: string, over: Partial<SourceObservationRow> = {}): SourceObservationRow {
  return {
    id,
    work_id: 'w1',
    field_name: 'chapters',
    source_name: 'anilist',
    external_id: '1',
    join_key: '1',
    source_url: 'https://example.test/observation/1',
    observed_at: '2026-05-01T00:00:00.000Z',
    confidence: 0.9,
    verification_status: 'source_verified',
    source_payload_hash: `hash-${id}`,
    value_json: 10,
    is_conflict: false,
    conflict_group: null,
    created_at: '2026-05-01T00:00:00.000Z',
    ...over,
  };
}

export function adaptation(id: string, over: Partial<AdaptationRow> = {}): AdaptationRow {
  return {
    id,
    anime_id: 1,
    comic_work_id: 'w1',
    raw_relation_type: 'ADAPTATION',
    normalized_relation_type: 'ADAPTATION',
    direction: 'unknown',
    confidence_level: 'unknown',
    basis: 'source_declared',
    is_primary: false,
    source_name: 'anilist',
    source_url: 'https://example.test/relation/1',
    observed_at: '2026-05-01T00:00:00.000Z',
    checked_at: null,
    verification_status: 'recorded',
    is_public: false,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    ...over,
  };
}

export function externalId(id: string, over: Partial<ExternalIdRow> = {}): ExternalIdRow {
  return {
    id,
    work_id: 'w1',
    source_name: 'anilist',
    external_id: '1',
    source_url: 'https://example.test/external/1',
    is_primary: false,
    fetched_at: '2026-05-01T00:00:00.000Z',
    last_verified_at: null,
    verification_status: 'source_verified',
    confidence: 0.9,
    source_payload_hash: null,
    ...over,
  };
}

export function alias(id: string, over: Partial<AliasRow> = {}): AliasRow {
  return {
    id,
    work_id: 'w1',
    alias: `Alias ${id}`,
    alias_type: 'alternative',
    language: 'ru',
    is_public: false,
    source_name: 'anilist',
    source_url: 'https://example.test/alias/1',
    fetched_at: '2026-05-01T00:00:00.000Z',
    checked_at: null,
    confidence: 0.9,
    verification_status: 'source_verified',
    ...over,
  };
}

export function right(id: string, over: Partial<ApprovedRightRow> = {}): ApprovedRightRow {
  return {
    id,
    work_id: 'w1',
    reading_source_id: null,
    permission: 'metadata',
    status: 'approved',
    evidence_ref: 'evidence-1',
    reviewed_by: 'reviewer',
    reviewed_at: '2026-05-01T00:00:00.000Z',
    valid_from: '2026-05-01T00:00:00.000Z',
    valid_until: null,
    ...over,
  };
}

export function snapshot(over: Partial<CatalogSnapshot> = {}): CatalogSnapshot {
  return {
    generated_at: NOW,
    source: 'dry-run-plan',
    works: [
      work('w1', { title_ru: null, title_ru_status: 'unverified', kind: 'unknown' }),
      work('w2'),
      work('w3', { publication_status: 'approved', published_at: '2026-01-01T00:00:00.000Z', content_rating_status: 'adult', is_adult: true }),
    ],
    people: [
      person('p1', { name_bucket_key: 'bucket-a' }),
      person('p2', { name_bucket_key: 'bucket-a' }),
      person('p3', { identity_status: 'source_identified', source_person_id: 's-1', name_bucket_key: null }),
    ],
    review_items: [
      review('r1', { reason: 'source_conflict', priority: 80, details: { field: 'chapters', canonical_action: 'no_winner_no_overwrite' } }),
      review('r2', { reason: 'source_metadata_conflict', priority: 70, details: { field: 'year' } }),
      review('r3', { work_id: 'w2', reason: 'ambiguous_external_id' }),
      review('r4', { work_id: 'w2', reason: 'relation_evidence_conflict', details: { b1d_category: 'comicAdaptsAnime', anime_ids: [85] } }),
      review('r5', { work_id: 'w2', reason: 'relation_evidence_conflict', details: { b1d_category: 'adaptationAfterAnime', anime_ids: [85] } }),
      review('r6', { reason: 'ambiguous_people_identity' }),
      review('r7', { reason: 'missing_provenance' }),
      review('r8', { work_id: 'w2', reason: 'duplicate_external_id', status: 'in_review' }),
      review('r9', { work_id: 'w2', reason: 'kind_unknown', status: 'resolved' }),
    ],
    adaptations: [adaptation('a1')],
    observations: [
      observation('o1', { is_conflict: true, conflict_group: 'w1:chapters' }),
      observation('o2', { source_name: 'shikimori', value_json: 12, is_conflict: true, conflict_group: 'w1:chapters' }),
    ],
    approved_rights: [],
    counts: {
      external_ids: 3,
      aliases: 2,
      credits: 3,
      source_observations: 2,
      source_observation_conflicts: 2,
      source_observations_missing_url: 0,
      chapters: 0,
      chapters_with_pages: 0,
      public_chapters: 0,
      reading_sources: 0,
      reading_sources_active: 0,
      public_works: 0,
    },
    ...over,
  };
}
