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
import { FIXTURE_EDITORIALS, FIXTURE_GRAPH, FIXTURE_TITLE_LOOKUP } from './fixtures/aninova3-comics';

/** B1-C.1/B1-C.3: разрешение связей в обе стороны на fixture-графе. */

const graph = buildSourceGraph(FIXTURE_GRAPH);
const store = buildComicStore(graph, FIXTURE_EDITORIALS);
const deps = { graph, store, titles: FIXTURE_TITLE_LOOKUP };
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

describe('несколько первоисточников (реальный случай One Piece)', () => {
  /* AniList отдаёт три ADAPTATION-ребра: манга, сборник ваншотов и прототип
     («Romance Dawn», ONE_SHOT). Связи подтверждены все, но основной первоисточник
     один — сериализованная манга. */
  const multiGraph = buildSourceGraph({
    meta: { generatedAt: 'fixture', generator: 'FIXTURE', note: 'multi' },
    comics: [
      { anilist: 910001, mal: 810001, format: 'MANGA', country: 'JP', titleOriginal: 'Long Manga', chapters: 1100 },
      { anilist: 910002, mal: 810002, format: 'ONE_SHOT', country: 'JP', titleOriginal: 'Prototype One Shot', chapters: 1 },
      { anilist: 910003, mal: 810003, format: 'MANGA', country: 'JP', titleOriginal: 'Alternative Manga' },
    ],
    edges: [
      { anime: 2001, comic: 910002, raw: 'ADAPTATION', observedAt: 'fixture' },
      { anime: 2001, comic: 910001, raw: 'ADAPTATION', observedAt: 'fixture' },
    ],
  });
  const multiStore = buildComicStore(multiGraph, []);
  const multiDeps = { graph: multiGraph, store: multiStore, titles: FIXTURE_TITLE_LOOKUP };

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
