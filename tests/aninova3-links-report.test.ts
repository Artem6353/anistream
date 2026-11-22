import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Title } from '@/lib/types';
import type { ComicKind, ComicWork, WorkRelationKind } from '@/lib/aninova3/comics/model';
import { PENDING_TITLE_TEXT, hasPublicRussianTitle } from '@/lib/aninova3/comics/model';
import { buildComicStore, loadTitleCandidates, loadVerifiedMetadata } from '@/lib/aninova3/comics/store';
import { loadSourceGraph } from '@/lib/aninova3/comics/source-graph';
import {
  resolveAnimeSourcesDetailed,
  resolveComicAdaptationsDetailed,
  type TitleLookup,
} from '@/lib/aninova3/comics/source-links';
import { canOpenReader, comicDisplayTitle, isPubliclyReadable, publicationIssues } from '@/lib/aninova3/comics/publication';
import { EDITORIAL_COMICS } from '@/lib/aninova3/comics/source-data';

/**
 * B1-C.6: машинный отчёт по связям на РЕАЛЬНЫХ данных каталога и снимка графа.
 *
 * Тест одновременно:
 * 1) проверяет инварианты связей (нет дублей карточек, каждая связь разрешается,
 *    читаемым считается только APPROVED + права + русские главы);
 * 2) при B1C_REPORT=1 пишет docs/data/aninova3-b1c-links-report.json.
 *
 * Отчёт не выдаёт «найденные relation» за «доступные для чтения»: счётчики
 * считаются по разным стадиям.
 */

const ROOT = process.cwd();
const REPORT_OUT = path.join(ROOT, 'docs', 'data', 'aninova3-b1c-links-report.json');

