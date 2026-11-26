import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeDuplicates } from '../lib/aninova3/comics/import/dedup';
import {
  buildNormalizedCatalog,
  kindFromSources,
  normalizeRelationType,
} from '../lib/aninova3/comics/import/normalize';
import { buildPlan, hashPlan, reportCounts } from '../lib/aninova3/comics/import/planner';
import type {
  B1DReviewCategory,
  CandidateRecord,
  GraphComicRecord,
  GraphRelationRecord,
  ReviewHintRecord,
  SourceEnvelope,
  VerifiedMetadataRecord,
} from '../lib/aninova3/comics/import/types';

const NOW = '2026-11-25T00:00:00.000Z';
const hash = (seed: string): string => createHash('sha256').update(seed).digest('hex');

function envelope(
  source_name: SourceEnvelope['source_name'],
  external_id: string | null,
  join_key: string | null,
  source_url: string,
  seed: string,
  verification_status: SourceEnvelope['verification_status'] = 'source_verified',
): SourceEnvelope {
  return {
    source_name, external_id, join_key, source_url,
    fetched_at: '2026-11-20T00:00:00.000Z',
    source_snapshot_at: '2026-11-20T00:00:00.000Z',
    terms_review_status: 'unknown',
    attribution_requirements: [],
    confidence: 0.9,
    verification_status,
    source_payload_hash: hash(seed),
  };
}

function comic(id: number, over: Partial<GraphComicRecord> = {}): GraphComicRecord {
  return {
    ...envelope('anilist', String(id), String(id), `https://anilist.co/manga/${id}`, `comic-${id}`),
    anilist_id: id,
    mal_id: null,
    format: 'MANGA',
    country: 'JP',
    title_original: `Comic ${id}`,
    title_native: null,
    year: 2000,
    status: 'FINISHED',
    chapters: 10,
    volumes: 1,
    cover_url: null,
    authors: [],
    ...over,
  };
}

function meta(id: number, over: Partial<VerifiedMetadataRecord> = {}): VerifiedMetadataRecord {
  return {
    ...envelope('shikimori', String(1000 + id), String(id), `https://shikimori.one/mangas/${1000 + id}`, `meta-${id}`),
    anilist_id: id,
    status: 'SOURCE_VERIFIED',
    mal_id: null,
    shikimori_id: 1000 + id,
    title_ru: null,
    license_name_ru: null,
    genres: [],
    kind: null,
    year: null,
    volumes: null,
    chapters: null,
    cover_url: null,
    checked_at: '2026-11-21T00:00:00.000Z',
    defects: [],
    anime_ids: [],
    ...over,
  };
}

function candidate(id: number, over: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    ...envelope('shikimori_candidates', null, String(id), `https://shikimori.one/mangas/${2000 + id}`, `candidate-${id}`, 'candidate'),
    anilist_id: id,
    mal_id: null,
    title_ru: null,
    kind: null,
    year: null,
    status: 'PENDING_REVIEW',
    reason: null,
    checked_at: null,
    ...over,
  };
}

function relation(animeId: number, comicId: number, raw: string, seed = `${animeId}:${comicId}:${raw}`): GraphRelationRecord {
  return {
    ...envelope('anilist', String(animeId), String(animeId), `https://anilist.co/anime/${animeId}`, seed),
    anime_id: animeId,
    comic_anilist_id: comicId,
    raw_relation_type: raw,
    observed_at: '2026-11-20T00:00:00.000Z',
  };
}

function hint(
  category: B1DReviewCategory,
  comicIds: number[],
  animeIds: number[],
  payload: Record<string, unknown> = { category, note: 'original hint' },
): ReviewHintRecord {
  return {
    ...envelope('b1d_review_queue', `b1d-${category}-${comicIds.join('-')}-${animeIds.join('-')}`, String(comicIds[0] ?? ''), 'https://example.test/b1d', `hint-${category}-${comicIds.join('-')}-${animeIds.join('-')}`, 'recorded'),
    category,
    anime_ids: animeIds,
    comic_anilist_ids: comicIds,
    payload,
    link_status: 'unverified',
    row_count: 1,
  };
}

