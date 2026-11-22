/**
 * Разрешение связей «аниме ↔ комикс» в обе стороны.
 *
 * Принципы (см. docs/ANINOVA_3_B1C_SOURCE_MATCHING.md):
 * 1. Связь строится только по устойчивому идентификатору: внутренний id комикса,
 *    AniList id или MAL id. Сопоставление по названию здесь не используется вообще.
 * 2. Первоисточник (SOURCE) отделён от продолжений, спин-оффов и прочих связей.
 * 3. Один и тот же объект имеет один id независимо от направления навигации.
 * 4. Если идентификатор неоднозначен (два произведения с одним внешним id),
 *    связь не создаётся — она уходит в skipped с причиной.
 * 5. Никаких внешних запросов: работаем по снимку графа и реестру в памяти.
 */
import type { Title } from '@/lib/types';
import type { ComicSourceEvidence, ComicWork, LinkedAnime, LinkedComic, WorkRelationKind } from './model';
import { RELATION_PRIORITY, invertRelation } from './model';
import { comicStore, type ComicStore } from './store';
import { EMPTY_SOURCE_GRAPH, loadSourceGraph, type SourceGraph } from './source-graph';

export interface TitleLookup {
  get(id: number): Title | undefined;
}

export type SkipReason = 'comic_not_found' | 'anime_not_found' | 'ambiguous_external_id';

export interface ResolutionSkip {
  evidence: ComicSourceEvidence;
  reason: SkipReason;
}

export interface SourceResolution {
  links: LinkedComic[];
  skipped: ResolutionSkip[];
}

export interface AdaptationResolution {
  links: LinkedAnime[];
  skipped: ResolutionSkip[];
}

export interface ResolverDeps {
  graph?: SourceGraph;
  store?: ComicStore;
  titles?: TitleLookup;
}

function deps(input: ResolverDeps = {}) {
  return {
    graph: input.graph ?? loadSourceGraph() ?? EMPTY_SOURCE_GRAPH,
    store: input.store ?? comicStore(),
    titles: input.titles,
  };
}

/** Однозначное ли соответствие внешнего id: дубликаты внешних id связь не создают. */
function uniqueByAniList(graph: SourceGraph, comicAniListId: number): boolean {
  const list = graph.comicsByAniList.get(comicAniListId) ?? [];
  return new Set(list.map((c) => c.anilist)).size <= 1;
}

function uniqueByMal(graph: SourceGraph, malId: number): boolean {
  const list = graph.comicsByMal.get(malId) ?? [];
  return new Set(list.map((c) => c.anilist)).size <= 1;
}

function resolveComicRef(
  evidence: ComicSourceEvidence,
  graph: SourceGraph,
  store: ComicStore,
): { comic?: ComicWork; reason?: SkipReason } {
  if (evidence.comicInternalId) {
    const byId = store.byId.get(evidence.comicInternalId);
    if (byId) return { comic: byId };
  }
  if (evidence.comicAniListId) {
    if (!uniqueByAniList(graph, evidence.comicAniListId)) return { reason: 'ambiguous_external_id' };
    const byAniList = store.byAniList.get(evidence.comicAniListId);
    if (byAniList) return { comic: byAniList };
  }
  if (evidence.comicMalId) {
    if (store.duplicates.mal.includes(evidence.comicMalId) || !uniqueByMal(graph, evidence.comicMalId)) {
      return { reason: 'ambiguous_external_id' };
    }
    const byMal = store.byMal.get(evidence.comicMalId);
    if (byMal) return { comic: byMal };
  }
  return { reason: 'comic_not_found' };
}

/** Сильнее ли новая роль уже сохранённой для того же произведения. */
function strongerRole(next: WorkRelationKind, current: WorkRelationKind): boolean {
  return RELATION_PRIORITY[next] > RELATION_PRIORITY[current];
}

/**
 * Вес произведения как первоисточника.
 *
 * Сериализованное произведение (манга/манхва/маньхуа/вебтун) важнее ваншота:
 * у One Piece три ADAPTATION-ребра, но первоисточник — манга, а «Romance Dawn» —
 * прототип-ваншот. Меньше — выше в списке.
 */
function sourceWeight(comic: ComicWork): number {
  const prototype = comic.kind === 'comic' ? 1 : 0;
  const oneShot = comic.totalChaptersKnown === 1 && comic.chapters.length === 0 ? 0.5 : 0;
  return prototype + oneShot;
}

/**
 * Аниме → подтверждённые комиксы.
 * Возвращает и связи, и отброшенные рёбра с причиной (для внутреннего отчёта).
 */
