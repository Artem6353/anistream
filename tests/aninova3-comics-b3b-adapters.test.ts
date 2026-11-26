import { describe, expect, it } from 'vitest';
import {
  AniListGraphAdapter,
  MetadataCandidatesAdapter,
  ShikimoriMetadataAdapter,
  normalizeArtifact,
} from '@/lib/aninova3/comics/import/adapters';
import { buildNormalizedCatalog } from '@/lib/aninova3/comics/import/normalize';
import { analyzeDuplicates } from '@/lib/aninova3/comics/import/dedup';
import type {
  CandidateRecord,
  GraphComicRecord,
  GraphRelationRecord,
  VerifiedMetadataRecord,
} from '@/lib/aninova3/comics/import/types';

const NOW = '2026-11-23T00:00:00.000Z';
const HASH = 'a'.repeat(64);
const CONTEXT = { now: NOW, artifact_path: 'fixture.json', artifact_checksum: HASH };

function comic(anilist: number, overrides: Partial<GraphComicRecord> = {}): GraphComicRecord & Record<string, unknown> {
  return {
    source_name: 'anilist', external_id: String(anilist), source_url: `https://anilist.co/manga/${anilist}`,
    fetched_at: NOW, source_snapshot_at: NOW, terms_review_status: 'unknown',
    attribution_requirements: [], confidence: 0.9, verification_status: 'recorded',
    source_payload_hash: HASH, join_key: String(anilist), anilist_id: anilist, mal_id: null, format: 'MANGA',
    country: 'JP', title_original: `Original ${anilist}`, title_native: null, year: 2020,
    status: 'FINISHED', chapters: 10, volumes: 2, cover_url: null, authors: [],
    anilist, mal: null, titleOriginal: `Original ${anilist}`, titleNative: null, cover: null,
    ...overrides,
  };
}

function relation(anime: number, comicId: number, raw: string): GraphRelationRecord & Record<string, unknown> {
  return {
    source_name: 'anilist', external_id: `${anime}:${comicId}`,
    source_url: `https://anilist.co/anime/${anime}`, fetched_at: NOW, source_snapshot_at: NOW,
    terms_review_status: 'unknown', attribution_requirements: [], confidence: 0.9,
    verification_status: 'recorded', source_payload_hash: HASH, join_key: String(anime), anime_id: anime,
    comic_anilist_id: comicId, raw_relation_type: raw, observed_at: NOW,
    anime, comic: comicId, raw,
  };
}

function verified(anilist: number, overrides: Partial<VerifiedMetadataRecord> = {}): VerifiedMetadataRecord {
  return {
    source_name: 'shikimori', external_id: String(anilist),
    source_url: `https://shikimori.one/mangas/${anilist}`, fetched_at: NOW, source_snapshot_at: NOW,
    terms_review_status: 'unknown', attribution_requirements: [], confidence: 1,
    verification_status: 'source_verified', source_payload_hash: HASH, join_key: String(anilist), anilist_id: anilist,
    status: 'SOURCE_VERIFIED', mal_id: null, shikimori_id: null, title_ru: `Русский ${anilist}`,
    license_name_ru: null, genres: [], kind: 'manga', year: 2020, volumes: null, chapters: null,
    cover_url: null, checked_at: NOW, defects: [], anime_ids: [],
    ...overrides,
  };
}

function candidate(anilist: number): CandidateRecord {
  return {
    source_name: 'shikimori_candidates', external_id: null,
    source_url: `https://shikimori.one/mangas/${anilist}`, fetched_at: NOW, source_snapshot_at: NOW,
    terms_review_status: 'unknown', attribution_requirements: [], confidence: 0.4,
    verification_status: 'candidate', source_payload_hash: HASH, anilist_id: anilist,
    join_key: String(anilist), mal_id: null, title_ru: `Кандидат ${anilist}`, kind: null, year: null, status: 'CANDIDATE', reason: null, checked_at: NOW,
  };
}