function normalize(input: {
  comics: GraphComicRecord[];
  relations?: GraphRelationRecord[];
  verified?: VerifiedMetadataRecord[];
  candidates?: CandidateRecord[];
  hints?: ReviewHintRecord[];
  anime?: number[];
}) {
  return buildNormalizedCatalog({
    graphComics: input.comics,
    graphRelations: input.relations ?? [],
    verified: input.verified ?? [],
    candidates: input.candidates ?? [],
    queueHints: input.hints ?? [],
    knownAnimeIds: new Set(input.anime ?? [1, 2, 3, 4]),
  });
}

function planFor(input: Parameters<typeof normalize>[0]) {
  const output = normalize(input);
  const dedup = analyzeDuplicates(output.catalog);
  const plan = buildPlan(output.catalog, { generatedAt: NOW, dedup });
  return { output, dedup, plan };
}

describe('B3-C kind classification', () => {
  it('uses a verified specific source kind, keeps ONE_SHOT, and never guesses from MANGA or country', () => {
    expect(kindFromSources({ format: 'MANGA' }, { kind: 'manhwa', status: 'SOURCE_VERIFIED' }))
      .toEqual({ kind: 'manhwa', conflict: false });
    expect(kindFromSources({ format: 'ONE_SHOT' }, null)).toEqual({ kind: 'one_shot', conflict: false });
    expect(kindFromSources({ format: 'MANGA' }, { kind: 'manga', status: 'SOURCE_VERIFIED' }))
      .toEqual({ kind: 'unknown', conflict: false });
    expect(kindFromSources({ format: 'ONE_SHOT' }, { kind: 'manhwa', status: 'SOURCE_VERIFIED' }))
      .toEqual({ kind: 'manhwa', conflict: true });
    const output = normalize({
      comics: [
        comic(501, { country: 'KR' }),
        comic(502, { country: 'CN', format: 'ONE_SHOT' }),
        comic(503, { country: 'CN' }),
        comic(504, { country: 'JP' }),
      ],
      verified: [
        meta(503, { kind: 'manhua' }),
        meta(504, { kind: 'manga' }),
      ],
    });
    const byId = new Map(output.catalog.works.map((work) => [work.internal_key, work]));
    expect(byId.get('comic:anilist:501')).toMatchObject({ kind: 'unknown', source_kind_raw: 'MANGA', country_code: 'KR' });
    expect(byId.get('comic:anilist:502')).toMatchObject({ kind: 'one_shot', source_kind_raw: 'ONE_SHOT', country_code: 'CN' });
    expect(byId.get('comic:anilist:503')).toMatchObject({ kind: 'manhua', source_kind_raw: 'MANGA' });
    expect(byId.get('comic:anilist:504')).toMatchObject({ kind: 'unknown', source_kind_raw: 'MANGA' });
  });
});

describe('B3-C source identifiers', () => {
  it('keeps each source id with its own source and a separate AniList join key', () => {
    const { output } = planFor({
      comics: [comic(551)],
      verified: [meta(551)],
    });
    const shikimori = output.catalog.source_observations.find((row) =>
      row.source_name === 'shikimori' && row.field_name === 'shikimori_id');
    expect(shikimori).toMatchObject({
      external_id: '1551',
      join_key: '551',
      source_url: 'https://shikimori.one/mangas/1551',
    });
    expect(shikimori?.external_id).not.toBe(shikimori?.join_key);
    const anilist = output.catalog.source_observations.find((row) =>
      row.source_name === 'anilist' && row.field_name === 'kind');
    expect(anilist).toMatchObject({ external_id: '551', join_key: '551' });
    const rows = output.catalog.external_ids.map((row) => [row.source_name, row.external_id]);
    expect(rows).toEqual(expect.arrayContaining([
      ['anilist', '551'],
      ['shikimori', '1551'],
    ]));
    expect(rows).not.toContainEqual(['shikimori', '551']);
  });
});

