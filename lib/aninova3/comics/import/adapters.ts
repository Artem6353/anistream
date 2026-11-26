import {
  asIsoDate,
  asNonNegativeInt,
  asPositiveInt,
  asString,
  hashObject,
  isHttpsUrl,
  normalizeWhitespace,
  uniqueStrings,
} from './canonical';
import type {
  AdapterBatch,
  AdapterContext,
  CandidateRecord,
  GraphComicRecord,
  GraphRelationRecord,
  ReviewHintRecord,
  SourceAdapter,
  ValidationIssue,
  VerifiedMetadataRecord,
} from './types';

const TERMS_UNKNOWN = 'unknown' as const;
const ATTRIBUTION_NONE: string[] = [];
const GRAPH_URL = 'https://anilist.co/manga/';
const ANIME_URL = 'https://anilist.co/anime/';

function issue(
  severity: 'error' | 'warning',
  code: string,
  message: string,
  recordId?: string,
): ValidationIssue {
  return { severity, code, message, ...(recordId ? { record_id: recordId } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayOfObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function generatedAtOf(raw: unknown, fallback: string): string {
  if (!isObject(raw)) return fallback;
  const meta = isObject(raw.meta) ? raw.meta : null;
  return asIsoDate(meta?.generatedAt, fallback) ?? fallback;
}

export class AniListGraphAdapter implements SourceAdapter {
  readonly source_name = 'anilist' as const;
  readonly adapter_version = 'anilist-graph.b3b.1';
  readonly artifact_path = 'lib/aninova3/comics/source-graph.json';

  read(raw: unknown): unknown {
    if (!isObject(raw)) throw new Error('AniList graph must be an object');
    return raw;
  }

  validate(value: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!isObject(value)) return [issue('error', 'graph_shape', 'Source graph must be an object')];
    if (!Array.isArray(value.comics)) issues.push(issue('error', 'graph_comics', 'Source graph has no comics array'));
    if (!Array.isArray(value.edges)) issues.push(issue('error', 'graph_edges', 'Source graph has no edges array'));
    if (!isObject(value.meta)) issues.push(issue('warning', 'graph_meta', 'Source graph has no meta object'));
    const comics = Array.isArray(value.comics) ? value.comics : [];
    const edges = Array.isArray(value.edges) ? value.edges : [];
    const comicIds = new Set<number>();
    for (const [index, item] of comics.entries()) {
      if (!isObject(item)) {
        issues.push(issue('error', 'comic_shape', `comic[${index}] is not an object`));
        continue;
      }
      const id = asPositiveInt(item.anilist);
      if (!id) {
        issues.push(issue('error', 'comic_anilist', `comic[${index}] has no positive AniList id`));
        continue;
      }
      if (comicIds.has(id)) issues.push(issue('error', 'comic_duplicate', `duplicate AniList id ${id}`, String(id)));
      comicIds.add(id);
      if (!asString(item.titleOriginal)) issues.push(issue('error', 'comic_title', `AniList ${id} has no original title`, String(id)));
      if (item.format !== 'MANGA' && item.format !== 'ONE_SHOT') {
        issues.push(issue('error', 'comic_format', `AniList ${id} has unsupported format ${String(item.format)}`, String(id)));
      }
      if (item.cover != null && !isHttpsUrl(item.cover)) {
        issues.push(issue('warning', 'comic_cover', `AniList ${id} cover is not https`, String(id)));
      }
      if (item.mal != null && !asPositiveInt(item.mal)) {
        issues.push(issue('error', 'comic_mal', `AniList ${id} has invalid MAL id`, String(id)));
      }
      if (item.chapters != null && asNonNegativeInt(item.chapters) === null) {
        issues.push(issue('warning', 'comic_chapters', `AniList ${id} has invalid chapter count`, String(id)));
      }
      if (item.volumes != null && asNonNegativeInt(item.volumes) === null) {
        issues.push(issue('warning', 'comic_volumes', `AniList ${id} has invalid volume count`, String(id)));
      }
    }
    const edgeKeys = new Set<string>();
    for (const [index, item] of edges.entries()) {
      if (!isObject(item)) {
        issues.push(issue('error', 'edge_shape', `edge[${index}] is not an object`));
        continue;
      }
      const anime = asPositiveInt(item.anime);
      const comic = asPositiveInt(item.comic);
      const rawType = asString(item.raw);
      if (!anime) issues.push(issue('error', 'edge_anime', `edge[${index}] has no anime id`));
      if (!comic) issues.push(issue('error', 'edge_comic', `edge[${index}] has no comic id`));
      if (comic && !comicIds.has(comic)) issues.push(issue('error', 'edge_missing_comic', `edge comic ${comic} is absent`, String(comic)));
      if (!rawType) issues.push(issue('error', 'edge_relation', `edge[${index}] has no raw relation`));
      if (anime && comic) {
        const key = `${anime}:${comic}`;
        if (edgeKeys.has(key)) issues.push(issue('error', 'edge_duplicate', `duplicate edge ${key}`, key));
        edgeKeys.add(key);
      }
    }
    return issues;
  }

  normalize(value: unknown, context: AdapterContext): AdapterBatch {
    const raw = this.read(value) as Record<string, unknown>;
    const snapshot = generatedAtOf(raw, context.now);
    const comics = arrayOfObjects(raw.comics);
    const edges = arrayOfObjects(raw.edges);
    const records: GraphComicRecord[] = [];
    const relations: GraphRelationRecord[] = [];
    for (const comic of comics) {
      const anilist = asPositiveInt(comic.anilist);
      const titleOriginal = asString(comic.titleOriginal);
      if (!anilist || !titleOriginal) continue;
      const format = comic.format === 'ONE_SHOT' ? 'ONE_SHOT' : 'MANGA';
      const mal = asPositiveInt(comic.mal);
      records.push({
        source_name: 'anilist',
        external_id: String(anilist),
        join_key: String(anilist),
        source_url: `${GRAPH_URL}${anilist}`,
        fetched_at: snapshot,
        source_snapshot_at: snapshot,
        terms_review_status: TERMS_UNKNOWN,
        attribution_requirements: ATTRIBUTION_NONE,
        confidence: 0.9,
        verification_status: 'recorded',
        source_payload_hash: hashObject(comic),
        anilist_id: anilist,
        mal_id: mal,
        format,
        country: asString(comic.country)?.toUpperCase() ?? null,
        title_original: titleOriginal,
        title_native: asString(comic.titleNative),
        year: asPositiveInt(comic.year),
        status: asString(comic.status) ?? 'UNKNOWN',
        chapters: asNonNegativeInt(comic.chapters),
        volumes: asNonNegativeInt(comic.volumes),
        cover_url: isHttpsUrl(comic.cover) ? comic.cover : null,
        authors: uniqueStrings(arrayOfStrings(comic.authors)),
      });
    }
    for (const edge of edges) {
      const anime = asPositiveInt(edge.anime);
      const comic = asPositiveInt(edge.comic);
      const rawType = asString(edge.raw);
      if (!anime || !comic || !rawType) continue;
      relations.push({
        source_name: 'anilist',
        external_id: `${anime}:${comic}`,
        join_key: String(anime),
        source_url: `${ANIME_URL}${anime}`,
        fetched_at: snapshot,
        source_snapshot_at: snapshot,
        terms_review_status: TERMS_UNKNOWN,
        attribution_requirements: ATTRIBUTION_NONE,
        confidence: 0.9,
        verification_status: 'recorded',
        source_payload_hash: hashObject(edge),
        anime_id: anime,
        comic_anilist_id: comic,
        raw_relation_type: rawType,
        observed_at: asIsoDate(edge.observedAt, snapshot) ?? snapshot,
      });
    }
    const meta = isObject(raw.meta) ? raw.meta : {};
    return {
      records,
      relations,
      review_hints: [],
      issues: this.validate(raw),
      metadata: {
        declared_total: asPositiveInt(meta.comicsKept),
        generated_at: snapshot,
      },
    };
  }
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export class ShikimoriMetadataAdapter implements SourceAdapter {
  readonly source_name = 'shikimori' as const;
  readonly adapter_version = 'shikimori-verified.b3b.1';
  readonly artifact_path = 'lib/aninova3/comics/metadata-verified.json';

  read(raw: unknown): unknown {
    if (!isObject(raw)) throw new Error('Verified metadata must be an object');
    return raw;
  }

  validate(value: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!isObject(value)) return [issue('error', 'metadata_shape', 'Verified metadata must be an object')];
    if (!isObject(value.records)) issues.push(issue('error', 'metadata_records', 'Verified metadata has no records object'));
    const records = isObject(value.records) ? Object.entries(value.records) : [];
    const meta = isObject(value.meta) ? value.meta : {};
    const counts = isObject(meta.counts) ? meta.counts : meta;
    const declared = asPositiveInt(counts.total);
    if (declared && declared !== records.length) {
      issues.push(issue('warning', 'metadata_total_mismatch', `meta.total=${declared} but records=${records.length}`));
    }
    for (const [key, item] of records) {
      const id = asPositiveInt(Number(key));
      if (!id) {
        issues.push(issue('error', 'metadata_key', `record key ${key} is not an AniList id`));
        continue;
      }
      if (!isObject(item)) {
        issues.push(issue('error', 'metadata_shape', `record ${key} is not an object`, key));
        continue;
      }
      const status = asString(item.status);
      if (!['SOURCE_VERIFIED', 'NAME_MISMATCH', 'PENDING_REVIEW', 'NO_RU_TITLE'].includes(status ?? '')) {
        issues.push(issue('warning', 'metadata_status', `record ${key} has unknown status ${String(item.status)}`, key));
      }
      if (item.mal != null && !asPositiveInt(item.mal)) {
        issues.push(issue('error', 'metadata_mal', `record ${key} has invalid MAL id`, key));
      }
      if (item.shikimoriId != null && !asPositiveInt(item.shikimoriId)) {
        issues.push(issue('error', 'metadata_shikimori', `record ${key} has invalid Shikimori id`, key));
      }
      if (item.titleRu != null && !asString(item.titleRu)) {
        issues.push(issue('warning', 'metadata_title', `record ${key} has blank Russian title`, key));
      }
      if (item.sourceUrl != null && !isHttpsUrl(item.sourceUrl)) {
        issues.push(issue('warning', 'metadata_url', `record ${key} sourceUrl is not https`, key));
      }
    }
    return issues;
  }

  normalize(value: unknown, context: AdapterContext): AdapterBatch {
    const raw = this.read(value) as Record<string, unknown>;
    const meta = isObject(raw.meta) ? raw.meta : {};
    const artifactSnapshot = asIsoDate(meta.generatedAt, context.now) ?? context.now;
    const records: VerifiedMetadataRecord[] = [];
    const source = isObject(raw.records) ? raw.records : {};
    for (const [key, item] of Object.entries(source)) {
      if (!isObject(item)) continue;
      const anilist = asPositiveInt(Number(key));
      if (!anilist) continue;
      const status = normalizeVerifiedStatus(item.status);
      const checkedAt = asIsoDate(item.checkedAt, artifactSnapshot) ?? artifactSnapshot;
      records.push({
        source_name: 'shikimori',
        external_id: asPositiveInt(item.shikimoriId) ? String(asPositiveInt(item.shikimoriId)) : null,
        join_key: String(anilist),
        source_url: isHttpsUrl(item.sourceUrl) ? item.sourceUrl : null,
        fetched_at: checkedAt,
        source_snapshot_at: checkedAt,
        terms_review_status: TERMS_UNKNOWN,
        attribution_requirements: ATTRIBUTION_NONE,
        confidence: verifiedConfidence(status),
        verification_status: verifiedSourceStatus(status),
        source_payload_hash: hashObject({ source: 'shikimori', record: item }),
        anilist_id: anilist,
        status,
        mal_id: asPositiveInt(item.mal),
        shikimori_id: asPositiveInt(item.shikimoriId),
        title_ru: asString(item.titleRu),
        license_name_ru: asString(item.licenseNameRu),
        genres: uniqueStrings(arrayOfStrings(item.genres)),
        kind: asString(item.kind)?.toLowerCase() ?? null,
        year: asPositiveInt(item.year),
        volumes: asPositiveInt(item.volumes),
        chapters: asPositiveInt(item.chapters),
        cover_url: isHttpsUrl(item.cover) ? item.cover : null,
        checked_at: checkedAt,
        defects: arrayOfStrings(item.defects),
        anime_ids: Array.isArray(item.animeIds)
          ? item.animeIds.map(asPositiveInt).filter((id): id is number => id !== null)
          : [],
      });
    }
    const counts = isObject(meta.counts) ? meta.counts : meta;
    return {
      records,
      relations: [],
      review_hints: [],
      issues: this.validate(raw),
      metadata: { declared_total: asPositiveInt(counts.total), generated_at: artifactSnapshot },
    };
  }
}

function normalizeVerifiedStatus(value: unknown): VerifiedMetadataRecord['status'] {
  if (value === 'SOURCE_VERIFIED') return 'SOURCE_VERIFIED';
  if (value === 'NAME_MISMATCH') return 'NAME_MISMATCH';
  if (value === 'PENDING_REVIEW') return 'PENDING_REVIEW';
  if (value === 'NO_RU_TITLE') return 'NO_RU_TITLE';
  return 'UNKNOWN';
}

function verifiedConfidence(status: VerifiedMetadataRecord['status']): number {
  if (status === 'SOURCE_VERIFIED') return 1;
  if (status === 'PENDING_REVIEW') return 0.5;
  if (status === 'NAME_MISMATCH') return 0.3;
  if (status === 'NO_RU_TITLE') return 0.4;
  return 0.2;
}

function verifiedSourceStatus(status: VerifiedMetadataRecord['status']): VerifiedMetadataRecord['verification_status'] {
  if (status === 'SOURCE_VERIFIED') return 'source_verified';
  if (status === 'NAME_MISMATCH') return 'conflict';
  return 'candidate';
}

export class MetadataCandidatesAdapter implements SourceAdapter {
  readonly source_name = 'shikimori_candidates' as const;
  readonly adapter_version = 'shikimori-candidates.b3c.1';
  readonly artifact_path = 'lib/aninova3/comics/metadata-candidates.json';

  read(raw: unknown): unknown {
    if (!isObject(raw)) throw new Error('Candidate metadata must be an object');
    return raw;
  }

  validate(value: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!isObject(value)) return [issue('error', 'candidate_shape', 'Candidate metadata must be an object')];
    if (!Array.isArray(value.candidates)) issues.push(issue('error', 'candidate_array', 'Candidate metadata has no candidates array'));
    const seen = new Set<number>();
    for (const [index, item] of (Array.isArray(value.candidates) ? value.candidates : []).entries()) {
      if (!isObject(item)) {
        issues.push(issue('error', 'candidate_shape', `candidate[${index}] is not an object`));
        continue;
      }
      const id = asPositiveInt(item.anilist);
      if (!id) issues.push(issue('error', 'candidate_anilist', `candidate[${index}] has no AniList id`));
      if (id && seen.has(id)) issues.push(issue('error', 'candidate_duplicate', `duplicate candidate AniList ${id}`, String(id)));
      if (id) seen.add(id);
      if (!asString(item.titleRu)) issues.push(issue('warning', 'candidate_title', `candidate ${String(id)} has no Russian title`, String(id)));
      if (item.sourceUrl != null && !isHttpsUrl(item.sourceUrl)) {
        issues.push(issue('warning', 'candidate_url', `candidate ${String(id)} sourceUrl is not https`, String(id)));
      }
    }
    return issues;
  }

  normalize(value: unknown, context: AdapterContext): AdapterBatch {
    const raw = this.read(value) as Record<string, unknown>;
    const meta = isObject(raw.meta) ? raw.meta : {};
    const snapshot = asIsoDate(meta.generatedAt, context.now) ?? context.now;
    const records: CandidateRecord[] = [];
    for (const item of arrayOfObjects(raw.candidates)) {
      const anilist = asPositiveInt(item.anilist);
      const title = asString(item.titleRu);
      if (!anilist || !title) continue;
      const checkedAt = asIsoDate(item.fetchedAt, snapshot) ?? snapshot;
      records.push({
        source_name: 'shikimori_candidates',
        external_id: null,
        join_key: String(anilist),
        source_url: isHttpsUrl(item.sourceUrl) ? item.sourceUrl : null,
        fetched_at: checkedAt,
        source_snapshot_at: checkedAt,
        terms_review_status: TERMS_UNKNOWN,
        attribution_requirements: ATTRIBUTION_NONE,
        confidence: 0.4,
        verification_status: 'candidate',
        source_payload_hash: hashObject({ source: 'shikimori_candidate', record: item }),
        anilist_id: anilist,
        mal_id: asPositiveInt(item.mal),
        title_ru: title,
        kind: asString(item.kind)?.toLowerCase() ?? null,
        year: asPositiveInt(item.year),
        status: asString(item.verification) ?? 'CANDIDATE',
        reason: asString(item.verificationReason),
        checked_at: checkedAt,
      });
    }
    const counts = isObject(meta.counts) ? meta.counts : {};
    return {
      records,
      relations: [],
      review_hints: [],
      issues: this.validate(raw),
      metadata: { declared_total: asPositiveInt(counts.total), generated_at: snapshot },
    };
  }
}

export class B1DReviewQueueAdapter implements SourceAdapter {
  readonly source_name = 'b1d_review_queue' as const;
  readonly adapter_version = 'b1d-queue.b3b.1';
  readonly artifact_path = 'docs/data/aninova3-b1d-review-queue.json';

  read(raw: unknown): unknown {
    if (!isObject(raw)) throw new Error('B1D review queue must be an object');
    return raw;
  }

  validate(value: unknown): ValidationIssue[] {
    if (!isObject(value)) return [issue('error', 'queue_shape', 'B1D review queue must be an object')];
    const issues: ValidationIssue[] = [];
    const categories = ['multiSourceNeedsReview', 'comicAdaptsAnime', 'adaptationAfterAnime', 'duplicateMal'] as const;
    let rows = 0;
    for (const category of categories) {
      if (!Array.isArray(value[category])) {
        issues.push(issue('warning', `queue_${category}`, `B1D queue has no ${category} array`));
        continue;
      }
      rows += (value[category] as unknown[]).length;
      for (const [index, item] of (value[category] as unknown[]).entries()) {
        if (!isObject(item)) {
          issues.push(issue('error', 'queue_row', `${category}[${index}] is not an object`));
          continue;
        }
        if (category !== 'duplicateMal' && !asPositiveInt(item.anime)) {
          issues.push(issue('warning', 'queue_anime', `${category}[${index}] has no anime id`));
        }
        const comicIds = category === 'duplicateMal'
          ? (Array.isArray(item.comics) ? item.comics : [])
          : category === 'adaptationAfterAnime'
            ? [item.comic]
            : [
                ...(Array.isArray(item.sources) ? item.sources : []),
                ...(Array.isArray(item.otherEdges) ? item.otherEdges : []),
                ...(Array.isArray(item.laterAdaptations) ? item.laterAdaptations : []),
              ].map((edge) => (isObject(edge) ? edge.comic : null));
        if (comicIds.length === 0) issues.push(issue('warning', 'queue_comic', `${category}[${index}] has no comic id`));
      }
    }
    const counts = isObject(value.counts) ? value.counts : {};
    const declared = asPositiveInt(counts.rowsTotal);
    if (declared && declared !== rows) {
      issues.push(issue('warning', 'queue_total_mismatch', `counts.rowsTotal=${declared} but rows=${rows}`));
    }
    return issues;
  }

  normalize(value: unknown, context: AdapterContext): AdapterBatch {
    const raw = this.read(value) as Record<string, unknown>;
    const snapshot = asIsoDate(raw.generatedAt, context.now) ?? context.now;
    const hints: ReviewHintRecord[] = [];
    const categories = ['multiSourceNeedsReview', 'comicAdaptsAnime', 'adaptationAfterAnime', 'duplicateMal'] as const;
    for (const category of categories) {
      const items = Array.isArray(raw[category]) ? raw[category] : [];
      for (const item of items) {
        if (!isObject(item)) continue;
        const animeIds = category === 'adaptationAfterAnime'
          ? [asPositiveInt(item.anime)].filter((id): id is number => id !== null)
          : category === 'duplicateMal'
            ? []
            : [asPositiveInt(item.anime)].filter((id): id is number => id !== null);
        const comicIds = category === 'duplicateMal'
          ? (Array.isArray(item.comics) ? item.comics.map(asPositiveInt) : [])
          : category === 'adaptationAfterAnime'
            ? [asPositiveInt(item.comic)]
            : [
                ...(Array.isArray(item.sources) ? item.sources : []),
                ...(Array.isArray(item.otherEdges) ? item.otherEdges : []),
                ...(Array.isArray(item.laterAdaptations) ? item.laterAdaptations : []),
              ].map((edge) => (isObject(edge) ? asPositiveInt(edge.comic) : null));
        const cleanComicIds = uniqueStrings(comicIds.filter((id): id is number => id !== null).map(String)).map(Number).sort((a, b) => a - b);
        // The queue can contain more than one hint for the same anime/category;
        // the payload hash keeps every original row addressable instead of
        // silently collapsing it during review de-duplication.
        const key = `${category}:${animeIds.join('-') || 'na'}:${cleanComicIds.join('-') || 'na'}:${hashObject(item).slice(0, 12)}`;
        hints.push({
          source_name: 'b1d_review_queue',
          external_id: key,
          join_key: animeIds.length === 1 ? String(animeIds[0]) : null,
          source_url: null,
          fetched_at: snapshot,
          source_snapshot_at: snapshot,
          terms_review_status: TERMS_UNKNOWN,
          attribution_requirements: ATTRIBUTION_NONE,
          confidence: 1,
          verification_status: 'recorded',
          source_payload_hash: hashObject(item),
          category,
          anime_ids: animeIds,
          comic_anilist_ids: cleanComicIds,
          payload: item,
          link_status: 'unverified',
          row_count: 1,
        });
      }
    }
    return {
      records: [],
      relations: [],
      review_hints: hints,
      issues: this.validate(raw),
      metadata: { declared_total: null, generated_at: snapshot },
    };
  }
}

export const B3C_ADAPTERS: SourceAdapter[] = [
  new AniListGraphAdapter(),
  new ShikimoriMetadataAdapter(),
  new MetadataCandidatesAdapter(),
  new B1DReviewQueueAdapter(),
];
export const B3B_ADAPTERS = B3C_ADAPTERS;

export function normalizeArtifact(adapter: SourceAdapter, raw: unknown, context: AdapterContext): AdapterBatch {
  const read = adapter.read(raw);
  const validation = adapter.validate(read);
  const batch = adapter.normalize(read, context);
  return { ...batch, issues: validation };
}

export { issue, isObject, normalizeWhitespace };
