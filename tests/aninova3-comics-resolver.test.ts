import { describe, expect, it } from 'vitest';
import { buildComicStore } from '@/lib/aninova3/comics/store';
import { buildSourceGraph } from '@/lib/aninova3/comics/source-graph';
import {
  resolveAnimeSources,
  resolveAnimeSourcesDetailed,
  resolveComicAdaptations,
  resolveComicAdaptationsDetailed,
} from '@/lib/aninova3/comics/source-links';
import { canOpenReader, comicDisplayTitle, isPubliclyReadable } from '@/lib/aninova3/comics/publication';
import type { ComicWork } from '@/lib/aninova3/comics/model';
import {
  NEUTRAL_ROLE_LABEL,
  animeSideRoleLabel,
  classifyAdaptationDirection,
  sourceSectionState,
} from '@/lib/aninova3/comics/model';
import { FIXTURE_EDITORIALS, FIXTURE_GRAPH, FIXTURE_TITLE_LOOKUP, fixtureTitle } from './fixtures/aninova3-comics';

/** B1-C.1/B1-C.3: разрешение связей в обе стороны на fixture-графе. */

const graph = buildSourceGraph(FIXTURE_GRAPH);
const store = buildComicStore(graph, FIXTURE_EDITORIALS);
const deps = {
  graph,
  store,
  titles: FIXTURE_TITLE_LOOKUP,
  /* Страница аниме всегда передаёт год и первоисточник из каталога (BASE year = 2020). */
  animeYear: 2020,
  animeSource: 'MANGA',
};
const comicById = (id: string): ComicWork => {
  const comic = store.byId.get(id);
  if (!comic) throw new Error(`fixture ${id} отсутствует`);
  return comic;
};

describe('аниме → первоисточник', () => {
  it('находит первоисточник и выделяет его как основной', () => {
    const links = resolveAnimeSources(1001, deps);
    expect(links).toHaveLength(2);
    const source = links.find((l) => l.role === 'SOURCE');
    expect(source?.comic.id).toBe('comic:anilist:900001');
    expect(source?.primary).toBe(true);
    expect(links.filter((l) => l.primary)).toHaveLength(1);
  });

  it('продолжение остаётся продолжением и не подменяет первоисточник', () => {
    const links = resolveAnimeSources(1001, deps);
    const sequel = links.find((l) => l.comic.id === 'comic:anilist:900007');
    expect(sequel?.role).toBe('SPIN_OFF');
    expect(sequel?.primary).toBe(false);
  });

  it('оригинальное аниме без связей не получает карточек', () => {
    const { links, skipped } = resolveAnimeSourcesDetailed(1005, deps);
    expect(links).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('совпадение названия не создаёт связь', () => {
    /* В каталоге есть тайтл с тем же romaji, что у fixtur-манги, но ребра нет. */
    expect(resolveAnimeSources(1011, deps)).toEqual([]);
  });

  it('ребро на отсутствующий комикс отбрасывается с причиной', () => {
    const { links, skipped } = resolveAnimeSourcesDetailed(1006, deps);
    expect(links).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['comic_not_found']);
  });

  it('неизвестный relationType показывается как RELATED, а не SOURCE', () => {
    const links = resolveAnimeSources(1003, deps);
    expect(links).toHaveLength(1);
    expect(links[0].role).toBe('RELATED');
    expect(links[0].comic.id).toBe('comic:anilist:900002');
  });

  it('несколько произведений с одинаковым MAL id не сливаются в одну карточку', () => {
    const links = resolveAnimeSources(1004, deps);
    expect(links).toHaveLength(2);
    expect(new Set(links.map((l) => l.comic.id)).size).toBe(2);
    expect(store.duplicates.mal).toContain(800099);
  });

  it('карточка читаемого произведения проходит все проверки', () => {
    const comic = comicById('comic:anilist:900001');
    expect(isPubliclyReadable(comic)).toBe(true);
    expect(canOpenReader(comic)).toBe(true);
    expect(comicDisplayTitle(comic)).toMatchObject({ text: 'Тестовая манга', russian: true, pending: false });
  });
});

describe('манга → аниме-адаптации', () => {
  it('находит все подтверждённые экранизации одной манги', () => {
    const comic = comicById('comic:anilist:900010');
    const links = resolveComicAdaptations(comic, deps);
    expect(links.map((l) => l.anime.anilistId).sort()).toEqual([1002, 1012]);
    expect(links.every((l) => l.role === 'ADAPTATION')).toBe(true);
    expect(links.filter((l) => l.primary)).toHaveLength(1);
  });

  it('обратная роль первоисточника — ADAPTATION, id тот же', () => {
    const comic = comicById('comic:anilist:900001');
    const links = resolveComicAdaptations(comic, deps);
    expect(links.map((l) => l.anime.anilistId)).toEqual([1001]);
    expect(links[0].role).toBe('ADAPTATION');
    expect(links[0].anime.slug).toBe('fixture-anime');
  });

  it('скрытое аниме не попадает в адаптации', () => {
    const comic = comicById('comic:anilist:900001');
    const hiddenLookup = { get: (id: number) => (dedepsTitles(id) ? { ...dedepsTitles(id)!, hidden: true } : undefined) };
    const { links, skipped } = resolveComicAdaptationsDetailed(comic, { ...deps, titles: hiddenLookup });
    expect(links).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['anime_not_found']);
  });

  it('без lookup каталога связь не создаётся (нет выдуманных карточек)', () => {
    const comic = comicById('comic:anilist:900001');
    expect(resolveComicAdaptations(comic, { graph, store })).toEqual([]);
  });

  it('манга без адаптаций не даёт пустых карточек', () => {
    const comic = comicById('comic:anilist:900003');
    expect(resolveComicAdaptations(comic, deps)).toEqual([]);
  });
});

