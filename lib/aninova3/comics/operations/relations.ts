import { collectContradictoryAnimeIds } from './dashboard';
import {
  CONTRADICTORY_ANIME_IDS,
  asNumberArray,
  asRecord,
  compareText,
  type AdaptationRow,
  type ComicWorkRow,
  type ReviewItemRow,
} from './model';

export const KNOWN_RAW_RELATION_TYPES = [
  'ADAPTATION',
  'ALTERNATIVE',
  'CHARACTER',
  'PARENT',
  'PREQUEL',
  'SEQUEL',
  'SIDE_STORY',
  'SPIN_OFF',
  'OTHER',
] as const;

export const KNOWN_NORMALIZED_RELATION_TYPES = [
  ...KNOWN_RAW_RELATION_TYPES,
  'unknown',
] as const;

export interface RelationHint {
  id: string;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  action: string | null;
  priority: number;
}

export interface RelationLink {
  id: string;
  animeId: number;
  comicWorkId: string;
  internalKey: string | null;
  titleRu: string | null;
  rawType: string;
  normalizedType: string;
  knownRawType: boolean;
  direction: string;
  confidence: string;
  basis: string;
  verificationStatus: string;
  isPrimary: boolean;
  isPublic: boolean;
  sourceName: string;
  sourceUrl: string | null;
  observedAt: string;
  checkedAt: string | null;
  isContradictory: boolean;
  hints: RelationHint[];
  policyWarnings: string[];
}

export interface RelationSummary {
  total: number;
  by_raw_type: Record<string, number>;
  by_normalized_type: Record<string, number>;
  unknown_normalized: number;
  recorded: number;
  source_verified: number;
  editorially_verified: number;
  disputed: number;
  primary: number;
  public: number;
  missing_evidence: number;
  contradictory_links: number;
  policy_violations: number;
}

export interface RelationContradiction {
  animeId: number;
  hintCount: number;
  categories: string[];
  linkCount: number;
  hints: RelationHint[];
}

export interface RelationInspection {
  summary: RelationSummary;
  links: RelationLink[];
  contradictions: RelationContradiction[];
  knownContradictoryIds: number[];
  highlighted: RelationLink[];
  directionDecision: 'not_made';
  autoConfirmation: false;
}

function hintFromItem(item: ReviewItemRow): RelationHint {
  const details = asRecord(item.details);
  return {
    id: item.id,
    category: typeof details.b1d_category === 'string' ? details.b1d_category : null,
    sourceName: typeof details.source_name === 'string' ? details.source_name : null,
    sourceUrl: typeof details.source_url === 'string' ? details.source_url : null,
    action: typeof details.action === 'string' ? details.action : null,
    priority: item.priority,
  };
}

function animeIdsOfItem(item: ReviewItemRow): number[] {
  const details = asRecord(item.details);
  const ids = new Set<number>(asNumberArray(details.anime_ids));
  if (Array.isArray(details.linked_edges)) {
    for (const edge of details.linked_edges) {
      const animeId = asRecord(edge).anime_id;
      if (typeof animeId === 'number' && Number.isFinite(animeId)) ids.add(animeId);
    }
  }
  return [...ids];
}

function policyWarnings(row: AdaptationRow): string[] {
  const warnings: string[] = [];
  if (!KNOWN_RAW_RELATION_TYPES.includes(row.raw_relation_type as (typeof KNOWN_RAW_RELATION_TYPES)[number])) {
    warnings.push(`raw type ${row.raw_relation_type} не поддержан; RELATED не синтезируется.`);
  }
  if (row.normalized_relation_type === 'RELATED') {
    warnings.push('RELATED не является допустимой нормализацией.');
  }
  if (row.normalized_relation_type === 'ADAPTATION' && row.is_primary) {
    warnings.push('ADAPTATION не доказывает, что комикс — первоисточник; primary недопустим без отдельного evidence.');
  }
  if (['CHARACTER', 'PARENT', 'SIDE_STORY', 'SPIN_OFF'].includes(row.normalized_relation_type) && (row.is_primary || row.is_public)) {
    warnings.push(`${row.normalized_relation_type} не должен становиться primary/public.`);
  }
  if (row.verification_status === 'recorded' && row.direction !== 'unknown') {
    warnings.push('Запись recorded содержит направление; оно не подтверждено.');
  }
  if (row.verification_status === 'recorded' && row.confidence_level !== 'unknown') {
    warnings.push('Запись recorded содержит confidence; он не подтверждён.');
  }
  if (row.verification_status === 'recorded' && (row.is_primary || row.is_public)) {
    warnings.push('Запись recorded отмечена primary/public; это нарушает консервативный gate.');
  }
  if (row.is_primary && row.direction === 'unknown') {
    warnings.push('primary при direction=unknown не подтверждает направление.');
  }
  return warnings;
}