describe('B3-C MAL identity', () => {
  it('keeps an equal or single-source MAL id and queues a graph/metadata conflict without assigning either', () => {
    const { output, plan } = planFor({
      comics: [
        comic(201, { mal_id: 11 }),
        comic(202, { mal_id: 12 }),
        comic(203),
        comic(204, { mal_id: 15 }),
      ],
      verified: [
        meta(201, { mal_id: 11 }),
        meta(202, { mal_id: 13 }),
        meta(203, { mal_id: 14 }),
        meta(204),
      ],
    });
    const malRows = output.catalog.external_ids.filter((row) => row.source_name === 'mal');
    expect(malRows.map((row) => [row.work_id, row.external_id]).sort()).toEqual([
      [output.catalog.works[0].id, '11'],
      [output.catalog.works[2].id, '14'],
      [output.catalog.works[3].id, '15'],
    ].sort());
    expect(malRows.some((row) => row.work_id === output.catalog.works[1].id)).toBe(false);
    const conflict = output.catalog.conflicts.find((item) => item.work_id === output.catalog.works[1].id && item.field === 'mal_id');
    expect(conflict?.values.map((value) => value.value).sort()).toEqual([12, 13]);
    const observations = output.catalog.source_observations.filter(
      (row) => row.work_id === conflict?.work_id && row.field_name === 'mal_id',
    );
    expect(observations).toHaveLength(2);
    expect(observations.every((row) => row.is_conflict)).toBe(true);
    const malReview = plan.reviewQueue.find(
      (row) => row.row?.work_id === conflict?.work_id && row.row?.reason === 'source_metadata_conflict',
    );
    expect(malReview?.row?.details).toMatchObject({ field: 'mal_id', canonical_action: 'no_winner_no_overwrite' });
    const ambiguous = plan.reviewQueue.find(
      (row) => row.row?.reason === 'ambiguous_external_id' && row.row.item_ref?.startsWith('mal-conflict:'),
    );
    expect(ambiguous?.row?.details).toMatchObject({ action: 'assign_no_mal_id' });
    expect(ambiguous?.row?.details?.mal_ids).toEqual([12, 13]);
  });

  it('does not merge a MAL id reused by two different AniList works', () => {
    const { output, plan } = planFor({
      comics: [comic(301, { mal_id: 777 }), comic(302, { mal_id: 777 })],
      verified: [meta(301, { mal_id: 777 }), meta(302, { mal_id: 777 })],
    });
    expect(output.catalog.works).toHaveLength(2);
    expect(plan.workIds).toHaveLength(2);
    const external = plan.externalIds.filter((row) => row.row?.source_name === 'mal');
    expect(external).toHaveLength(0);
    const groups = plan.operations.filter((row) => row.op === 'SKIP' && row.table === 'comic_external_ids');
    expect(groups).toHaveLength(2);
    const review = plan.reviewQueue.filter((row) => row.row?.reason === 'ambiguous_external_id' && row.row.item_ref === 'mal:777');
    expect(review).toHaveLength(2);
    expect(review[0].row?.details?.anilist_ids).toEqual([301, 302]);
  });
});

describe('B3-C metadata conflicts', () => {
  it('preserves every source value, marks the field and leaves unresolved canonical numbers NULL', () => {
    const { output, plan } = planFor({
      comics: [comic(401, { year: 2000, chapters: 10, volumes: 1, format: 'ONE_SHOT' })],
      verified: [meta(401, {
        year: 2001, chapters: 12, volumes: 2, kind: 'manhwa',
        title_ru: 'Русский тайтл',
      })],
      candidates: [candidate(401, { title_ru: 'Другой тайтл', year: 2002, kind: 'comic' })],
    });
    const work = output.catalog.works[0];
    expect(work).toMatchObject({
      publication_year: null,
      total_chapters_known: null,
      volumes_known: null,
      kind: 'manhwa',
      source_kind_raw: 'ONE_SHOT',
      title_ru: 'Русский тайтл',
    });
    const fields = output.catalog.conflicts.map((item) => item.field).sort();
    expect(fields).toEqual(['chapters', 'kind', 'publication_year', 'title_ru', 'volumes']);
    for (const conflict of output.catalog.conflicts) {
      const rows = output.catalog.source_observations.filter(
        (row) => row.work_id === work.id && row.field_name === conflict.field,
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.every((row) => row.is_conflict && row.conflict_group !== null)).toBe(true);
      expect(conflict.values.length).toBe(rows.length);
    }
    const titleValues = output.catalog.source_observations
      .filter((row) => row.work_id === work.id && row.field_name === 'title_ru')
      .map((row) => row.value_json);
    expect(titleValues).toContain('Русский тайтл');
    expect(titleValues).toContain('Другой тайтл');
    const conflictReviews = plan.reviewQueue.filter((row) => row.row?.reason === 'source_metadata_conflict');
    expect(conflictReviews.map((row) => row.row?.details?.field).sort())
      .toEqual(['chapters', 'kind', 'publication_year', 'title_ru', 'volumes']);
    for (const review of conflictReviews) {
      expect(review.row?.details).toMatchObject({ canonical_action: 'no_winner_no_overwrite' });
      expect(Array.isArray(review.row?.details?.values)).toBe(true);
    }
    const counts = reportCounts(plan, {
      graphComics: 1, graphEdges: 0, verifiedMetadataRecords: 1, metadataCandidates: 1,
      verifiedMetaDeclaredTotal: 1, duplicateCandidates: 0, approvedRights: 0,
      publicChapters: 0, b1dHintsTotal: 0, b1dHintsUnmatched: 0, ambiguousExternalIds: 0,
      authorNameRecords: 0, identifiedAuthors: 0,
    });
    expect(counts).toMatchObject({
      normalizedWorks: 1,
      worksWithSourceConflicts: 1,
      worksUnknownKind: 0,
      worksAdultUnknown: 1,
      worksVerifiedNonAdult: 0,
      worksAdult: 0,
      readySourceObservations: output.catalog.source_observations.length,
    });
  });
});