describe('направление связи по датам (B1-D)', () => {
  /* AniList ставит ADAPTATION в обе стороны: манга 2026 года и аниме 2024 года
     связаны одинаково с мангой 1999 года и аниме 2002 года. Различает дата. */
  const timeGraph = buildSourceGraph({
    meta: { generatedAt: 'fixture', generator: 'FIXTURE', note: 'direction' },
    comics: [
      { anilist: 920001, mal: 820001, format: 'MANGA', country: 'JP', titleOriginal: 'Older Source', year: 1999, chapters: 700 },
      { anilist: 920002, mal: 820002, format: 'MANGA', country: 'JP', titleOriginal: 'Later Spin', year: 2026, chapters: 12 },
      { anilist: 920003, mal: 820003, format: 'MANGA', country: 'JP', titleOriginal: 'Same Year Source', year: 2015, chapters: 40 },
    ],
    edges: [
      { anime: 3001, comic: 920001, raw: 'ADAPTATION', observedAt: 'fixture' },
      { anime: 3001, comic: 920002, raw: 'ADAPTATION', observedAt: 'fixture' },
      { anime: 3002, comic: 920003, raw: 'ADAPTATION', observedAt: 'fixture' },
      { anime: 3002, comic: 920002, raw: 'ADAPTATION', observedAt: 'fixture' },
    ],
  });
  const timeStore = buildComicStore(timeGraph, []);
  const timeDeps = { graph: timeGraph, store: timeStore, animeYear: 2014 };

  it('манга, вышедшая после аниме, не считается первоисточником', () => {
    const links = resolveAnimeSources(3001, timeDeps);
    const older = links.find((l) => l.comic.id === 'comic:anilist:920001');
    const later = links.find((l) => l.comic.id === 'comic:anilist:920002');
    expect(older?.role).toBe('SOURCE');
    expect(older?.direction).toBe('comic-is-source');
    expect(later?.role).toBe('ADAPTATION');
    expect(later?.direction).toBe('comic-adapts-anime');
    expect(older?.primary).toBe(true);
    expect(later?.primary).toBe(false);
  });

  it('манга в год выхода аниме или годом позже остаётся первоисточником', () => {
    const links = resolveAnimeSources(3002, timeDeps);
    const sameYear = links.find((l) => l.comic.id === 'comic:anilist:920003');
    expect(sameYear?.role).toBe('SOURCE');
    expect(sameYear?.direction).toBe('comic-is-source');
  });

  it('без года аниме решает только relationType', () => {
    const links = resolveAnimeSources(3001, { graph: timeGraph, store: timeStore });
    expect(links.find((l) => l.comic.id === 'comic:anilist:920002')?.role).toBe('SOURCE');
  });

  it('на странице комикса аниме-оригинал подписан как первоисточник', () => {
    const comic = timeStore.byId.get('comic:anilist:920002');
    if (!comic) throw new Error('fixture отсутствует');
    const links = resolveComicAdaptations(comic, {
      graph: timeGraph,
      store: timeStore,
      titles: {
        get: (id: number) =>
          id === 3001
            ? fixtureTitle({ anilistId: 3001, slug: 'older-anime', ru: 'Старое аниме', romaji: 'Older Anime', year: 2014 })
            : undefined,
      },
    });
    const older = links.find((l) => l.anime.anilistId === 3001);
    expect(older?.direction).toBe('comic-adapts-anime');
    /* Каталог не сообщает первоисточник: вывод сделан только по датам. */
    expect(older?.confidence).toBe('inferred');
    expect(older?.basis).toBe('dates');
  });

  it('одинаковые годы без данных каталога дают только предположение', () => {
    const evidence = classifyAdaptationDirection({ animeYear: 2014, comicYear: 2014 });
    expect(evidence.direction).toBe('comic-is-source');
    expect(evidence.confidence).toBe('inferred');
  });

  it('разные годы без данных каталога дают только предположение', () => {
    const later = classifyAdaptationDirection({ animeYear: 2014, comicYear: 2026 });
    expect(later.direction).toBe('comic-adapts-anime');
    expect(later.confidence).toBe('inferred');
    expect(later.basis).toBe('dates');
  });

  it('отсутствие года не считается доводом ни в одну сторону', () => {
    const unknown = { direction: null, confidence: 'unknown', basis: 'none' };
    expect(classifyAdaptationDirection({ animeYear: 2014 })).toEqual(unknown);
    expect(classifyAdaptationDirection({ comicYear: 2014 })).toEqual(unknown);
    expect(classifyAdaptationDirection({})).toEqual(unknown);
  });
});

