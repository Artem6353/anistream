import {
  asPositiveInt,
  hashObject,
  hasCyrillic,
  normalizeWhitespace,
  normalizedTitle,
  stableUuid,
  uniqueStrings,
} from './canonical';
import type {
  AdultStatus,
  CandidateRecord,
  GraphComicRecord,
  GraphRelationRecord,
  NormalizedAdaptation,
  NormalizedAlias,
  NormalizedCatalog,
  NormalizedCredit,
  NormalizedExternalId,
  NormalizedPerson,
  NormalizedRelationType,
  NormalizedSourceObservation,
  NormalizedWork,
  ObservationField,
  RelationQuality,
  RelationQualityIssue,
  ReviewHintRecord,
  SourceEnvelope,
  VerifiedMetadataRecord,
  WorkAnnotations,
  WorkConflict,
  WorkKind,
} from './types';

const ALIAS_LIMIT = 300;
const GENRE_LIMIT = 32;
const RELATION_TYPES = new Set<NormalizedRelationType>([
  'ADAPTATION',
  'ALTERNATIVE',
  'CHARACTER',
  'PARENT',
  'PREQUEL',
  'SEQUEL',
  'SIDE_STORY',
  'SPIN_OFF',
  'OTHER',
]);

function positiveOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && value > 0 ? value : null;
}

function validYear(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && value >= 1900 && value <= 2100 ? value : null;
}

function specificKind(value: string | null | undefined): WorkKind | null {
  if (value === 'manhwa' || value === 'manhua' || value === 'webtoon' || value === 'comic' || value === 'one_shot') {
    return value;
  }
  return null;
}

export function kindFromSources(
  comic: Pick<GraphComicRecord, 'format'>,
  meta: Pick<VerifiedMetadataRecord, 'kind' | 'status'> | null,
): { kind: WorkKind; conflict: boolean } {
  const verifiedSpecific = meta?.status === 'SOURCE_VERIFIED' ? specificKind(meta.kind) : null;
  if (verifiedSpecific) {
    return {
      kind: verifiedSpecific,
      conflict: (comic.format === 'ONE_SHOT' && verifiedSpecific !== 'one_shot')
        || (verifiedSpecific === 'one_shot' && comic.format !== 'ONE_SHOT'),
    };
  }
  if (comic.format === 'ONE_SHOT') return { kind: 'one_shot', conflict: false };
  return { kind: 'unknown', conflict: false };
}

function publishingStatusFromGraph(value: string): NormalizedWork['publishing_status'] {
  if (value === 'FINISHED') return 'completed';
  if (value === 'RELEASING') return 'ongoing';
  if (value === 'HIATUS') return 'hiatus';
  if (value === 'CANCELLED') return 'cancelled';
  return 'unknown';
}

function titleStatusFor(meta: VerifiedMetadataRecord | null): NormalizedWork['title_ru_status'] {
  if (!meta) return 'unverified';
  if (meta.status === 'SOURCE_VERIFIED') {
    return meta.title_ru && hasCyrillic(meta.title_ru) ? 'source_verified' : 'candidate';
  }
  if (meta.status === 'NAME_MISMATCH') return 'name_mismatch';
  if (meta.status === 'NO_RU_TITLE') return 'no_ru_title';
  if (meta.status === 'PENDING_REVIEW') return 'candidate';
  return 'unverified';
}