describe('B3-C author identity', () => {
  it('creates per-work unidentified name buckets and never merges the same name into a person', () => {
    const { output, plan } = planFor({
      comics: [
        comic(601, { authors: ['Same Name'] }),
        comic(602, { authors: [' Same   Name '] }),
      ],
    });
    expect(output.catalog.people).toHaveLength(2);
    expect(output.catalog.credits).toHaveLength(2);
    expect(new Set(output.catalog.people.map((person) => person.name_bucket_key)).size).toBe(2);
    for (const person of output.catalog.people) {
      expect(person).toMatchObject({
        source_person_id: null,
        name_status: 'unverified',
        identity_status: 'unidentified_name_bucket',
        is_public: false,
      });
    }
    expect(output.authorNameRecords).toBe(1);
    expect(output.authorNameBuckets).toBe(2);
    expect(output.identifiedAuthors).toBe(0);
    const review = plan.reviewQueue.find((row) => row.row?.reason === 'ambiguous_people_identity');
    expect(review?.row).toMatchObject({ item_type: 'person', item_ref: 'author-name:same name' });
    expect(review?.row?.details).toMatchObject({
      normalized_name: 'same name',
      name_buckets: 2,
      work_count: 2,
      identity_status: 'unidentified_name_bucket',
      action: 'do_not_merge_by_name',
    });
    expect(review?.row?.details?.source_person_ids).toEqual([null, null]);
  });
});

describe('B3-C adult gate', () => {
  it('keeps every imported work at unknown adult status and never infers non-adult from title or country', () => {
    const { output, plan } = planFor({
      comics: [
        comic(701, { country: 'KR', title_original: 'Safe title' }),
        comic(702, { country: 'CN', title_original: 'Adult looking title' }),
      ],
    });
    for (const work of output.catalog.works) {
      expect(work).toMatchObject({
        is_adult: false,
        content_rating_status: 'unknown',
        content_rating_source: null,
        content_rating_checked_at: null,
      });
    }
    expect(output.catalog.source_observations.some((row) => row.field_name === 'adult_status')).toBe(false);
    const counts = reportCounts(plan, {
      graphComics: 2, graphEdges: 0, verifiedMetadataRecords: 0, metadataCandidates: 0,
      verifiedMetaDeclaredTotal: 0, duplicateCandidates: 0, approvedRights: 0,
      publicChapters: 0, b1dHintsTotal: 0, b1dHintsUnmatched: 0, ambiguousExternalIds: 0,
      authorNameRecords: 0, identifiedAuthors: 0,
    });
    expect(counts.worksAdultUnknown).toBe(2);
    expect(counts.worksVerifiedNonAdult).toBe(0);
    expect(counts.worksAdult).toBe(0);
  });
});