export function buildRelationInspection(
  adaptations: AdaptationRow[],
  works: ComicWorkRow[],
  reviewItems: ReviewItemRow[],
): RelationInspection {
  const workById = new Map(works.map((work) => [work.id, work]));
  const contradictoryIds = collectContradictoryAnimeIds(reviewItems);
  const contradictorySet = new Set(contradictoryIds);
  const hintsByAnime = new Map<number, ReviewItemRow[]>();
  for (const item of reviewItems) {
    for (const animeId of animeIdsOfItem(item)) {
      const bucket = hintsByAnime.get(animeId) ?? [];
      bucket.push(item);
      hintsByAnime.set(animeId, bucket);
    }
  }
  const byRaw: Record<string, number> = {};
  const byNormalized: Record<string, number> = {};
  const links = adaptations.map((row): RelationLink => {
    const work = workById.get(row.comic_work_id);
    const hints = (hintsByAnime.get(row.anime_id) ?? []).map(hintFromItem);
    byRaw[row.raw_relation_type] = (byRaw[row.raw_relation_type] ?? 0) + 1;
    byNormalized[row.normalized_relation_type] = (byNormalized[row.normalized_relation_type] ?? 0) + 1;
    return {
      id: row.id,
      animeId: row.anime_id,
      comicWorkId: row.comic_work_id,
      internalKey: work?.internal_key ?? null,
      titleRu: work?.title_ru ?? null,
      rawType: row.raw_relation_type,
      normalizedType: row.normalized_relation_type,
      knownRawType: KNOWN_RAW_RELATION_TYPES.includes(row.raw_relation_type as (typeof KNOWN_RAW_RELATION_TYPES)[number]),
      direction: row.direction,
      confidence: row.confidence_level,
      basis: row.basis,
      verificationStatus: row.verification_status,
      isPrimary: row.is_primary,
      isPublic: row.is_public,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      observedAt: row.observed_at,
      checkedAt: row.checked_at,
      isContradictory: contradictorySet.has(row.anime_id),
      hints,
      policyWarnings: policyWarnings(row),
    };
  }).sort((left, right) => left.animeId - right.animeId
    || compareText(left.internalKey ?? '', right.internalKey ?? '')
    || left.id.localeCompare(right.id));

  const contradictions = contradictoryIds.map((animeId) => {
    const hints = (hintsByAnime.get(animeId) ?? []).map(hintFromItem);
    const uniqueHints = [...new Map(hints.map((hint) => [hint.id, hint])).values()];
    return {
      animeId,
      hintCount: uniqueHints.length,
      categories: [...new Set(uniqueHints.map((hint) => hint.category).filter((value): value is string => Boolean(value)))].sort(compareText),
      linkCount: links.filter((link) => link.animeId === animeId).length,
      hints: uniqueHints,
    };
  });

  const summary: RelationSummary = {
    total: links.length,
    by_raw_type: byRaw,
    by_normalized_type: byNormalized,
    unknown_normalized: links.filter((link) => link.normalizedType === 'unknown').length,
    recorded: links.filter((link) => link.verificationStatus === 'recorded').length,
    source_verified: links.filter((link) => link.verificationStatus === 'source_verified').length,
    editorially_verified: links.filter((link) => link.verificationStatus === 'editorially_verified').length,
    disputed: links.filter((link) => link.verificationStatus === 'disputed').length,
    primary: links.filter((link) => link.isPrimary).length,
    public: links.filter((link) => link.isPublic).length,
    missing_evidence: links.filter((link) => link.sourceUrl === null).length,
    contradictory_links: links.filter((link) => link.isContradictory).length,
    policy_violations: links.filter((link) => link.policyWarnings.length > 0).length,
  };

  return {
    summary,
    links,
    contradictions,
    knownContradictoryIds: [...CONTRADICTORY_ANIME_IDS],
    highlighted: links.filter((link) => (CONTRADICTORY_ANIME_IDS as readonly number[]).includes(link.animeId)),
    directionDecision: 'not_made',
    autoConfirmation: false,
  };
}

export function relationAnimeIds(reviewItems: ReviewItemRow[]): number[] {
  return collectContradictoryAnimeIds(reviewItems);
}