function loadCatalog(): Title[] {
  const file = path.join(ROOT, 'lib', 'data', 'titles.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Title[];
}

function titlesLookup(catalog: Title[]): TitleLookup {
  const map = new Map<number, Title>(catalog.map((t) => [t.anilistId, t]));
  return { get: (id: number) => map.get(id) };
}

const catalog = loadCatalog();
const graph = loadSourceGraph();
const candidates = loadTitleCandidates();
const verified = loadVerifiedMetadata();
const store = buildComicStore(graph, EDITORIAL_COMICS, candidates, verified);
const lookup = titlesLookup(catalog);

const animeById = new Map(catalog.map((t) => [t.anilistId, t]));

interface AnimeLinkRow {
  anime: number;
  slug: string;
  ru: string;
  year: number | null;
  source: string | null;
  links: {
    comic: string;
    role: WorkRelationKind;
    primary: boolean;
    direction: string | null;
    confidence: string;
    basis: string;
    comicYear: number | null;
  }[];
  skipped: { comic?: number; reason: string }[];
}

const animeRows: AnimeLinkRow[] = [];
for (const animeId of graph.byAnime.keys()) {
  const title = animeById.get(animeId);
  const { links, skipped } = resolveAnimeSourcesDetailed(animeId, {
    graph,
    store,
    animeYear: title?.year ?? null,
    /* Тот же вход, что и у страницы аниме: без первоисточника из каталога
       направление связи оставалось бы догадкой по годам. */
    animeSource: title?.source ?? null,
  });
  animeRows.push({
    anime: animeId,
    slug: title?.slug ?? '',
    ru: title?.ru ?? '',
    year: title?.year ?? null,
    source: title?.source ?? null,
    links: links.map((l) => ({
      comic: l.comic.id,
      role: l.role,
      primary: l.primary,
      direction: l.direction,
      confidence: l.confidence,
      basis: l.basis,
      comicYear: l.comic.year,
    })),
    skipped: skipped.map((s) => ({ comic: s.evidence.comicAniListId, reason: s.reason })),
  });
}

const adaptationRows: { comic: string; anime: number[]; skipped: { reason: string }[] }[] = [];
for (const comic of store.list) {
  const { links, skipped } = resolveComicAdaptationsDetailed(comic, { graph, store, titles: lookup });
  adaptationRows.push({
    comic: comic.id,
    anime: links.map((l) => l.anime.anilistId),
    skipped: skipped.map((s) => ({ reason: s.reason })),
  });
}

const resolvedLinks = animeRows.reduce((n, r) => n + r.links.length, 0);
const skippedLinks = animeRows.reduce((n, r) => n + r.skipped.length, 0);
const skippedByReason: Record<string, number> = {};
for (const row of animeRows) for (const s of row.skipped) skippedByReason[s.reason] = (skippedByReason[s.reason] ?? 0) + 1;

const linksByRole: Record<string, number> = {};
const linksByDirection: Record<string, number> = {};
const linksByConfidence: Record<string, number> = {};
const linksByBasis: Record<string, number> = {};
for (const row of animeRows) {
  for (const link of row.links) {
    linksByRole[link.role] = (linksByRole[link.role] ?? 0) + 1;
    const key = link.direction ?? 'unknown';
    linksByDirection[key] = (linksByDirection[key] ?? 0) + 1;
    linksByConfidence[link.confidence] = (linksByConfidence[link.confidence] ?? 0) + 1;
    linksByBasis[link.basis] = (linksByBasis[link.basis] ?? 0) + 1;
  }
}

/* Связи, где направление не утверждается: только связь, без выводов. */
const linksWithoutDirection = animeRows.flatMap((row) =>
  row.links.filter((l) => l.direction === null && l.role === 'SOURCE').map((l) => ({ anime: row.anime, comic: l.comic })),
);

/* B1-D.1: сколько карточек перестали быть «первоисточником», потому что
   это комикс по аниме (по каталогу или по датам). */
const comicAdaptsAnimeCount = animeRows.reduce(
  (n, row) => n + row.links.filter((l) => l.direction === 'comic-adapts-anime').length,
  0,
);
const confirmedDirection = animeRows.reduce(
  (n, row) => n + row.links.filter((l) => l.confidence === 'confirmed').length,
  0,
);
/* Первоисточники, которые начинаются позже аниме, но всё равно называются
   первоисточником. Такие связи допустимы только с неподтверждённым направлением
   (противоречие уходит в очередь проверки), поэтому здесь их быть не должно. */
const claimedSourcesAfterAnime = animeRows.flatMap((row) =>
  row.links
    .filter(
      (l) =>
        l.role === 'SOURCE' &&
        l.confidence !== 'unknown' &&
        l.comicYear &&
        row.year &&
        l.comicYear > row.year + 1,
    )
    .map((l) => ({ anime: row.anime, animeYear: row.year, comic: l.comic, comicYear: l.comicYear })),
);

const rawRelationTypes: Record<string, number> = {};
for (const edge of graph.edges) {
  const key = edge.rawRelation ?? 'UNKNOWN';
  rawRelationTypes[key] = (rawRelationTypes[key] ?? 0) + 1;
}

const graphKinds: Record<string, number> = {};
for (const comic of graph.comics) {
  const kind = `${comic.format ?? '?'}/${comic.country ?? '?'}`;
  graphKinds[kind] = (graphKinds[kind] ?? 0) + 1;
}

/* Несколько подтверждённых первоисточников у одного аниме — реальные случаи
   (например One Piece: манга + сборник + прототип-ваншот). */
const multiSourceAnime = animeRows
  .filter((r) => r.links.filter((l) => l.role === 'SOURCE').length > 1)
  .map((r) => ({ anime: r.anime, slug: r.slug, ru: r.ru, sources: r.links.filter((l) => l.role === 'SOURCE').length }))
  .sort((a, b) => b.sources - a.sources || a.anime - b.anime);

const animeWithOnlyRelated = animeRows.filter((r) => r.links.length > 0 && !r.links.some((l) => l.role === 'SOURCE'));

const comicStats = (comic: ComicWork) => ({
  id: comic.id,
  slug: comic.slug,
  /* Публичное название: у непроверенных оно нейтральное, поэтому в отчёте
     отдельно поле title и признак pending. */
  title: comicDisplayTitle(comic).text,
  titlePending: comicDisplayTitle(comic).pending,
  kind: comic.kind as ComicKind,
  anilist: comic.externalIds.anilist,
  mal: comic.externalIds.mal,
  verification: comic.verification,
  hasRussianCandidate: Boolean(comic.titleRuCandidate?.title),
  titleFromSource: comic.metadata?.source ?? null,
  licenseClaimed: Boolean(comic.metadata?.licenseNameRu),
  catalogEligible: hasPublicRussianTitle(comic.verification) && !comic.isDemo,
  genres: comic.genres.length,
  status: comic.publication.status,
  russianTitleVerified: comic.publication.russianTitleVerified,
  russianMetadataVerified: comic.publication.russianMetadataVerified,
  rightsVerified: comic.publication.rightsVerified,
  ruChapters: comic.chapters.filter((c) => c.language === 'ru' && c.pages > 0).length,
  publiclyReadable: isPubliclyReadable(comic),
  readerReady: canOpenReader(comic),
  issues: publicationIssues(comic),
});

const comicRows = store.list.map(comicStats);

const comicsByKind: Record<string, number> = {};
for (const row of comicRows) comicsByKind[row.kind] = (comicsByKind[row.kind] ?? 0) + 1;

const reviews = comicRows.filter((c) => !c.russianTitleVerified || !c.russianMetadataVerified || !c.rightsVerified);

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'B1-C preview · реальные данные каталога и снимок relation-графа',
  catalog: {
    titles: catalog.length,
    /* Сколько аниме реально обработано снимком графа (для честного «сколько из скольких»). */
    animeProcessed: graph.meta?.animeReceived ?? null,
    animeWithSourceMangaType: catalog.filter((t) => t.source === 'MANGA').length,
    animeWithAnySourceType: catalog.filter((t) => Boolean(t.source)).length,
  },
  graph: {
    generatedAt: graph.meta?.generatedAt ?? null,
    generator: graph.meta?.generator ?? null,
    edges: graph.edges.length,
    comics: graph.comics.length,
    animeWithEdges: graph.byAnime.size,
    uniqueAnimeWithEdges: new Set(graph.edges.map((e) => e.animeAniListId)).size,
    animeRequested: graph.meta?.animeRequested ?? null,
    animeReceived: graph.meta?.animeReceived ?? null,
    animeMissing: graph.meta?.animeMissing ?? null,
    requests: graph.meta?.requests ?? null,
    retries: graph.meta?.retries ?? null,
    failedBatches: graph.meta?.failedBatches ?? null,
    rawRelationTypes,
    graphKinds,
    comicsByFormat: graph.meta?.comicsByFormat ?? null,
    comicsByCountry: graph.meta?.comicsByCountry ?? null,
    skipped: graph.meta?.skipped ?? null,
    missingAnimeIds: graph.meta?.missingAnimeIds ?? [],
    comicsWithMal: graph.comics.filter((c) => Boolean(c.mal)).length,
    comicsWithoutMal: graph.comics.filter((c) => !c.mal).length,
    comicsWithAuthors: graph.comics.filter((c) => (c.authors?.length ?? 0) > 0).length,
  },
  links: {
    resolved: resolvedLinks,
    skipped: skippedLinks,
    skippedByReason,
    byRole: linksByRole,
    byDirection: linksByDirection,
    /* B1-D.1: три уровня достоверности направления, а не два. */
    byConfidence: linksByConfidence,
    byBasis: linksByBasis,
    comicAdaptsAnimeCount,
    confirmedDirection,
    linksWithoutDirection: linksWithoutDirection.length,
    linksWithoutDirectionExamples: linksWithoutDirection.slice(0, 25),
    sourcesAfterAnimeCount: claimedSourcesAfterAnime.length,
    animeWithoutConfirmedComic: animeRows.filter((r) => r.links.length === 0).length,
    animeWithOnlyRelated: animeWithOnlyRelated.length,
    animeWithMultiSource: multiSourceAnime.length,
    primaryPerAnimeOk: animeRows.every((r) => r.links.filter((l) => l.primary).length <= 1),
    multiSourceExamples: multiSourceAnime.slice(0, 25),
  },
  comics: {
    total: comicRows.length,
    withAniListId: comicRows.filter((c) => Boolean(c.anilist)).length,
    withMalId: comicRows.filter((c) => Boolean(c.mal)).length,
    withRuChapters: comicRows.filter((c) => c.ruChapters > 0).length,
    withAuthorMetadata: store.list.filter((c) => c.authors.length > 0).length,
    needsEditorialReview: comicRows.filter((c) => c.verification !== 'EDITORIALLY_VERIFIED').length,
    byKind: comicsByKind,
    /* Три уровня достоверности данных — без смешивания с правами. */
    editoriallyVerified: comicRows.filter((c) => c.verification === 'EDITORIALLY_VERIFIED').length,
    candidateVerification: comicRows.filter((c) => c.verification === 'CANDIDATE').length,
    unverified: comicRows.filter((c) => c.verification === 'UNVERIFIED').length,
    russianCandidateAvailable: comicRows.filter((c) => c.hasRussianCandidate).length,
    russianTitleVerified: comicRows.filter((c) => c.russianTitleVerified).length,
    russianMetadataVerified: comicRows.filter((c) => c.russianMetadataVerified).length,
    rightsVerified: comicRows.filter((c) => c.rightsVerified).length,
    publiclyReadable: comicRows.filter((c) => c.publiclyReadable).length,
    readerReady: comicRows.filter((c) => c.readerReady).length,
    pendingTitleNeutral: comicRows.filter((c) => c.titlePending).length,
    pendingTitleText: PENDING_TITLE_TEXT,
    /* B1-E: проверенное по источнику название — отдельный уровень, не редакция. */
    sourceVerified: comicRows.filter((c) => c.verification === 'SOURCE_VERIFIED').length,
    pendingReview: comicRows.filter((c) => c.verification === 'PENDING_REVIEW').length,
    nameMismatch: comicRows.filter((c) => c.verification === 'NAME_MISMATCH').length,
    noRuTitle: comicRows.filter((c) => c.verification === 'NO_RU_TITLE').length,
    notFoundOnSource: comicRows.filter((c) => c.verification === 'NOT_FOUND').length,
    licenseClaimed: comicRows.filter((c) => c.licenseClaimed).length,
    catalogEligible: comicRows.filter((c) => c.catalogEligible).length,
    withGenres: comicRows.filter((c) => c.genres > 0).length,
  },
  needsManualReviewCount: reviews.length,
  needsManualReviewIds: reviews.slice(0, 2000).map((c) => c.id),
  /* Очередь кандидатов на ручной разбор — отдельно от «связей» и «права». */
  manualReviewQueues: {
    comicsWithoutEditorialVerification: reviews.length,
    comicsWithRuCandidate: comicRows.filter((c) => c.hasRussianCandidate).length,
    comicsWithoutAnyRuData: comicRows.filter((c) => !c.hasRussianCandidate && !c.russianTitleVerified).length,
    report: 'docs/data/aninova3-b1c-manual-review.json',
  },
  excludedFromReadingCount: comicRows.filter((c) => !c.publiclyReadable).length,
  comicDetails: comicRows,
  adaptations: {
    resolved: adaptationRows.reduce((n, r) => n + r.anime.length, 0),
    comicsWithAdaptations: adaptationRows.filter((r) => r.anime.length).length,
  },
  animeDetails: animeRows,
  metadataCandidates: {
    file: 'lib/aninova3/comics/metadata-candidates.json (внутренний, не для UI)',
    runtimeCandidates: candidates.size,
    report: 'docs/data/aninova3-b1c-metadata-candidates.json',
    reviewQueue: 'docs/data/aninova3-b1c-manual-review.json',
  },
  narutoChain: (() => {
    const anime = catalog.find((t) => t.anilistId === 20) ?? null;
    const links = anime ? resolveAnimeSourcesDetailed(anime.anilistId, { graph, store }).links : [];
    const comic = links[0]?.comic ?? null;
    return {
      anime: anime ? { anilist: anime.anilistId, slug: anime.slug, ru: anime.ru, source: anime.source ?? null } : null,
      relationEdgesInCatalog: anime?.relations?.length ?? 0,
      catalogRelationTypes: [...new Set((anime?.relations ?? []).map((r) => r.type))],
      comicAniListIdInCatalogRelations: (anime?.relations ?? []).some((r) => r.id === 30011),
      confirmedComic: comic
        ? {
            anilist: comic.externalIds.anilist,
            mal: comic.externalIds.mal,
            slug: comic.slug,
            titleRu: comic.titleRu,
            publication: comic.publication,
            issues: publicationIssues(comic),
            canRead: canOpenReader(comic),
          }
        : null,
      stoppedAt: comic ? (canOpenReader(comic) ? 'ready' : 'publication') : 'matching',
    };
  })(),
};