describe('B3-C B1D queue', () => {
  it('transfers all four categories as review-only evidence and retains unmatched hints', () => {
    const payload = { nested: { malId: 999, title: 'Оригинальный смысл' }, flags: ['a', 'b'] };
    const { output, plan } = planFor({
      comics: [comic(801), comic(802)],
      relations: [relation(1, 801, 'ADAPTATION')],
      hints: [
        hint('duplicateMal', [801], [1], payload),
        hint('multiSourceNeedsReview', [801], [1], payload),
        hint('comicAdaptsAnime', [801], [1], payload),
        hint('adaptationAfterAnime', [801], [1], payload),
        hint('adaptationAfterAnime', [802], [2], payload),
      ],
    });
    const rows = plan.reviewQueue.filter((row) => typeof row.row?.details?.b1d_category === 'string');
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((row) => row.row?.details?.b1d_category)).size).toBe(4);
    const matched = rows.filter((row) => row.row?.details?.b1d_link_status !== 'unmatched');
    const unmatched = rows.filter((row) => row.row?.details?.b1d_link_status === 'unmatched');
    expect(matched).toHaveLength(4);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].row?.reason).toBe('missing_provenance');
    expect(unmatched[0].row?.details?.unmatched_reason).toContain('no matching comic_adaptations edge');
    for (const row of rows) {
      expect(row.row?.details).toMatchObject({
        action: 'review_only_no_adaptation_change',
        source_name: 'b1d_review_queue',
        source_payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(row.row?.details?.source_payload).toEqual(payload);
      expect(row.row?.details?.comic_anilist_ids).toEqual(expect.any(Array));
      expect(row.row?.details?.anime_ids).toEqual(expect.any(Array));
    }
    const duplicateRow = rows.find((row) => row.row?.details?.b1d_category === 'duplicateMal');
    expect(duplicateRow?.row?.details).toMatchObject({
      catalog_domain: 'comics',
      comics_relevance: 'graph_candidate_unconfirmed',
    });
    expect(duplicateRow?.row?.details?.linked_edges).toEqual([
      expect.objectContaining({
        comic_anilist_id: 801,
        anime_id: 1,
        matched: true,
        adaptation_id: output.catalog.adaptations[0].id,
        raw_relation_type: 'ADAPTATION',
        normalized_relation_type: 'ADAPTATION',
        evidence_url: 'https://anilist.co/anime/1',
      }),
    ]);
    expect(output.relationQuality.contradictoryDirections).toBe(1);
    expect(output.relationQuality.issues).toContainEqual(expect.objectContaining({
      code: 'contradictory_direction', anime_id: 1,
    }));
    expect(output.catalog.adaptations).toHaveLength(1);
    expect(output.catalog.adaptations[0]).toMatchObject({
      raw_relation_type: 'ADAPTATION',
      normalized_relation_type: 'ADAPTATION',
      direction: 'unknown',
      verification_status: 'recorded',
      is_primary: false,
      is_public: false,
    });
    const counts = reportCounts(plan, {
      graphComics: 2, graphEdges: 1, verifiedMetadataRecords: 0, metadataCandidates: 0,
      verifiedMetaDeclaredTotal: 0, duplicateCandidates: 0, approvedRights: 0,
      publicChapters: 0, b1dHintsTotal: 5, b1dHintsUnmatched: 0, ambiguousExternalIds: 0,
      authorNameRecords: 0, identifiedAuthors: 0,
    });
    expect(counts).toMatchObject({
      b1dHintsTotal: 5,
      b1dHintsQueued: 5,
      b1dHintsUnmatched: 1,
      b1dHintsByCategory: {
        duplicateMal: 1,
        multiSourceNeedsReview: 1,
        comicAdaptsAnime: 1,
        adaptationAfterAnime: 2,
      },
    });
  });
});