describe('направление по первоисточнику аниме из каталога (B1-D.1)', () => {
  it('аниме по манге: первоисточник подтверждён, если даты не противоречат', () => {
    const evidence = classifyAdaptationDirection({ animeSource: 'MANGA', animeYear: 1999, comicYear: 1997 });
    expect(evidence).toEqual({ direction: 'comic-is-source', confidence: 'confirmed', basis: 'catalog-manga' });
  });

  it('аниме по манге без года комикса: направление известно, но не подтверждено', () => {
    const evidence = classifyAdaptationDirection({ animeSource: 'MANGA', animeYear: 1999 });
    expect(evidence.direction).toBe('comic-is-source');
    expect(evidence.confidence).toBe('inferred');
  });

  it('оригинальное аниме: комикс сделан по аниме, и это подтверждено даже при странных датах', () => {
    for (const comicYear of [1990, 2014, 2026, null]) {
      expect(classifyAdaptationDirection({ animeSource: 'ORIGINAL', animeYear: 2014, comicYear })).toEqual({
        direction: 'comic-adapts-anime',
        confidence: 'confirmed',
        basis: 'catalog-original',
      });
    }
  });

  it('аниме по ранобэ или игре: направление комикса не утверждается', () => {
    for (const animeSource of ['LIGHT_NOVEL', 'VISUAL_NOVEL', 'VIDEO_GAME', 'OTHER']) {
      const evidence = classifyAdaptationDirection({ animeSource, animeYear: 2014, comicYear: 2026 });
      expect(evidence.direction).toBeNull();
      expect(evidence.confidence).toBe('unknown');
      expect(evidence.basis).toBe('catalog-other-medium');
    }
  });

  it('аниме по манге, но комикс вышел заметно позже: противоречие, нужна проверка', () => {
    const evidence = classifyAdaptationDirection({ animeSource: 'MANGA', animeYear: 1994, comicYear: 2010 });
    expect(evidence.direction).toBeNull();
    expect(evidence.confidence).toBe('unknown');
    expect(evidence.basis).toBe('catalog-conflict');
  });

  it('противоречие не делает связь «комиксом по аниме» и не назначает основной', () => {
    const conflictGraph = buildSourceGraph({
      meta: { generatedAt: 'fixture', generator: 'FIXTURE', note: 'conflict' },
      comics: [
        { anilist: 930001, mal: 830001, format: 'MANGA', country: 'JP', titleOriginal: 'Later Manga', year: 2010 },
      ],
      edges: [{ anime: 3101, comic: 930001, raw: 'ADAPTATION', observedAt: 'fixture' }],
    });
    const conflictStore = buildComicStore(conflictGraph, []);
    const links = resolveAnimeSources(3101, {
      graph: conflictGraph,
      store: conflictStore,
      animeYear: 1994,
      animeSource: 'MANGA',
    });
    expect(links).toHaveLength(1);
    const [link] = links;
    expect(link.direction).toBeNull();
    expect(link.confidence).toBe('unknown');
    expect(link.primary).toBe(false);
    expect(animeSideRoleLabel(link)).toBe(NEUTRAL_ROLE_LABEL);
    expect(sourceSectionState(links)).toBe('unconfirmed');
  });

  it('без года у произведений основной первоисточник не назначается', () => {
    const noYearGraph = buildSourceGraph({
      meta: { generatedAt: 'fixture', generator: 'FIXTURE', note: 'no-year' },
      comics: [
        { anilist: 940001, mal: 840001, format: 'MANGA', country: 'JP', titleOriginal: 'Undated A' },
        { anilist: 940002, mal: 840002, format: 'MANGA', country: 'JP', titleOriginal: 'Undated B' },
      ],
      edges: [
        { anime: 3201, comic: 940001, raw: 'ADAPTATION', observedAt: 'fixture' },
        { anime: 3201, comic: 940002, raw: 'ADAPTATION', observedAt: 'fixture' },
      ],
    });
    const noYearStore = buildComicStore(noYearGraph, []);
    const links = resolveAnimeSources(3201, { graph: noYearGraph, store: noYearStore });
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.confidence === 'unknown')).toBe(true);
    expect(links.filter((l) => l.primary)).toHaveLength(0);
    expect(links.map((l) => animeSideRoleLabel(l))).toEqual([NEUTRAL_ROLE_LABEL, NEUTRAL_ROLE_LABEL]);
    expect(sourceSectionState(links)).toBe('unconfirmed');
  });

  it('подтверждённый первоисточник приоритетнее предположительного', () => {
    const mixedGraph = buildSourceGraph({
      meta: { generatedAt: 'fixture', generator: 'FIXTURE', note: 'mixed' },
      comics: [
        { anilist: 950001, mal: 850001, format: 'MANGA', country: 'JP', titleOriginal: 'Undated' },
        { anilist: 950002, mal: 850002, format: 'MANGA', country: 'JP', titleOriginal: 'Dated', year: 1997 },
      ],
      edges: [
        { anime: 3301, comic: 950001, raw: 'ADAPTATION', observedAt: 'fixture' },
        { anime: 3301, comic: 950002, raw: 'ADAPTATION', observedAt: 'fixture' },
      ],
    });
    const mixedStore = buildComicStore(mixedGraph, []);
    const links = resolveAnimeSources(3301, {
      graph: mixedGraph,
      store: mixedStore,
      animeYear: 1999,
      animeSource: 'MANGA',
    });
    expect(links.find((l) => l.primary)?.comic.id).toBe('comic:anilist:950002');
    expect(sourceSectionState(links)).toBe('confirmed');
  });

  it('одна и та же связь читается одинаково с обеих сторон', () => {
    const sharedGraph = buildSourceGraph({
      meta: { generatedAt: 'fixture', generator: 'FIXTURE', note: 'both-sides' },
      comics: [
        { anilist: 960001, mal: 860001, format: 'MANGA', country: 'JP', titleOriginal: 'Source Manga', year: 1997 },
        { anilist: 960002, mal: 860002, format: 'MANGA', country: 'JP', titleOriginal: 'Later Manga', year: 2026 },
      ],
      edges: [
        { anime: 3401, comic: 960001, raw: 'ADAPTATION', observedAt: 'fixture' },
        { anime: 3401, comic: 960002, raw: 'ADAPTATION', observedAt: 'fixture' },
      ],
    });
    const sharedStore = buildComicStore(sharedGraph, []);
    const titles = {
      get: (id: number) =>
        id === 3401
          ? fixtureTitle({
              anilistId: 3401,
              slug: 'shared-anime',
              ru: 'Общее аниме',
              romaji: 'Shared Anime',
              year: 1999,
              source: 'MANGA',
            })
          : undefined,
    };
    const animeSide = resolveAnimeSources(3401, {
      graph: sharedGraph,
      store: sharedStore,
      animeYear: 1999,
      animeSource: 'MANGA',
    });
    for (const comicId of ['comic:anilist:960001', 'comic:anilist:960002']) {
      const comic = sharedStore.byId.get(comicId);
      if (!comic) throw new Error(`fixture ${comicId} отсутствует`);
      const comicSide = resolveComicAdaptations(comic, { graph: sharedGraph, store: sharedStore, titles });
      const back = comicSide.find((l) => l.anime.anilistId === 3401);
      const forward = animeSide.find((l) => l.comic.id === comicId);
      expect(back?.direction).toBe(forward?.direction);
      expect(back?.confidence).toBe(forward?.confidence);
      expect(back?.basis).toBe(forward?.basis);
    }
    /* Манга 1997 — подтверждённый первоисточник. Манга 2026 при animeSource=MANGA
       противоречит каталогу (аниме снято по манге, но эта манга намного позже),
       поэтому направление не утверждается и карточка остаётся нейтральной. */
    const source = animeSide.find((l) => l.comic.id === 'comic:anilist:960001');
    const later = animeSide.find((l) => l.comic.id === 'comic:anilist:960002');
    expect(animeSideRoleLabel(source!)).toBe('Основной первоисточник');
    expect(later?.confidence).toBe('unknown');
    expect(later?.basis).toBe('catalog-conflict');
    expect(animeSideRoleLabel(later!)).toBe(NEUTRAL_ROLE_LABEL);
  });
});