function nativeLanguage(comic: GraphComicRecord): string {
  if (comic.country === 'JP') return 'ja';
  if (comic.country === 'KR') return 'ko';
  if (comic.country === 'CN' || comic.country === 'TW') return 'zh';
  return 'und';
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

function malUrl(id: number): string {
  return `https://myanimelist.net/manga/${id}`;
}

function shikimoriUrl(id: number): string {
  return `https://shikimori.one/mangas/${id}`;
}

export function normalizeRelationType(raw: string): NormalizedRelationType {
  const value = normalizeWhitespace(raw).toUpperCase();
  return RELATION_TYPES.has(value as NormalizedRelationType) ? (value as NormalizedRelationType) : 'unknown';
}

export interface NormalizeInput {
  graphComics: GraphComicRecord[];
  graphRelations: GraphRelationRecord[];
  verified: VerifiedMetadataRecord[];
  candidates: CandidateRecord[];
  queueHints: ReviewHintRecord[];
  knownAnimeIds: Set<number>;
}

export interface NormalizeOutput {
  catalog: NormalizedCatalog;
  warnings: string[];
  skippedAdaptations: number;
  authorNameRecords: number;
  authorNameBuckets: number;
  identifiedAuthors: number;
  relationQuality: RelationQuality;
}

type EnvelopeLike = Pick<SourceEnvelope,
  'source_name' | 'external_id' | 'join_key' | 'source_url' | 'fetched_at' |
  'confidence' | 'verification_status' | 'source_payload_hash'
>;

function observe(
  work: NormalizedWork,
  field: ObservationField,
  value: string | number | boolean | null,
  source: EnvelopeLike,
): NormalizedSourceObservation | null {
  if (value === null || value === undefined || value === '') return null;
  return {
    id: stableUuid(`observation:${work.internal_key}:${field}:${source.source_name}:${source.source_payload_hash.slice(0, 16)}`),
    work_id: work.id,
    field_name: field,
    source_name: source.source_name,
    external_id: source.external_id,
    join_key: source.join_key,
    source_url: source.source_url,
    observed_at: source.fetched_at,
    confidence: source.confidence,
    verification_status: source.verification_status,
    source_payload_hash: source.source_payload_hash,
    value_json: value,
    is_conflict: false,
    conflict_group: null,
  };
}

function resolvePair<T>(left: T | null, right: T | null): { value: T | null; conflict: boolean } {
  if (left !== null && right !== null && left !== right) return { value: null, conflict: true };
  return { value: left ?? right, conflict: false };
}

function markConflict(
  observations: NormalizedSourceObservation[],
  field: ObservationField,
  group: string,
): void {
  for (const item of observations) {
    if (item.field_name !== field) continue;
    item.is_conflict = true;
    item.conflict_group = group;
  }
}

function sourceConflict(
  work: NormalizedWork,
  anilistId: number,
  field: ObservationField,
  observations: NormalizedSourceObservation[],
): WorkConflict {
  return {
    work_id: work.id,
    anilist_id: anilistId,
    field,
    conflict_group: `${work.id}:${field}`,
    values: observations
      .filter((item) => item.field_name === field)
      .map((item) => ({
        source_name: item.source_name,
        external_id: item.external_id,
        join_key: item.join_key,
        value: item.value_json,
        source_url: item.source_url,
        observed_at: item.observed_at,
        confidence: item.confidence,
        source_payload_hash: item.source_payload_hash,
      })),
  };
}

function conflictFieldsFor(comic: GraphComicRecord, meta: VerifiedMetadataRecord | null, candidate: CandidateRecord | null): Set<ObservationField> {
  const conflicts = new Set<ObservationField>();
  if (meta?.mal_id && comic.mal_id && meta.mal_id !== comic.mal_id) conflicts.add('mal_id');
  if (meta?.year && comic.year && meta.year !== comic.year) conflicts.add('publication_year');
  if (positiveOrNull(meta?.chapters) && positiveOrNull(comic.chapters) && meta?.chapters !== comic.chapters) conflicts.add('chapters');
  if (positiveOrNull(meta?.volumes) && positiveOrNull(comic.volumes) && meta?.volumes !== comic.volumes) conflicts.add('volumes');
  if (meta?.kind && meta.status === 'SOURCE_VERIFIED' && specificKind(meta.kind)) {
    const canonical = kindFromSources(comic, meta);
    if (canonical.conflict) conflicts.add('kind');
  }
  if (meta?.title_ru && candidate?.title_ru && normalizedTitle(meta.title_ru) !== normalizedTitle(candidate.title_ru)) {
    conflicts.add('title_ru');
  }
  return conflicts;
}

export function buildNormalizedCatalog(input: NormalizeInput): NormalizeOutput {
  const verifiedById = new Map(input.verified.map((item) => [item.anilist_id, item]));
  const candidatesById = new Map(input.candidates.map((item) => [item.anilist_id, item]));
  const warnings: string[] = [];
  const works: NormalizedWork[] = [];
  const externalIds: NormalizedExternalId[] = [];
  const aliases: NormalizedAlias[] = [];
  const peopleById = new Map<string, NormalizedPerson>();
  const credits: NormalizedCredit[] = [];
  const adaptations: NormalizedAdaptation[] = [];
  const observations: NormalizedSourceObservation[] = [];
  const conflicts: WorkConflict[] = [];
  const annotations = new Map<number, WorkAnnotations>();
  const aliasKeys = new Set<string>();
  const workIds = new Set<string>();
  const workByInternalKey = new Map<string, NormalizedWork>();
  let skippedAdaptations = 0;

  for (const comic of [...input.graphComics].sort((a, b) => a.anilist_id - b.anilist_id)) {
    const meta = verifiedById.get(comic.anilist_id) ?? null;
    const candidate = candidatesById.get(comic.anilist_id) ?? null;
    const workId = stableUuid(`work:${comic.anilist_id}`);
    if (workIds.has(workId)) {
      warnings.push(`duplicate internal work id for AniList ${comic.anilist_id}`);
      continue;
    }
    workIds.add(workId);
    const titleStatus = titleStatusFor(meta);
    const publicTitle = titleStatus === 'source_verified' && meta?.title_ru && hasCyrillic(meta.title_ru) ? meta.title_ru : null;
    const kindResult = kindFromSources(comic, meta);
    const conflictFields = conflictFieldsFor(comic, meta, candidate);
    const work: NormalizedWork = {
      id: workId,
      internal_key: `comic:anilist:${comic.anilist_id}`,
      slug: `comic-${comic.anilist_id}`,
      title_ru: publicTitle,
      title_ru_status: titleStatus,
      kind: kindResult.kind,
      source_kind_raw: comic.format,
      country_code: comic.country && /^[A-Z]{2}$/.test(comic.country) ? comic.country : null,
      publication_year: resolvePair(validYear(comic.year), validYear(meta?.year ?? null)).value,
      release_date: null,
      release_date_precision: 'unknown',
      publishing_status: publishingStatusFromGraph(comic.status),
      description_ru: null,
      cover_url: comic.cover_url ?? meta?.cover_url ?? null,
      total_chapters_known: resolvePair(positiveOrNull(comic.chapters), positiveOrNull(meta?.chapters ?? null)).value,
      volumes_known: resolvePair(positiveOrNull(comic.volumes), positiveOrNull(meta?.volumes ?? null)).value,
      genres: meta?.status === 'SOURCE_VERIFIED' ? uniqueStrings(meta.genres).slice(0, GENRE_LIMIT) : [],
      is_adult: false,
      content_rating_status: 'unknown' satisfies AdultStatus,
      content_rating_source: null,
      content_rating_checked_at: null,
      content_rating_evidence_url: null,
      publication_status: 'draft',
      published_at: null,
      origin_source_name: 'anilist',
      origin_source_url: comic.source_url ?? `https://anilist.co/manga/${comic.anilist_id}`,
      origin_fetched_at: comic.fetched_at,
      metadata_checked_at: meta?.checked_at ?? null,
      metadata_confidence: meta?.status === 'SOURCE_VERIFIED' ? 0.9 : null,
    };
    works.push(work);
    workByInternalKey.set(work.internal_key, work);

    const workObservations: NormalizedSourceObservation[] = [];
    const pushObservation = (field: ObservationField, value: string | number | boolean | null, source: EnvelopeLike): void => {
      const item = observe(work, field, value, source);
      if (item) workObservations.push(item);
    };
    pushObservation('kind', comic.format, comic);
    pushObservation('publication_year', validYear(comic.year), comic);
    pushObservation('chapters', positiveOrNull(comic.chapters), comic);
    pushObservation('volumes', positiveOrNull(comic.volumes), comic);
    pushObservation('mal_id', comic.mal_id, comic);
    pushObservation('title_original', comic.title_original, comic);
    if (meta) {
      pushObservation('kind', meta.kind, meta);
      pushObservation('publication_year', validYear(meta.year), meta);
      pushObservation('chapters', positiveOrNull(meta.chapters), meta);
      pushObservation('volumes', positiveOrNull(meta.volumes), meta);
      pushObservation('mal_id', meta.mal_id, meta);
      pushObservation('shikimori_id', meta.shikimori_id, meta);
      pushObservation('title_ru', meta.title_ru, meta);
    }
    if (candidate) {
      pushObservation('kind', candidate.kind, candidate);
      pushObservation('publication_year', validYear(candidate.year), candidate);
      pushObservation('mal_id', candidate.mal_id, candidate);
      pushObservation('title_ru', candidate.title_ru, candidate);
    }

    for (const field of conflictFields) {
      markConflict(workObservations, field, `${work.id}:${field}`);
      conflicts.push(sourceConflict(work, comic.anilist_id, field, workObservations));
    }
    observations.push(...workObservations);

    const canonicalMal = resolvePair(comic.mal_id, meta?.mal_id ?? null).value;
    annotations.set(comic.anilist_id, {
      anilist_id: comic.anilist_id,
      verified_status: meta?.status ?? null,
      has_verified: Boolean(meta),
      conflicts: [...conflictFields],
      mal_id: canonicalMal,
      shikimori_id: meta?.shikimori_id ?? null,
      candidate_title: candidate?.title_ru ?? meta?.title_ru ?? null,
    });

    externalIds.push({
      id: stableUuid(`external:${work.internal_key}:anilist`),
      work_id: work.id,
      source_name: 'anilist',
      external_id: String(comic.anilist_id),
      source_url: comic.source_url,
      is_primary: true,
      fetched_at: comic.fetched_at,
      last_verified_at: maxIso(comic.fetched_at, comic.fetched_at),
      verification_status: 'source_verified',
      confidence: 1,
      source_payload_hash: comic.source_payload_hash,
    });
    if (canonicalMal) {
      const useMeta = !comic.mal_id || (meta?.mal_id === canonicalMal && comic.mal_id !== canonicalMal);
      const source = useMeta && meta ? meta : comic;
      externalIds.push({
        id: stableUuid(`external:${work.internal_key}:mal`),
        work_id: work.id,
        source_name: 'mal',
        external_id: String(canonicalMal),
        source_url: malUrl(canonicalMal),
        is_primary: false,
        fetched_at: source.fetched_at,
        last_verified_at: maxIso(source.fetched_at, meta?.checked_at ?? source.fetched_at),
        verification_status: meta?.status === 'SOURCE_VERIFIED' && meta.mal_id === canonicalMal ? 'source_verified' : 'recorded',
        confidence: useMeta ? 0.9 : 0.9,
        source_payload_hash: useMeta && meta ? meta.source_payload_hash : comic.source_payload_hash,
      });
    }
    if (meta?.shikimori_id) {
      externalIds.push({
        id: stableUuid(`external:${work.internal_key}:shikimori`),
        work_id: work.id,
        source_name: 'shikimori',
        external_id: String(meta.shikimori_id),
        source_url: meta.source_url ?? shikimoriUrl(meta.shikimori_id),
        is_primary: false,
        fetched_at: meta.fetched_at,
        last_verified_at: maxIso(meta.fetched_at, meta.checked_at ?? meta.fetched_at),
        verification_status: meta.status === 'SOURCE_VERIFIED' ? 'source_verified' : 'recorded',
        confidence: 0.9,
        source_payload_hash: hashObject({ source: 'shikimori', id: meta.shikimori_id, work: work.internal_key }),
      });
    }

    addAlias(aliases, aliasKeys, {
      work_id: work.id,
      alias: comic.title_original,
      alias_type: 'original_title',
      language: 'und',
      is_public: false,
      source_name: 'anilist',
      source_url: comic.source_url,
      fetched_at: comic.fetched_at,
      checked_at: null,
      confidence: 0.9,
      verification_status: 'source_verified',
    });
    if (comic.title_native) {
      addAlias(aliases, aliasKeys, {
        work_id: work.id,
        alias: comic.title_native,
        alias_type: 'native_title',
        language: nativeLanguage(comic),
        is_public: false,
        source_name: 'anilist',
        source_url: comic.source_url,
        fetched_at: comic.fetched_at,
        checked_at: null,
        confidence: 0.9,
        verification_status: 'source_verified',
      });
    }
    if (meta?.title_ru && meta.status === 'SOURCE_VERIFIED') {
      addAlias(aliases, aliasKeys, {
        work_id: work.id,
        alias: meta.title_ru,
        alias_type: 'official_russian',
        language: 'ru',
        is_public: true,
        source_name: 'shikimori',
        source_url: meta.source_url,
        fetched_at: meta.fetched_at,
        checked_at: meta.checked_at,
        confidence: 1,
        verification_status: 'source_verified',
      });
    } else if (meta?.title_ru) {
      addAlias(aliases, aliasKeys, {
        work_id: work.id,
        alias: meta.title_ru,
        alias_type: 'alternative_title',
        language: 'ru',
        is_public: false,
        source_name: 'shikimori',
        source_url: meta.source_url,
        fetched_at: meta.fetched_at,
        checked_at: meta.checked_at,
        confidence: meta.confidence ?? 0.4,
        verification_status: meta.status === 'NAME_MISMATCH' ? 'conflict' : 'candidate',
      });
    }
    if (meta?.license_name_ru && meta.license_name_ru !== meta.title_ru) {
      addAlias(aliases, aliasKeys, {
        work_id: work.id,
        alias: meta.license_name_ru,
        alias_type: 'alternative_title',
        language: 'ru',
        is_public: false,
        source_name: 'shikimori',
        source_url: meta.source_url,
        fetched_at: meta.fetched_at,
        checked_at: meta.checked_at,
        confidence: 0.3,
        verification_status: 'candidate',
      });
    }
    if (!meta && candidate?.title_ru) {
      addAlias(aliases, aliasKeys, {
        work_id: work.id,
        alias: candidate.title_ru,
        alias_type: 'alternative_title',
        language: 'ru',
        is_public: false,
        source_name: 'shikimori',
        source_url: candidate.source_url,
        fetched_at: candidate.fetched_at,
        checked_at: candidate.checked_at,
        confidence: 0.4,
        verification_status: 'candidate',
      });
    }

    const authorNames = uniqueStrings(comic.authors).filter((name) => name.length <= 300);
    for (const [index, author] of authorNames.entries()) {
      const nameKey = normalizedTitle(author);
      const personId = stableUuid(`name-bucket:${work.id}:${nameKey}`);
      if (!peopleById.has(personId)) {
        peopleById.set(personId, {
          id: personId,
          canonical_name: author,
          display_name_ru: null,
          name_status: 'unverified',
          identity_status: 'unidentified_name_bucket',
          name_bucket_key: `${work.internal_key}:${nameKey}`,
          source_name: 'anilist',
          source_person_id: null,
          source_url: comic.source_url ?? `https://anilist.co/manga/${comic.anilist_id}`,
          fetched_at: comic.fetched_at,
          checked_at: null,
          confidence: 0.8,
          verification_status: 'recorded',
          is_public: false,
        });
      }
      credits.push({
        id: stableUuid(`credit:${work.internal_key}:${personId}:author`),
        work_id: work.id,
        person_id: personId,
        role: 'author',
        billing_order: index,
        source_name: 'anilist',
        source_url: comic.source_url ?? `https://anilist.co/manga/${comic.anilist_id}`,
        fetched_at: comic.fetched_at,
        checked_at: null,
        confidence: 0.8,
        verification_status: 'recorded',
        is_public: false,
      });
    }
  }

  const relationIssues: RelationQualityIssue[] = [];
  const seenEdges = new Set<string>();
  const unknownRawTypes = new Set<string>();
  let missingAnime = 0;
  let missingComic = 0;
  let duplicateEdges = 0;
  let missingEvidence = 0;
  for (const relation of input.graphRelations) {
    const edgeKey = `${relation.anime_id}:${relation.comic_anilist_id}`;
    const work = workByInternalKey.get(`comic:anilist:${relation.comic_anilist_id}`);
    const rawType = normalizeWhitespace(relation.raw_relation_type).slice(0, 64);
    const normalizedType = normalizeRelationType(rawType);
    if (!work) {
      missingComic += 1;
      skippedAdaptations += 1;
      relationIssues.push({ code: 'missing_comic', anime_id: relation.anime_id, comic_anilist_id: relation.comic_anilist_id, raw_relation_type: rawType, detail: 'comic work is absent from the normalized graph' });
      continue;
    }
    if (!input.knownAnimeIds.has(relation.anime_id)) {
      missingAnime += 1;
      skippedAdaptations += 1;
      relationIssues.push({ code: 'missing_anime', anime_id: relation.anime_id, comic_anilist_id: relation.comic_anilist_id, raw_relation_type: rawType, detail: 'anime id is absent from titles.json' });
      continue;
    }
    if (seenEdges.has(edgeKey)) {
      duplicateEdges += 1;
      relationIssues.push({ code: 'duplicate_edge', anime_id: relation.anime_id, comic_anilist_id: relation.comic_anilist_id, raw_relation_type: rawType, detail: 'same anime/comic edge appeared more than once; first observation kept' });
      continue;
    }
    seenEdges.add(edgeKey);
    if (normalizedType === 'unknown') {
      unknownRawTypes.add(rawType);
      relationIssues.push({ code: 'unknown_relation_type', anime_id: relation.anime_id, comic_anilist_id: relation.comic_anilist_id, raw_relation_type: rawType, detail: 'raw relation type has no unambiguous normalization' });
    }
    const sourceUrl = relation.source_url;
    if (!sourceUrl) {
      missingEvidence += 1;
      relationIssues.push({ code: 'missing_evidence', anime_id: relation.anime_id, comic_anilist_id: relation.comic_anilist_id, raw_relation_type: rawType, detail: 'relation has no source URL' });
    }
    adaptations.push({
      id: stableUuid(`adaptation:${relation.anime_id}:${relation.comic_anilist_id}`),
      anime_id: relation.anime_id,
      comic_work_id: work.id,
      raw_relation_type: rawType,
      normalized_relation_type: normalizedType,
      direction: 'unknown',
      confidence_level: 'unknown',
      basis: 'anilist_relation_only',
      is_primary: false,
      source_name: 'anilist',
      source_url: sourceUrl,
      observed_at: relation.observed_at,
      checked_at: null,
      verification_status: 'recorded',
      is_public: false,
    });
  }

  if (missingAnime > 0) warnings.push(`${missingAnime} adaptation edges have an anime id absent from titles.json`);
  if (missingComic > 0) warnings.push(`${missingComic} adaptation edges reference a comic absent from the graph`);
  if (duplicateEdges > 0) warnings.push(`${duplicateEdges} duplicate adaptation edges were collapsed; the first observation was kept`);
  if (unknownRawTypes.size > 0) warnings.push(`${unknownRawTypes.size} raw relation types have no unambiguous normalization`);

  const authorNameRecords = new Set([...peopleById.values()].map((person) => normalizedTitle(person.canonical_name))).size;
  const identifiedAuthors = [...peopleById.values()].filter((person) => person.source_person_id !== null).length;
  const directionCategories = new Map<number, Set<string>>();
  for (const hint of input.queueHints) {
    if (hint.category !== 'comicAdaptsAnime' && hint.category !== 'adaptationAfterAnime') continue;
    for (const animeId of hint.anime_ids) {
      const categories = directionCategories.get(animeId) ?? new Set<string>();
      categories.add(hint.category);
      directionCategories.set(animeId, categories);
    }
  }
  const contradictoryDirectionAnimeIds = [...directionCategories]
    .filter(([, categories]) => categories.size > 1)
    .map(([animeId]) => animeId)
    .sort((a, b) => a - b);
  for (const animeId of contradictoryDirectionAnimeIds) {
    relationIssues.push({
      code: 'contradictory_direction', anime_id: animeId, comic_anilist_id: null, raw_relation_type: null,
      detail: 'B1D contains both comic_adapts_anime and adaptation_after_anime hints; direction stays unknown',
    });
  }
  const contradictoryDirections = contradictoryDirectionAnimeIds.length;
  if (contradictoryDirections > 0) warnings.push(`${contradictoryDirections} anime ids have both comic_adapts_anime and adaptation_after_anime B1D hints; direction stays unknown`);
  const relationQuality: RelationQuality = {
    totalEdges: input.graphRelations.length,
    insertedEdges: adaptations.length,
    missingAnime,
    missingComic,
    duplicateEdges,
    contradictoryDirections,
    multiplePrimary: 0,
    unknownRawTypes: unknownRawTypes.size,
    missingEvidence,
    unknownRawTypeNames: [...unknownRawTypes].sort(),
    issues: relationIssues,
  };

  return {
    catalog: {
      works,
      source_observations: observations,
      external_ids: externalIds,
      aliases,
      people: [...peopleById.values()],
      credits,
      adaptations,
      relations: [],
      review_queue: [],
      annotations,
      queue_hints: input.queueHints,
      conflicts,
      relation_quality: relationQuality,
    },
    warnings,
    skippedAdaptations,
    authorNameRecords,
    authorNameBuckets: peopleById.size,
    identifiedAuthors,
    relationQuality,
  };
}

function addAlias(
  aliases: NormalizedAlias[],
  keys: Set<string>,
  input: Omit<NormalizedAlias, 'id'>,
): void {
  const alias = normalizeWhitespace(input.alias);
  if (!alias || alias.length > ALIAS_LIMIT) return;
  const key = `${input.work_id}|${input.source_name}|${input.alias_type}|${normalizedTitle(alias)}`;
  if (keys.has(key)) return;
  keys.add(key);
  aliases.push({
    ...input,
    alias,
    id: stableUuid(`alias:${input.work_id}:${input.source_name}:${input.alias_type}:${normalizedTitle(alias)}`),
  });
}

export function externalIdKey(source: string, externalId: string): string {
  return `${source}:${externalId}`;
}

export function asPositive(value: unknown): number | null {
  return asPositiveInt(value);
}