describe('B3-C relation quality', () => {
  it('normalizes conservatively, keeps raw types, dedupes edges and records missing evidence', () => {
    expect(normalizeRelationType('ADAPTATION')).toBe('ADAPTATION');
    expect(normalizeRelationType('CHARACTER')).toBe('CHARACTER');
    expect(normalizeRelationType('SIDE_STORY')).toBe('SIDE_STORY');
    expect(normalizeRelationType('RELATED')).toBe('unknown');
    expect(normalizeRelationType('UNKNOWN_NEW_TYPE')).toBe('unknown');
    const withoutEvidence = relation(5, 902, 'OTHER');
    withoutEvidence.source_url = null;
    const { output, plan } = planFor({
      comics: [comic(901), comic(902)],
      relations: [
        relation(1, 901, 'ADAPTATION'),
        relation(1, 901, 'ADAPTATION', 'duplicate-edge'),
        relation(2, 901, 'RELATED'),
        relation(3, 902, 'CHARACTER'),
        relation(4, 902, 'SIDE_STORY'),
        relation(999, 902, 'ADAPTATION'),
        relation(1, 888, 'ADAPTATION'),
        withoutEvidence,
      ],
      anime: [1, 2, 3, 4, 5],
    });
    expect(output.relationQuality).toMatchObject({
      totalEdges: 8,
      insertedEdges: 5,
      missingAnime: 1,
      missingComic: 1,
      duplicateEdges: 1,
      unknownRawTypes: 1,
      missingEvidence: 1,
      unknownRawTypeNames: ['RELATED'],
    });
    expect(output.catalog.adaptations.map((row) => row.normalized_relation_type).sort())
      .toEqual(['ADAPTATION', 'CHARACTER', 'OTHER', 'SIDE_STORY', 'unknown']);
    expect(output.catalog.adaptations.every((row) =>
      row.direction === 'unknown' && row.confidence_level === 'unknown' &&
      row.verification_status === 'recorded' && !row.is_primary && !row.is_public))
      .toBe(true);
    expect(output.catalog.adaptations.some((row) => String(row.normalized_relation_type) === 'RELATED')).toBe(false);
    expect(output.catalog.adaptations.find((row) => row.normalized_relation_type === 'OTHER')?.source_url).toBeNull();
    const rawUnknown = plan.reviewQueue.find((row) => row.row?.reason === 'unsupported_relation');
    expect(rawUnknown?.row?.details).toMatchObject({ raw_relation_type: 'RELATED', normalized_relation_type: 'unknown' });
    expect(plan.reviewQueue.filter((row) => row.row?.reason === 'missing_provenance')).toHaveLength(3);
    expect(plan.reviewQueue.some((row) => row.row?.reason === 'source_conflict')).toBe(true);
  });

  it('deduplicates repeated anime/comic edges deterministically and flags a multiple-primary condition for review', () => {
    const first = planFor({
      comics: [comic(911)],
      relations: [relation(1, 911, 'ADAPTATION'), relation(1, 911, 'SIDE_STORY', 'second')],
    });
    const second = planFor({
      comics: [comic(911)],
      relations: [relation(1, 911, 'ADAPTATION'), relation(1, 911, 'SIDE_STORY', 'second')],
    });
    expect(first.plan.planHash).toBe(hashPlan(first.plan));
    expect(first.plan.planHash).toBe(second.plan.planHash);
    expect(first.plan.adaptations).toHaveLength(1);
    expect(first.plan.adaptations[0].row?.raw_relation_type).toBe('ADAPTATION');

    const output = normalize({ comics: [comic(912)] });
    output.catalog.relation_quality.multiplePrimary = 1;
    const dedup = analyzeDuplicates(output.catalog);
    const plan = buildPlan(output.catalog, { generatedAt: NOW, dedup });
    expect(plan.reviewQueue.some((row) =>
      row.row?.reason === 'source_conflict' && row.row.item_ref === 'multiple-primary-adaptations'))
      .toBe(true);
  });

  it('plans source observations as inserts only and keeps author buckets tied to a work and normalized name', () => {
    const { plan } = planFor({
      comics: [comic(913, { authors: ['Bucket Author'] })],
    });
    const observationOps = plan.operations.filter((operation) => operation.table === 'comic_source_observations');
    expect(observationOps.length).toBeGreaterThan(0);
    expect(observationOps.every((operation) => operation.op === 'INSERT')).toBe(true);

    const person = plan.people.find((operation) => operation.row?.canonical_name === 'Bucket Author')?.row;
    expect(person).toMatchObject({
      identity_status: 'unidentified_name_bucket',
      source_person_id: null,
      name_status: 'unverified',
      is_public: false,
      name_bucket_key: 'comic:anilist:913:bucket author',
    });
  });
});
