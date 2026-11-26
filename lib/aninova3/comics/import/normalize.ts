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
  CandidateRecord,
  GraphComicRecord,
  GraphRelationRecord,
  NormalizedAdaptation,
  NormalizedAlias,
  NormalizedCatalog,
  NormalizedCredit,
  NormalizedExternalId,
  NormalizedPerson,
  NormalizedWork,
  ReviewHintRecord,
  VerifiedMetadataRecord,
  WorkAnnotations,
  WorkKind,
} from './types';

const ALIAS_LIMIT = 300;
const GENRE_LIMIT = 32;

function positiveOrNull(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

function validYear(value: number | null): number | null {
  return value !== null && value >= 1900 && value <= 2100 ? value : null;
}

function kindFromGraph(comic: GraphComicRecord, meta: VerifiedMetadataRecord | null): WorkKind {
  if (comic.format === 'ONE_SHOT') return 'one_shot';
  const country = comic.country?.toUpperCase();
  if (country === 'KR') return 'manhwa';
  if (country === 'CN' || country === 'TW') return 'manhua';
  const metaKind = meta?.kind;
  if (metaKind === 'manhwa' || metaKind === 'manhua' || metaKind === 'webtoon' || metaKind === 'one_shot' || metaKind === 'comic') {
    return metaKind;
  }
  return 'manga';
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
    const conflicts: string[] = [];
    if (meta?.status === 'SOURCE_VERIFIED' && meta.title_ru && !hasCyrillic(meta.title_ru)) {
      conflicts.push('title_not_cyrillic');
    }
    if (meta?.mal_id && comic.mal_id && meta.mal_id !== comic.mal_id) conflicts.push('mal_id');
    if (meta?.year && comic.year && meta.year !== comic.year) conflicts.push('year');
    if (meta?.chapters && comic.chapters && meta.chapters !== comic.chapters) conflicts.push('chapters');
    if (meta?.volumes && comic.volumes && meta.volumes !== comic.volumes) conflicts.push('volumes');
    const kind = kindFromGraph(comic, meta);
    if (meta?.kind && meta.kind !== kind) conflicts.push('kind');
    if (conflicts.length > 0 && meta?.status === 'SOURCE_VERIFIED') {
      warnings.push(`source conflicts for AniList ${comic.anilist_id}: ${conflicts.join(',')}`);
    }
    const work: NormalizedWork = {
      id: workId,
      internal_key: `comic:anilist:${comic.anilist_id}`,
      slug: `comic-${comic.anilist_id}`,
      title_ru: publicTitle,
      title_ru_status: titleStatus,
      kind,
      country_code: comic.country && /^[A-Z]{2}$/.test(comic.country) ? comic.country : null,
      publication_year: validYear(comic.year) ?? validYear(meta?.year ?? null),
      release_date: null,
      release_date_precision: 'unknown',
      publishing_status: publishingStatusFromGraph(comic.status),
      description_ru: null,
      cover_url: comic.cover_url ?? meta?.cover_url ?? null,
      total_chapters_known: positiveOrNull(comic.chapters) ?? positiveOrNull(meta?.chapters ?? null),
      volumes_known: positiveOrNull(comic.volumes) ?? positiveOrNull(meta?.volumes ?? null),
      genres: meta?.status === 'SOURCE_VERIFIED' ? uniqueStrings(meta.genres).slice(0, GENRE_LIMIT) : [],
      is_adult: false,
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
    annotations.set(comic.anilist_id, {
      anilist_id: comic.anilist_id,
      verified_status: meta?.status ?? null,
      has_verified: Boolean(meta),
      conflicts,
      mal_id: comic.mal_id ?? meta?.mal_id ?? null,
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
    if (comic.mal_id) {
      const verifiedAt = meta?.checked_at ? maxIso(comic.fetched_at, meta.checked_at) : comic.fetched_at;
      externalIds.push({
        id: stableUuid(`external:${work.internal_key}:mal`),
        work_id: work.id,
        source_name: 'mal',
        external_id: String(comic.mal_id),
        source_url: malUrl(comic.mal_id),
        is_primary: false,
        fetched_at: comic.fetched_at,
        last_verified_at: verifiedAt,
        verification_status: meta?.status === 'SOURCE_VERIFIED' ? 'source_verified' : 'recorded',
        confidence: 0.9,
        source_payload_hash: hashObject({ source: 'mal', id: comic.mal_id, work: work.internal_key }),
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
      const personKey = normalizedTitle(author);
      const personId = stableUuid(`person:anilist:${personKey}`);
      if (!peopleById.has(personId)) {
        peopleById.set(personId, {
          id: personId,
          canonical_name: author,
          display_name_ru: null,
          name_status: 'unverified',
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

  for (const relation of input.graphRelations) {
    const work = workByInternalKey.get(`comic:anilist:${relation.comic_anilist_id}`);
    if (!work || !input.knownAnimeIds.has(relation.anime_id)) {
      skippedAdaptations += 1;
      continue;
    }
    const rawType = normalizeWhitespace(relation.raw_relation_type).slice(0, 64);
    adaptations.push({
      id: stableUuid(`adaptation:${relation.anime_id}:${relation.comic_anilist_id}`),
      anime_id: relation.anime_id,
      comic_work_id: work.id,
      raw_relation_type: rawType,
      direction: 'unknown',
      confidence_level: 'unknown',
      basis: 'anilist_relation_only',
      is_primary: false,
      source_name: 'anilist',
      source_url: relation.source_url ?? `https://anilist.co/anime/${relation.anime_id}`,
      observed_at: relation.observed_at,
      checked_at: null,
      verification_status: 'recorded',
      is_public: false,
    });
  }

  return {
    catalog: {
      works,
      external_ids: externalIds,
      aliases,
      people: [...peopleById.values()],
      credits,
      adaptations,
      relations: [],
      review_queue: [],
      annotations,
      queue_hints: input.queueHints,
    },
    warnings,
    skippedAdaptations,
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