describe('B3-B source adapters', () => {
  it('validates a graph artifact without fetching anything', () => {
    const adapter = new AniListGraphAdapter();
    const raw = {
      meta: { generatedAt: NOW, comicsKept: 2 },
      comics: [comic(100), comic(100), comic(101, { format: 'ONE_SHOT' })],
      edges: [relation(1, 100, 'ADAPTATION'), relation(1, 100, 'ADAPTATION'), relation(2, 999, 'SEQUEL')],
    };
    const issues = adapter.validate(raw);
    expect(issues.some((issue) => issue.code === 'comic_duplicate')).toBe(true);
    expect(issues.some((issue) => issue.code === 'edge_duplicate')).toBe(true);
    expect(issues.some((issue) => issue.code === 'edge_missing_comic')).toBe(true);
    const batch = normalizeArtifact(adapter, raw, CONTEXT);
    expect(batch.records).toHaveLength(3);
    expect(batch.metadata.declared_total).toBe(2);
    expect(batch.records.every((record) => record.terms_review_status === 'unknown')).toBe(true);
    expect(batch.records.every((record) => record.attribution_requirements.length === 0)).toBe(true);
    expect(batch.records.every((record) => /^[a-f0-9]{64}$/.test(record.source_payload_hash))).toBe(true);
  });

  it('reports the measured metadata total instead of trusting meta.total', () => {
    const adapter = new ShikimoriMetadataAdapter();
    const raw = {
      meta: { generatedAt: NOW, counts: { total: 3 } },
      records: { '100': verified(100) },
    };
    const issues = adapter.validate(raw);
    expect(issues.some((issue) => issue.code === 'metadata_total_mismatch')).toBe(true);
    const batch = normalizeArtifact(adapter, raw, CONTEXT);
    expect(batch.records).toHaveLength(1);
    expect(batch.metadata.declared_total).toBe(3);
    expect(batch.records[0].terms_review_status).toBe('unknown');
  });

  it('keeps candidate records internal and unverified', () => {
    const adapter = new MetadataCandidatesAdapter();
    const raw = {
      meta: { generatedAt: NOW, counts: { total: 1 } },
      candidates: [{ anilist: 100, titleRu: 'Кандидат', mal: 5, verification: 'CANDIDATE' }],
    };
    const batch = normalizeArtifact(adapter, raw, CONTEXT);
    expect(batch.records).toHaveLength(1);
    expect(batch.records[0].verification_status).toBe('candidate');
    expect(batch.records[0].confidence).toBeLessThan(1);
    expect(batch.metadata.declared_total).toBe(1);
  });
});

describe('B3-B normalization and deduplication', () => {
  const graphComics = [
    comic(100, { mal_id: 777 }),
    comic(101, { mal_id: 777 }),
    comic(102, { mal_id: 888 }),
  ];
  const graphRelations = [relation(1, 100, 'ADAPTATION'), relation(2, 102, 'ALTERNATIVE')];
  const verifiedRecords = [
    verified(100, { title_ru: 'Одинаковое название' }),
    verified(101, { title_ru: 'Одинаковое название', status: 'NAME_MISMATCH' }),
  ];
  const candidates = [candidate(102)];
  const normalized = buildNormalizedCatalog({
    graphComics, graphRelations, verified: verifiedRecords, candidates, queueHints: [],
    knownAnimeIds: new Set([1, 2]),
  });

  it('publishes only source-verified Russian titles', () => {
    const byId = new Map(normalized.catalog.works.map((work) => [work.internal_key, work]));
    expect(byId.get('comic:anilist:100')?.title_ru).toBe('Одинаковое название');
    expect(byId.get('comic:anilist:101')?.title_ru).toBeNull();
    expect(byId.get('comic:anilist:102')?.title_ru).toBeNull();
    expect(normalized.catalog.aliases.filter((alias) => alias.is_public).every(
      (alias) => alias.alias_type === 'official_russian' && alias.work_id === byId.get('comic:anilist:100')?.id,
    )).toBe(true);
    const candidateAlias = normalized.catalog.aliases.find((alias) => alias.work_id === byId.get('comic:anilist:102')?.id);
    expect(candidateAlias?.is_public).toBe(false);
  });

  it('preserves raw anime-comic edge types without confirming direction', () => {
    expect(normalized.catalog.adaptations).toHaveLength(2);
    expect(normalized.catalog.adaptations.map((row) => row.raw_relation_type).sort()).toEqual(['ADAPTATION', 'ALTERNATIVE']);
    expect(normalized.catalog.adaptations.every((row) => row.direction === 'unknown')).toBe(true);
    expect(normalized.catalog.adaptations.every((row) => row.is_primary === false)).toBe(true);
    expect(normalized.catalog.adaptations.every((row) => row.is_public === false)).toBe(true);
  });

  it('detects duplicate external ids and public titles without deleting or merging', () => {
    const duplicateCatalog = buildNormalizedCatalog({
      graphComics, graphRelations,
      verified: [verified(100, { title_ru: 'Одинаковое название' }), verified(101, { title_ru: 'Одинаковое название' })],
      candidates, queueHints: [], knownAnimeIds: new Set([1, 2]),
    }).catalog;
    const workCount = duplicateCatalog.works.length;
    const result = analyzeDuplicates(duplicateCatalog);
    expect(duplicateCatalog.works).toHaveLength(workCount);
    expect(result.analysis.externalIdGroups).toHaveLength(1);
    expect(result.analysis.externalIdGroups[0].source_name).toBe('mal');
    expect(result.analysis.externalIdGroups[0].external_id).toBe('777');
    expect(result.analysis.externalIdGroups[0].work_ids).toEqual([100, 101]);
    expect(result.duplicateWorkIds.size).toBe(2);
    expect(result.analysis.titleGroups).toHaveLength(1);
    expect(result.analysis.titleGroups[0].work_ids).toEqual([100, 101]);
    expect(result.analysis.titleGroups[0].normalized_title).toBe('одинаковое название');
    expect(result.skippedExternalKeys.has('mal:777')).toBe(true);
    expect(result.annotations.get(100)?.conflicts).toContain('duplicate_external_id:mal:777');
    expect(result.annotations.get(101)?.conflicts).toContain('duplicate_public_title:одинаковое название');
  });
});