describe('несколько первоисточников (реальный случай One Piece)', () => {
  /* AniList отдаёт три ADAPTATION-ребра: манга, сборник ваншотов и прототип
     («Romance Dawn», ONE_SHOT). Связи подтверждены все, но основной первоисточник
     один — сериализованная манга. */
  const multiGraph = buildSourceGraph({
    meta: { generatedAt: 'fixture', generator: 'FIXTURE', note: 'multi' },
    comics: [
      { anilist: 910001, mal: 810001, format: 'MANGA', country: 'JP', titleOriginal: 'Long Manga', year: 1997, chapters: 1100 },
      { anilist: 910002, mal: 810002, format: 'ONE_SHOT', country: 'JP', titleOriginal: 'Prototype One Shot', year: 1996, chapters: 1 },
      { anilist: 910003, mal: 810003, format: 'MANGA', country: 'JP', titleOriginal: 'Alternative Manga' },
    ],
    edges: [
      { anime: 2001, comic: 910002, raw: 'ADAPTATION', observedAt: 'fixture' },
      { anime: 2001, comic: 910001, raw: 'ADAPTATION', observedAt: 'fixture' },
    ],
  });
  const multiStore = buildComicStore(multiGraph, []);
  const multiDeps = { graph: multiGraph, store: multiStore, titles: FIXTURE_TITLE_LOOKUP, animeYear: 1999 };

  it('показывает все подтверждённые произведения, основной — сериализованная манга', () => {
    const links = resolveAnimeSources(2001, multiDeps);
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.role === 'SOURCE')).toBe(true);
    expect(links.filter((l) => l.primary)).toHaveLength(1);
    expect(links[0].comic.id).toBe('comic:anilist:910001');
    expect(links[0].primary).toBe(true);
    expect(links[1].comic.id).toBe('comic:anilist:910002');
  });

  it('ваншот не отбирает роль основного первоисточника у манги', () => {
    const links = resolveAnimeSources(2001, multiDeps);
    const primary = links.find((l) => l.primary);
    expect(primary?.comic.kind).toBe('manga');
  });
});

function dedepsTitles(id: number) {
  return FIXTURE_TITLE_LOOKUP.get(id);
}

describe('производительность разрешения', () => {
  it('повторные вызовы не пересобирают граф', () => {
    const first = resolveAnimeSources(1001, deps);
    const second = resolveAnimeSources(1001, deps);
    expect(second).toEqual(first);
    /* Граф и реестр — те же объекты: на страницу не тратятся новые индексы. */
    expect(deps.graph).toBe(graph);
    expect(deps.store).toBe(store);
  });
});