describe('машинный отчёт B1-C', () => {
  it('каждая связь разрешается в существующее произведение без дублей', () => {
    for (const row of animeRows) {
      const ids = row.links.map((l) => l.comic);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(store.byId.has(id)).toBe(true);
      expect(row.links.filter((l) => l.primary).length).toBeLessThanOrEqual(1);
    }
  });

  it('читаемым считается только APPROVED с правами и русскими главами', () => {
    for (const comic of store.list) {
      if (!isPubliclyReadable(comic)) continue;
      expect(comic.publication.status).toBe('APPROVED');
      expect(comic.publication.rightsVerified).toBe(true);
      expect(comic.publication.russianTitleVerified).toBe(true);
      expect(comic.publication.russianMetadataVerified).toBe(true);
      expect(comic.chapters.some((c) => c.language === 'ru' && c.pages > 0)).toBe(true);
    }
  });

  it('демо B1-B не попадает в граф первоисточников', () => {
    for (const comic of store.list) expect(comic.isDemo).toBeFalsy();
  });

  it('непроверенное русское название не утекает в публичное поле', () => {
    for (const comic of store.list) {
      /* Публичное название допустимо только при проверенном статусе (редакция
         или сверка по источнику), иначе — нейтральный текст. */
      if (hasPublicRussianTitle(comic.verification)) continue;
      expect(comic.titleRu).toBe('');
      expect(comicDisplayTitle(comic).text).toBe(PENDING_TITLE_TEXT);
    }
  });

  it('в отчёте разделены связь, произведение, права и читаемость', () => {
    expect(report.links.resolved).toBe(report.adaptations.resolved);
    expect(report.comics.total).toBe(store.list.length);
    expect(report.comics.publiclyReadable).toBe(0);
    expect(report.comics.withRuChapters).toBe(0);
    expect(report.comics.rightsVerified).toBe(0);
    expect(report.manualReviewQueues.comicsWithRuCandidate).toBeGreaterThan(0);
    expect(report.graph.uniqueAnimeWithEdges).toBeGreaterThan(0);
    expect(report.graph.uniqueAnimeWithEdges).toBeLessThanOrEqual(Number(report.graph.animeReceived));
  });

  it('кандидат — не проверка: данные из Shikimori не получают verified-флаги', () => {
    for (const comic of store.list) {
      if (!comic.titleRuCandidate) continue;
      expect(comic.publication.russianTitleVerified).toBe(comic.verification === 'EDITORIALLY_VERIFIED');
      expect(comic.publication.rightsVerified).toBe(false);
    }
  });

  it('проверенное по источнику название не даёт ни редакции, ни прав, ни глав', () => {
    const sourceVerified = store.list.filter((c) => c.verification === 'SOURCE_VERIFIED');
    expect(sourceVerified.length).toBeGreaterThan(0);
    for (const comic of sourceVerified) {
      expect(comic.publication.russianTitleVerified).toBe(false);
      expect(comic.publication.russianMetadataVerified).toBe(false);
      expect(comic.publication.rightsVerified).toBe(false);
      expect(comic.metadata?.officialPublisherConfirmed).toBe(false);
      expect(comicDisplayTitle(comic).pending).toBe(false);
      expect(isPubliclyReadable(comic)).toBe(false);
      expect(canOpenReader(comic)).toBe(false);
    }
  });

  it('в каталог попадают только произведения с проверенным русским названием', () => {
    for (const comic of store.list) {
      const eligible = hasPublicRussianTitle(comic.verification) && !comic.isDemo;
      expect(comicDisplayTitle(comic).pending).toBe(!eligible);
    }
    expect(report.comics.catalogEligible).toBeGreaterThan(0);
    expect(report.comics.publiclyReadable).toBe(0);
  });

  it('ни один первоисточник не начинается существенно позже самого аниме', () => {
    /* AniList ставит ADAPTATION в обе стороны; даты — косвенный признак,
       подтверждение берётся из каталога (source аниме). Связь без подтверждённого
       направления не утверждает, что комикс — первоисточник. */
    expect(claimedSourcesAfterAnime).toEqual([]);
    expect(report.links.comicAdaptsAnimeCount).toBeGreaterThan(0);
    expect(report.links.byDirection['comic-adapts-anime']).toBe(report.links.comicAdaptsAnimeCount);
  });

  it('направление без основания не выдаётся за подтверждённое', () => {
    /* Каждая связь имеет уровень достоверности, и «подтверждено» не бывает
       без основания в каталоге (год начала сам по себе основанием не считается). */
    const total = Object.values(report.links.byConfidence).reduce((n, v) => n + v, 0);
    expect(total).toBe(report.links.resolved);
    for (const row of animeRows) {
      for (const link of row.links) {
        if (link.confidence === 'confirmed') {
          expect(['catalog-manga', 'catalog-original']).toContain(link.basis);
        }
        if (link.confidence === 'inferred') expect(['dates', 'catalog-manga']).toContain(link.basis);
        if (link.confidence === 'unknown') expect(link.direction).toBeNull();
      }
    }
    expect(confirmedDirection).toBeGreaterThan(0);
  });

  it('основной первоисточник не назначается без направления', () => {
    for (const row of animeRows) {
      for (const link of row.links) {
        if (!link.primary) continue;
        expect(link.confidence).not.toBe('unknown');
      }
    }
  });

  it('у каждого аниме не более одного основного первоисточника, но все связи видны', () => {
    expect(report.links.byRole.SOURCE ?? 0).toBeGreaterThan(0);
    expect(report.links.animeWithMultiSource).toBeGreaterThanOrEqual(0);
    for (const row of animeRows) {
      expect(row.links.filter((l) => l.primary).length).toBeLessThanOrEqual(1);
    }
  });

  it('счётчики отчёта не смешивают «найдено» и «можно читать»', () => {
    expect(report.graph.edges).toBeGreaterThanOrEqual(report.links.resolved);
    expect(report.comics.publiclyReadable).toBeLessThanOrEqual(report.comics.rightsVerified);
    expect(report.comics.readerReady).toBeLessThanOrEqual(report.comics.publiclyReadable);
    expect(report.links.skippedByReason && typeof report.links.skippedByReason === 'object').toBe(true);
  });

  it('цепочка Naruto зафиксирована без выдумок', () => {
    expect(report.narutoChain.anime?.anilist).toBe(20);
    expect(report.narutoChain.catalogRelationTypes).not.toContain('ADAPTATION');
    expect(report.narutoChain.catalogRelationTypes).not.toContain('MANGA');
    for (const issue of report.narutoChain.confirmedComic?.issues ?? []) {
      expect(['pending_verification', 'rights_unverified', 'no_ru_chapters', 'title_unverified', 'metadata_unverified']).toContain(issue);
    }
  });

  it('при B1C_REPORT=1 отчёт пишется в docs/data', () => {
    if (process.env.B1C_REPORT !== '1') {
      expect(existsSync(REPORT_OUT)).toBeTypeOf('boolean');
      return;
    }
    mkdirSync(path.dirname(REPORT_OUT), { recursive: true });
    writeFileSync(REPORT_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    expect(existsSync(REPORT_OUT)).toBe(true);
  });
});
