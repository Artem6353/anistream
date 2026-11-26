import {
  SOURCE_CONFLICT_REASONS,
  asRecord,
  compareText,
  uniqueSorted,
  workLabel,
  type ComicWorkRow,
  type ReviewItemRow,
  type SourceObservationRow,
} from './model';

export const CONFLICT_FIELD_LABELS: Record<string, string> = {
  kind: 'kind / формат',
  publication_year: 'год публикации',
  chapters: 'число глав',
  volumes: 'число томов',
  mal_id: 'MAL ID',
  shikimori_id: 'Shikimori ID',
  title_ru: 'RU-название',
  title_original: 'оригинальное название',
  content_rating: 'возрастной рейтинг',
  adult_status: 'adult-статус',
};

const FIELD_ORDER = Object.keys(CONFLICT_FIELD_LABELS);

export interface SourceConflictValue {
  observationId: string;
  sourceName: string;
  externalId: string | null;
  joinKey: string | null;
  value: unknown;
  sourceUrl: string | null;
  observedAt: string;
  confidence: number | null;
  verificationStatus: string;
  payloadHash: string;
  isConflict: boolean;
}

export interface SourceConflictGroup {
  key: string;
  workId: string;
  field: string;
  fieldLabel: string;
  conflictGroup: string;
  values: SourceConflictValue[];
  distinctValues: number;
  resolution: 'unresolved';
  canonicalValue: null;
  winnerSelected: false;
  nonCanonicalReason: string;
  reviewItemIds: string[];
  warnings: string[];
}

export interface WorkConflictView {
  work: ComicWorkRow;
  groups: SourceConflictGroup[];
  observationCount: number;
  conflictObservationCount: number;
  reviewItemIds: string[];
  warnings: string[];
}

function groupKey(observation: SourceObservationRow): string {
  return `${observation.work_id}:${observation.field_name}:${observation.conflict_group ?? '__ungrouped__'}`;
}

function reviewItemsForField(items: ReviewItemRow[], workId: string, field: string): ReviewItemRow[] {
  return items.filter((item) => {
    if (item.work_id !== workId) return false;
    const details = asRecord(item.details);
    if (details.field === field) return true;
    return item.item_ref === `conflict:${field}`;
  });
}

function nonCanonicalReason(items: ReviewItemRow[]): string {
  for (const item of items) {
    const details = asRecord(item.details);
    const action = typeof details.canonical_action === 'string'
      ? details.canonical_action
      : typeof details.action === 'string' ? details.action : null;
    if (action) return `Зафиксировано в review: ${action}. Значение источника не канонизировано.`;
  }
  return 'Значение источника сохранено как наблюдение; каноническое значение не выбрано.';
}

function distinctValueCount(values: SourceConflictValue[]): number {
  return new Set(values.map((value) => JSON.stringify(value.value))).size;
}

export function buildSourceConflicts(observations: SourceObservationRow[], reviewItems: ReviewItemRow[]): SourceConflictGroup[] {
  const groups = new Map<string, { observation: SourceObservationRow; values: Map<string, SourceConflictValue> }>();
  for (const observation of observations) {
    if (!observation.is_conflict || !observation.conflict_group) continue;
    const key = groupKey(observation);
    if (!groups.has(key)) groups.set(key, { observation, values: new Map() });
  }
  if (groups.size === 0) return [];

  for (const observation of observations) {
    const matchingKeys = observation.is_conflict && observation.conflict_group
      ? [groupKey(observation)]
      : [...groups.values()]
          .filter((entry) => entry.observation.work_id === observation.work_id
            && entry.observation.field_name === observation.field_name)
          .map((entry) => groupKey(entry.observation));
    for (const key of matchingKeys) {
      const entry = groups.get(key);
      if (!entry) continue;
      entry.values.set(observation.id, {
        observationId: observation.id,
        sourceName: observation.source_name,
        externalId: observation.external_id,
        joinKey: observation.join_key,
        value: observation.value_json,
        sourceUrl: observation.source_url,
        observedAt: observation.observed_at,
        confidence: observation.confidence,
        verificationStatus: observation.verification_status,
        payloadHash: observation.source_payload_hash,
        isConflict: observation.is_conflict,
      });
    }
  }

  return [...groups.entries()].map(([key, entry]) => {
    const workId = entry.observation.work_id;
    const field = entry.observation.field_name;
    const related = reviewItemsForField(reviewItems, workId, field);
    const values = [...entry.values.values()].sort(
      (left, right) => compareText(left.sourceName, right.sourceName) || compareText(String(left.externalId ?? ''), String(right.externalId ?? '')),
    );
    const warnings: string[] = [];
    if (values.some((value) => value.sourceUrl === null)) warnings.push('У части значений нет source URL.');
    if (related.length === 0) warnings.push('Для конфликта не найден связанный review item; значения всё равно показаны как есть.');
    if (values.length < 2) warnings.push('В группе меньше двух source-наблюдений; проверьте conflict_group.');
    return {
      key,
      workId,
      field,
      fieldLabel: CONFLICT_FIELD_LABELS[field] ?? field,
      conflictGroup: entry.observation.conflict_group ?? '__ungrouped__',
      values,
      distinctValues: distinctValueCount(values),
      resolution: 'unresolved' as const,
      canonicalValue: null,
      winnerSelected: false as const,
      nonCanonicalReason: nonCanonicalReason(related),
      reviewItemIds: related.map((item) => item.id),
      warnings,
    };
  }).sort((left, right) => {
    const leftIndex = FIELD_ORDER.includes(left.field) ? FIELD_ORDER.indexOf(left.field) : 99;
    const rightIndex = FIELD_ORDER.includes(right.field) ? FIELD_ORDER.indexOf(right.field) : 99;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return compareText(left.key, right.key);
  });
}

export function buildWorkConflictView(
  work: ComicWorkRow,
  observations: SourceObservationRow[],
  reviewItems: ReviewItemRow[],
): WorkConflictView {
  const workObservations = observations.filter((row) => row.work_id === work.id);
  const groups = buildSourceConflicts(workObservations, reviewItems);
  const workReviewItems = reviewItems.filter((item) => item.work_id === work.id);
  const warnings: string[] = [];
  if (groups.length === 0) warnings.push('Наблюдения с флагом is_conflict не найдены.');
  if (workReviewItems.length === 0) warnings.push('Связанных review items нет.');
  return {
    work,
    groups,
    observationCount: workObservations.length,
    conflictObservationCount: workObservations.filter((row) => row.is_conflict).length,
    reviewItemIds: uniqueSorted(workReviewItems.map((item) => item.id)),
    warnings,
  };
}

export function listConflictWorkIds(reviewItems: ReviewItemRow[]): string[] {
  return uniqueSorted(
    reviewItems
      .filter((item) => SOURCE_CONFLICT_REASONS.includes(item.reason) && item.work_id !== null)
      .map((item) => item.work_id as string),
  );
}

export function conflictWorkLabel(work: ComicWorkRow | null): string {
  return work ? workLabel(work) : 'Работа не выбрана';
}
