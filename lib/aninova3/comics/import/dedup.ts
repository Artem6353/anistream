import { normalizedTitle } from './canonical';
import type {
  DuplicateAnalysis,
  ExternalIdGroup,
  NormalizedCatalog,
  TitleGroup,
  WorkAnnotations,
} from './types';

export interface DedupResult {
  analysis: DuplicateAnalysis;
  annotations: Map<number, WorkAnnotations>;
  skippedExternalKeys: Set<string>;
  duplicateWorkIds: Set<string>;
}

function cloneAnnotations(catalog: NormalizedCatalog): Map<number, WorkAnnotations> {
  const result = new Map<number, WorkAnnotations>();
  for (const [key, value] of catalog.annotations) {
    result.set(key, { ...value, conflicts: [...value.conflicts] });
  }
  return result;
}

export function analyzeDuplicates(catalog: NormalizedCatalog): DedupResult {
  const annotations = cloneAnnotations(catalog);
  const workById = new Map(catalog.works.map((work) => [work.id, work]));
  const skippedExternalKeys = new Set<string>();
  const duplicateWorkIds = new Set<string>();
  const externalIdGroups: ExternalIdGroup[] = [];

  const externalGroups = new Map<string, { source: 'mal' | 'shikimori'; id: string; workIds: Set<string> }>();
  for (const external of catalog.external_ids) {
    if (external.source_name !== 'mal' && external.source_name !== 'shikimori') continue;
    const key = `${external.source_name}:${external.external_id}`;
    const group = externalGroups.get(key) ?? {
      source: external.source_name,
      id: external.external_id,
      workIds: new Set<string>(),
    };
    group.workIds.add(external.work_id);
    externalGroups.set(key, group);
  }
  for (const [key, group] of [...externalGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.workIds.size < 2) continue;
    skippedExternalKeys.add(key);
    const internalKeys: string[] = [];
    const anilistIds: number[] = [];
    for (const workId of group.workIds) {
      duplicateWorkIds.add(workId);
      const work = workById.get(workId);
      if (work) {
        internalKeys.push(work.internal_key);
        anilistIds.push(Number(work.internal_key.split(':').at(-1)));
      }
    }
    internalKeys.sort();
    anilistIds.sort((a, b) => a - b);
    externalIdGroups.push({
      source_name: group.source,
      external_id: group.id,
      work_ids: anilistIds,
      internal_keys: internalKeys,
    });
    for (const anilistId of anilistIds) {
      const annotation = annotations.get(anilistId);
      if (!annotation) continue;
      annotation.conflicts.push(`duplicate_external_id:${group.source}:${group.id}`);
    }
  }

  const titleGroups = new Map<string, { workIds: Set<string>; title: string }>();
  for (const alias of catalog.aliases) {
    if (alias.alias_type !== 'official_russian' || !alias.is_public) continue;
    const work = workById.get(alias.work_id);
    if (!work) continue;
    const key = normalizedTitle(alias.alias);
    const group = titleGroups.get(key) ?? { workIds: new Set<string>(), title: alias.alias };
    group.workIds.add(work.id);
    titleGroups.set(key, group);
  }
  const duplicateTitleGroups: TitleGroup[] = [];
  for (const [key, group] of [...titleGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.workIds.size < 2) continue;
    const internalKeys: string[] = [];
    const anilistIds: number[] = [];
    for (const workId of group.workIds) {
      const work = workById.get(workId);
      if (!work) continue;
      internalKeys.push(work.internal_key);
      anilistIds.push(Number(work.internal_key.split(':').at(-1)));
    }
    internalKeys.sort();
    duplicateTitleGroups.push({
      normalized_title: key,
      work_ids: anilistIds,
      internal_keys: internalKeys,
    });
    for (const anilistId of anilistIds) {
      const annotation = annotations.get(anilistId);
      if (!annotation) continue;
      const conflict = `duplicate_public_title:${key}`;
      if (!annotation.conflicts.includes(conflict)) annotation.conflicts.push(conflict);
    }
  }

  const internalKeyGroups = new Map<string, string[]>();
  const slugGroups = new Map<string, string[]>();
  for (const work of catalog.works) {
    internalKeyGroups.set(work.internal_key, [...(internalKeyGroups.get(work.internal_key) ?? []), work.id]);
    slugGroups.set(work.slug, [...(slugGroups.get(work.slug) ?? []), work.id]);
  }
  for (const [key, ids] of internalKeyGroups) {
    if (ids.length > 1) {
      for (const id of ids) duplicateWorkIds.add(id);
      for (const work of catalog.works.filter((item) => ids.includes(item.id))) {
        annotations.get(Number(work.internal_key.split(':').at(-1)))?.conflicts.push(`duplicate_internal_key:${key}`);
      }
    }
  }
  for (const [slug, ids] of slugGroups) {
    if (ids.length < 2) continue;
    for (const id of ids) duplicateWorkIds.add(id);
    for (const work of catalog.works.filter((item) => ids.includes(item.id))) {
      annotations.get(Number(work.internal_key.split(':').at(-1)))?.conflicts.push(`duplicate_slug:${slug}`);
    }
  }

  const analysis: DuplicateAnalysis = {
    externalIdGroups: externalIdGroups.sort((a, b) => `${a.source_name}:${a.external_id}`.localeCompare(`${b.source_name}:${b.external_id}`)),
    titleGroups: duplicateTitleGroups.sort((a, b) => a.normalized_title.localeCompare(b.normalized_title)),
    ambiguousExternalIds: skippedExternalKeys,
  };
  return { analysis, annotations, skippedExternalKeys, duplicateWorkIds };
}