export function resolveAnimeSourcesDetailed(animeAniListId: number, input: ResolverDeps = {}): SourceResolution {
  const { graph, store } = deps(input);
  const evidence = graph.byAnime.get(animeAniListId) ?? [];
  const skipped: ResolutionSkip[] = [];
  const byComic = new Map<string, LinkedComic>();

  for (const row of evidence) {
    const resolved = resolveComicRef(row, graph, store);
    if (!resolved.comic) {
      skipped.push({ evidence: row, reason: resolved.reason ?? 'comic_not_found' });
      continue;
    }
    const comic = resolved.comic;
    /* Демо B1-B не может быть первоисточником реального аниме. */
    if (comic.isDemo) {
      skipped.push({ evidence: row, reason: 'comic_not_found' });
      continue;
    }
    const existing = byComic.get(comic.id);
    if (!existing) {
      byComic.set(comic.id, { comic, role: row.role, primary: false, evidence: row.evidence });
      continue;
    }
    if (strongerRole(row.role, existing.role)) {
      existing.role = row.role;
      existing.evidence = row.evidence;
    }
  }

  const links = [...byComic.values()].sort((a, b) => {
    if (a.role === 'SOURCE' && b.role !== 'SOURCE') return -1;
    if (b.role === 'SOURCE' && a.role !== 'SOURCE') return 1;
    const byPriority = RELATION_PRIORITY[b.role] - RELATION_PRIORITY[a.role];
    if (byPriority) return byPriority;
    const byWeight = sourceWeight(a.comic) - sourceWeight(b.comic);
    if (byWeight) return byWeight;
    const byChapters = (b.comic.totalChaptersKnown ?? 0) - (a.comic.totalChaptersKnown ?? 0);
    if (byChapters) return byChapters;
    return (a.comic.externalIds.anilist ?? 0) - (b.comic.externalIds.anilist ?? 0);
  });

  /* Основной первоисточник один: первый SOURCE. Если первоисточника нет —
     основным считается первая подтверждённая связь (карточка показывает её роль). */
  const firstSource = links.find((l) => l.role === 'SOURCE');
  if (firstSource) firstSource.primary = true;
  else if (links.length) links[0].primary = true;

  return { links, skipped };
}

export function resolveAnimeSources(animeAniListId: number, input: ResolverDeps = {}): LinkedComic[] {
  return resolveAnimeSourcesDetailed(animeAniListId, input).links;
}

/**
 * Комикс → аниме-адаптации (обратное направление, тот же граф).
 * Требует lookup аниме-каталога: у комикса нет собственного списка аниме.
 */
export function resolveComicAdaptationsDetailed(
  comic: ComicWork,
  input: ResolverDeps & { titles?: TitleLookup } = {},
): AdaptationResolution {
  const { graph, titles } = deps(input);
  const skipped: ResolutionSkip[] = [];
  const byAnime = new Map<number, LinkedAnime>();
  if (!titles) return { links: [], skipped };

  const evidence = graph.edges.filter(
    (row) =>
      row.comicInternalId === comic.id ||
      (!!row.comicAniListId && row.comicAniListId === comic.externalIds.anilist) ||
      (!!row.comicMalId && row.comicMalId === comic.externalIds.mal),
  );

  for (const row of evidence) {
    if (!uniqueByAniList(graph, row.comicAniListId ?? comic.externalIds.anilist ?? -1)) {
      skipped.push({ evidence: row, reason: 'ambiguous_external_id' });
      continue;
    }
    const anime = titles.get(row.animeAniListId);
    if (!anime || anime.hidden) {
      skipped.push({ evidence: row, reason: 'anime_not_found' });
      continue;
    }
    const role = invertRelation(row.role);
    const existing = byAnime.get(anime.anilistId);
    if (!existing) {
      byAnime.set(anime.anilistId, { anime, role, primary: false, evidence: row.evidence });
      continue;
    }
    if (strongerRole(role, existing.role)) {
      existing.role = role;
      existing.evidence = row.evidence;
    }
  }

  const links = [...byAnime.values()].sort((a, b) => {
    if (a.role === 'ADAPTATION' && b.role !== 'ADAPTATION') return -1;
    if (b.role === 'ADAPTATION' && a.role !== 'ADAPTATION') return 1;
    const byPriority = RELATION_PRIORITY[b.role] - RELATION_PRIORITY[a.role];
    if (byPriority) return byPriority;
    return a.anime.anilistId - b.anime.anilistId;
  });

  const firstAdaptation = links.find((l) => l.role === 'ADAPTATION');
  if (firstAdaptation) firstAdaptation.primary = true;
  else if (links.length) links[0].primary = true;

  return { links, skipped };
}

export function resolveComicAdaptations(
  comic: ComicWork,
  input: ResolverDeps & { titles?: TitleLookup } = {},
): LinkedAnime[] {
  return resolveComicAdaptationsDetailed(comic, input).links;
}
