import {
  AMBIGUOUS_EXTERNAL_ID_REASONS,
  AUTHOR_IDENTITY_REASONS,
  CONTRADICTORY_ANIME_IDS,
  DUPLICATE_CANDIDATE_REASONS,
  RELATION_CONFLICT_REASONS,
  REVIEW_REASONS,
  REVIEW_SEVERITIES,
  REVIEW_STATUSES,
  SOURCE_CONFLICT_REASONS,
  asNumberArray,
  asRecord,
  type CatalogSnapshot,
  type ReviewItemRow,
  type ReviewReason,
  type ReviewSeverity,
  type ReviewStatus,
} from './model';

export interface Dashboard {
  metadata: {
    works_total: number;
    works_by_status: Record<string, number>;
    works_by_kind: Record<string, number>;
    unknown_kind: number;
    ru_titles_present: number;
    ru_titles_verified: number;
    ru_titles_unverified: number;
    ru_titles_missing: number;
    ru_titles_name_mismatch: number;
    external_ids: number;
    aliases: number;
    people: number;
    credits: number;
    adaptations: number;
    source_observations: number;
  };
  quality: {
    source_conflict_works: number;
    source_conflict_items: number;
    observation_conflicts: number;
    ambiguous_external_ids: number;
    unidentified_author_buckets: number;
    identified_authors: number;
    ambiguous_people_identities: number;
    missing_provenance_items: number;
    observations_missing_url: number;
    unknown_adult: number;
    contradictory_relations: number;
    contradictory_anime_ids: number[];
    duplicate_candidates: number;
  };
  publication: {
    draft: number;
    approved: number;
    published: number;
    adult: number;
    verified_non_adult: number;
    adult_unknown: number;
    approved_rights: number;
    approved_rights_works: number;
    approved_rights_by_permission: Record<string, number>;
    chapters: number;
    chapters_with_pages: number;
    public_chapters: number;
    reading_sources: number;
    active_reading_sources: number;
    public_works: number;
    publishable_works: number;
  };
  review: {
    total: number;
    by_status: Record<ReviewStatus, number>;
    by_reason: Record<ReviewReason, number>;
    by_severity: Record<ReviewSeverity, number>;
    source_conflict: number;
    ambiguous_external_id: number;
    relation_evidence_conflict: number;
    author_identity_conflict: number;
  };
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const name = key(value);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

function zeroReasons(): Record<ReviewReason, number> {
  return Object.fromEntries(REVIEW_REASONS.map((reason) => [reason, 0])) as Record<ReviewReason, number>;
}

function zeroStatuses(): Record<ReviewStatus, number> {
  return Object.fromEntries(REVIEW_STATUSES.map((status) => [status, 0])) as Record<ReviewStatus, number>;
}

function zeroSeverities(): Record<ReviewSeverity, number> {
  return Object.fromEntries(REVIEW_SEVERITIES.map((severity) => [severity, 0])) as Record<ReviewSeverity, number>;
}

function countReasons(items: ReviewItemRow[]): Record<ReviewReason, number> {
  const counts = zeroReasons();
  for (const item of items) counts[item.reason] += 1;
  return counts;
}

function countStatuses(items: ReviewItemRow[]): Record<ReviewStatus, number> {
  const counts = zeroStatuses();
  for (const item of items) counts[item.status] += 1;
  return counts;
}

function countSeverities(items: ReviewItemRow[]): Record<ReviewSeverity, number> {
  const counts = zeroSeverities();
  for (const item of items) counts[item.severity] += 1;
  return counts;
}

function hasAnyReason(item: ReviewItemRow, reasons: readonly ReviewReason[]): boolean {
  return reasons.includes(item.reason);
}

/**
 * Distinct anime ids with both B1D direction hints. The result is evidence
 * conflict only; it is never used to assign a direction or promote a link.
 */
export function collectContradictoryAnimeIds(items: ReviewItemRow[]): number[] {
  const categories = new Map<number, Set<string>>();
  for (const item of items) {
    const details = asRecord(item.details);
    const category = typeof details.b1d_category === 'string' ? details.b1d_category : null;
    if (!category) continue;
    const ids = new Set<number>(asNumberArray(details.anime_ids));
    const edges = Array.isArray(details.linked_edges) ? details.linked_edges : [];
    for (const edge of edges) {
      const record = asRecord(edge);
      const animeId = record.anime_id;
      if (typeof animeId === 'number' && Number.isFinite(animeId)) ids.add(animeId);
    }
    for (const animeId of ids) {
      const bucket = categories.get(animeId) ?? new Set<string>();
      bucket.add(category);
      categories.set(animeId, bucket);
    }
  }
  return [...categories.entries()]
    .filter(([, values]) => values.has('comicAdaptsAnime') && values.has('adaptationAfterAnime'))
    .map(([animeId]) => animeId)
    .sort((a, b) => a - b);
}

/** Mirrors the metadata gate of `comic_public_works`; does not publish anything. */
export function countPublishableWorks(
  works: CatalogSnapshot['works'],
  rights: CatalogSnapshot['approved_rights'],
  at: string,
): number {
  const timestamp = Date.parse(at);
  const today = at.slice(0, 10);
  const validOn = (value: string | null) => value === null
    || (value.slice(0, 10) <= today);
  const metadataRights = new Set(rights.filter((right) => right.permission === 'metadata'
    && right.reading_source_id === null
    && right.status === 'approved'
    && right.evidence_ref !== null && right.evidence_ref.trim().length > 0
    && right.reviewed_by !== null && right.reviewed_by.trim().length > 0
    && right.reviewed_at !== null
    && validOn(right.valid_from)
    && (right.valid_until === null || right.valid_until.slice(0, 10) >= today)).map((right) => right.work_id));
  return works.filter((work) => {
    const publishedAt = work.published_at === null ? Number.NaN : Date.parse(work.published_at);
    return work.publication_status === 'approved'
      && Number.isFinite(publishedAt) && publishedAt <= timestamp
      && work.title_ru !== null
      && (work.title_ru_status === 'source_verified' || work.title_ru_status === 'editorially_verified')
      && work.is_adult === false
      && work.content_rating_status === 'verified_non_adult'
      && metadataRights.has(work.id);
  }).length;
}

export interface RuTitleMetrics {
  present: number;
  verified: number;
  unverified: number;
  missing: number;
  nameMismatch: number;
}

/**
 * RU title buckets are exhaustive and non-overlapping:
 * present = verified + unverified; missing is disjoint. nameMismatch is a
 * diagnostic status counter, not a bucket: it may describe a present or a
 * missing title and must never be added to the present total.
 */
export function countRuTitleMetrics(works: CatalogSnapshot['works']): RuTitleMetrics {
  let present = 0;
  let verified = 0;
  let unverified = 0;
  let missing = 0;
  let nameMismatch = 0;
  for (const work of works) {
    const hasTitle = work.title_ru !== null && work.title_ru.trim().length > 0;
    if (work.title_ru_status === 'name_mismatch') nameMismatch += 1;
    if (!hasTitle) {
      missing += 1;
      continue;
    }
    present += 1;
    const isVerified = work.title_ru_status === 'source_verified' || work.title_ru_status === 'editorially_verified';
    if (isVerified) verified += 1;
    else unverified += 1;
  }
  return { present, verified, unverified, missing, nameMismatch };
}

export function buildDashboard(snapshot: CatalogSnapshot): Dashboard {
  const { works, people, review_items: reviewItems, adaptations, observations, approved_rights: rights } = snapshot;
  const reasons = countReasons(reviewItems);
  const statuses = countStatuses(reviewItems);
  const severities = countSeverities(reviewItems);
  const worksByStatus = countBy(works, (work) => work.publication_status);
  const worksByKind = countBy(works, (work) => work.kind);
  const ruTitles = countRuTitleMetrics(works);
  const observationConflictWorkIds = new Set(observations.filter((row) => row.is_conflict).map((row) => row.work_id));
  const sourceConflictWorkIds = new Set(
    reviewItems.filter((item) => hasAnyReason(item, SOURCE_CONFLICT_REASONS) && item.work_id).map((item) => item.work_id as string),
  );
  for (const workId of observationConflictWorkIds) sourceConflictWorkIds.add(workId);
  const sourceConflictItems = reviewItems.filter((item) => hasAnyReason(item, SOURCE_CONFLICT_REASONS)).length;
  const unidentifiedBuckets = new Set(
    people
      .filter((person) => person.identity_status === 'unidentified_name_bucket')
      .map((person) => person.name_bucket_key ?? person.id),
  );
  const identifiedAuthors = people.filter(
    (person) => person.source_person_id !== null || person.identity_status === 'source_identified' || person.identity_status === 'manually_verified',
  ).length;
  const rightsByPermission = countBy(rights, (right) => right.permission);
  const approvedRightsWorks = new Set(rights.map((right) => right.work_id)).size;
  const now = Date.parse(snapshot.generated_at);
  const published = works.filter(
    (work) => work.publication_status === 'approved' && work.published_at !== null && Date.parse(work.published_at) <= now,
  ).length;
  const contradictoryIds = collectContradictoryAnimeIds(reviewItems);

  return {
    metadata: {
      works_total: works.length,
      works_by_status: worksByStatus,
      works_by_kind: worksByKind,
      unknown_kind: works.filter((work) => work.kind === 'unknown').length,
      ru_titles_present: ruTitles.present,
      ru_titles_verified: ruTitles.verified,
      ru_titles_unverified: ruTitles.unverified,
      ru_titles_missing: ruTitles.missing,
      ru_titles_name_mismatch: ruTitles.nameMismatch,
      external_ids: snapshot.counts.external_ids,
      aliases: snapshot.counts.aliases,
      people: people.length,
      credits: snapshot.counts.credits,
      adaptations: adaptations.length,
      source_observations: snapshot.counts.source_observations,
    },
    quality: {
      source_conflict_works: sourceConflictWorkIds.size,
      source_conflict_items: sourceConflictItems,
      observation_conflicts: snapshot.counts.source_observation_conflicts,
      ambiguous_external_ids: reviewItems.filter((item) => hasAnyReason(item, AMBIGUOUS_EXTERNAL_ID_REASONS)).length,
      unidentified_author_buckets: unidentifiedBuckets.size,
      identified_authors: identifiedAuthors,
      ambiguous_people_identities: reasons.ambiguous_people_identity,
      missing_provenance_items: reasons.missing_provenance,
      observations_missing_url: snapshot.counts.source_observations_missing_url,
      unknown_adult: works.filter((work) => work.content_rating_status === 'unknown').length,
      contradictory_relations: contradictoryIds.length,
      contradictory_anime_ids: contradictoryIds,
      duplicate_candidates: reviewItems.filter((item) => hasAnyReason(item, DUPLICATE_CANDIDATE_REASONS)).length,
    },
    publication: {
      draft: worksByStatus.draft ?? 0,
      approved: worksByStatus.approved ?? 0,
      published,
      adult: works.filter((work) => work.content_rating_status === 'adult').length,
      verified_non_adult: works.filter((work) => work.content_rating_status === 'verified_non_adult').length,
      adult_unknown: works.filter((work) => work.content_rating_status === 'unknown').length,
      approved_rights: rights.length,
      approved_rights_works: approvedRightsWorks,
      approved_rights_by_permission: rightsByPermission,
      chapters: snapshot.counts.chapters,
      chapters_with_pages: snapshot.counts.chapters_with_pages,
      public_chapters: snapshot.counts.public_chapters,
      reading_sources: snapshot.counts.reading_sources,
      active_reading_sources: snapshot.counts.reading_sources_active,
      public_works: snapshot.counts.public_works,
      publishable_works: countPublishableWorks(works, rights, snapshot.generated_at),
    },
    review: {
      total: reviewItems.length,
      by_status: statuses,
      by_reason: reasons,
      by_severity: severities,
      source_conflict: sourceConflictItems,
      ambiguous_external_id: reviewItems.filter((item) => hasAnyReason(item, AMBIGUOUS_EXTERNAL_ID_REASONS)).length,
      relation_evidence_conflict: reviewItems.filter((item) => hasAnyReason(item, RELATION_CONFLICT_REASONS)).length,
      author_identity_conflict: reviewItems.filter((item) => hasAnyReason(item, AUTHOR_IDENTITY_REASONS)).length,
    },
  };
}

export function knownContradictoryAnimeIds(): number[] {
  return [...CONTRADICTORY_ANIME_IDS];
}

export function reviewQueueDelta(current: Dashboard, previous: Dashboard | null): {
  available: boolean;
  total_delta: number | null;
  by_reason_delta: Record<string, number> | null;
} {
  if (!previous) return { available: false, total_delta: null, by_reason_delta: null };
  const byReason: Record<string, number> = {};
  for (const reason of REVIEW_REASONS) byReason[reason] = current.review.by_reason[reason] - previous.review.by_reason[reason];
  return { available: true, total_delta: current.review.total - previous.review.total, by_reason_delta: byReason };
}
