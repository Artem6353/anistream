import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildComicStore, loadTitleCandidates } from '@/lib/aninova3/comics/store';
import { loadSourceGraph } from '@/lib/aninova3/comics/source-graph';
import { validateCandidates, type CandidateRow } from '@/lib/aninova3/comics/candidate-validation';
import { canOpenReader, comicDisplayTitle, isPubliclyReadable, publicationIssues } from '@/lib/aninova3/comics/publication';
import { EDITORIAL_COMICS } from '@/lib/aninova3/comics/source-data';
import { PENDING_TITLE_TEXT } from '@/lib/aninova3/comics/model';

/**
 * B1-D: проверка данных и ворот публикации на РЕАЛЬНЫХ файлах preview.
 *
 * Тест намеренно читает закоммиченные данные: если скрипт сбора однажды запишет
 * битые id, пустые названия или самозваные «проверенные» флаги — тест упадёт.
 * Никаких сетевых вызовов здесь нет.
 */

const ROOT = process.cwd();
const read = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));

const graph = loadSourceGraph();
const candidates = loadTitleCandidates();
const store = buildComicStore(graph, EDITORIAL_COMICS, candidates);

describe('кандидаты русских метаданных (реальный файл)', () => {
  const runtime = read('lib/aninova3/comics/metadata-candidates.json') as { candidates: CandidateRow[] };
  const comics = new Map(
    graph.comics.map((c) => [c.anilist, { externalIds: { anilist: c.anilist, mal: c.mal ?? null }, year: c.year ?? null }]),
  );

  it('не содержат пустых названий, битых id и заглушек', () => {
    const result = validateCandidates(runtime.candidates, comics);
    expect(result.problems).toEqual([]);
    expect(result.stats.malMismatch).toBe(0);
    expect(result.stats.unknownComic).toBe(0);
    expect(result.stats.untranslatedTitle).toBe(0);
  });

  it('каждый кандидат привязан к реальному произведению из графа', () => {
    for (const row of runtime.candidates) {
      expect(comics.has(row.anilist)).toBe(true);
      expect(row.mal).toBe(comics.get(row.anilist)?.externalIds.mal);
      expect(String(row.titleRu).trim().length).toBeGreaterThan(0);
    }
  });

  it('обложки кандидатов — абсолютные URL', () => {
    for (const row of runtime.candidates) {
      if (row.cover) expect(row.cover).toMatch(/^https:\/\//);
    }
  });
});

describe('кандидат не становится проверенным', () => {
  it('ни одно произведение с кандидатом не имеет verified-флагов', () => {
    for (const comic of store.list) {
      if (!comic.titleRuCandidate) continue;
      expect(comic.verification).toBe(comic.publication.russianTitleVerified ? 'EDITORIALLY_VERIFIED' : 'CANDIDATE');
      expect(comic.publication.rightsVerified).toBe(false);
      expect(comic.publication.status).not.toBe('APPROVED');
    }
  });

  it('публичное название непроверенного произведения — нейтральный текст', () => {
    for (const comic of store.list) {
      if (comic.publication.russianTitleVerified) continue;
      expect(comic.titleRu).toBe('');
      expect(comicDisplayTitle(comic).text).toBe(PENDING_TITLE_TEXT);
    }
  });

  it('права не появляются ни у кого автоматически', () => {
    for (const comic of store.list) expect(comic.publication.rightsVerified).toBe(false);
    expect(store.list.filter((c) => isPubliclyReadable(c))).toHaveLength(0);
    expect(store.list.filter((c) => canOpenReader(c))).toHaveLength(0);
  });

  it('у всех реальных произведений причина недоступности сформулирована', () => {
    for (const comic of store.list) {
      const issues = publicationIssues(comic);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues).toContain('rights_unverified');
      expect(issues).toContain('no_ru_chapters');
    }
  });
});

describe('граф и реестр согласованы', () => {
  it('в реестре нет произведений без id и с пустыми названиями', () => {
    for (const comic of store.list) {
      expect(comic.id).toMatch(/^comic:anilist:\d+$/);
      expect(comic.externalIds.anilist).toBeGreaterThan(0);
      expect(String(comic.titleOriginal ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('slug уникальны, дублей id нет', () => {
    const slugs = store.list.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const ids = store.list.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('все рёбра указывают на существующее произведение', () => {
    for (const edge of graph.edges) {
      expect(store.byAniList.has(edge.comicAniListId ?? -1)).toBe(true);
    }
  });
});

describe('очередь ручной проверки (реальные счётчики)', () => {
  /* B1-D опубликовал «116 строк» при сумме массивов 120. Тест закрепляет
     арифметику очереди: массивы разного уровня, поэтому строки ≠ случаи. */
  const queue = read('docs/data/aninova3-b1d-review-queue.json') as {
    counts: {
      rowsPerArray: Record<string, number>;
      rowsTotal: number;
      animePerArray: Record<string, number>;
      uniqueEdges: number;
      uniqueAnime: number;
      duplicateMalCases: number;
      overlaps: Record<string, number>;
    };
    multiSourceNeedsReview: { anime: number }[];
    comicAdaptsAnime: { anime: number }[];
    adaptationAfterAnime: { anime: number; comic: number }[];
    duplicateMal: { mal: number; comics: number[] }[];
  };

  it('сумма массивов совпадает с заявленным числом строк', () => {
    const sum = Object.values(queue.counts.rowsPerArray).reduce((n, v) => n + v, 0);
    expect(queue.counts.rowsTotal).toBe(sum);
    expect(queue.counts.rowsPerArray.multiSourceNeedsReview).toBe(queue.multiSourceNeedsReview.length);
    expect(queue.counts.rowsPerArray.comicAdaptsAnime).toBe(queue.comicAdaptsAnime.length);
    expect(queue.counts.rowsPerArray.adaptationAfterAnime).toBe(queue.adaptationAfterAnime.length);
    expect(queue.counts.rowsPerArray.duplicateMal).toBe(queue.duplicateMal.length);
  });

  it('уникальные аниме посчитаны по объединению, а не суммой', () => {
    const union = new Set<number>([
      ...queue.multiSourceNeedsReview.map((r) => r.anime),
      ...queue.comicAdaptsAnime.map((r) => r.anime),
      ...queue.adaptationAfterAnime.map((r) => r.anime),
    ]);
    expect(queue.counts.uniqueAnime).toBe(union.size);
    expect(queue.counts.uniqueAnime).toBeLessThan(
      queue.multiSourceNeedsReview.length + queue.comicAdaptsAnime.length + queue.adaptationAfterAnime.length,
    );
    /* Пересечения объяснены: одни и те же аниме описаны в разных массивах. */
    for (const [key, value] of Object.entries(queue.counts.overlaps)) {
      expect(value).toBeGreaterThan(0);
      expect(key).toContain('×');
    }
  });

  it('«адаптации после аниме» — это рёбра, а не аниме', () => {
    const pairs = new Set(queue.adaptationAfterAnime.map((r) => `${r.anime}|${r.comic}`));
    expect(queue.counts.uniqueEdges).toBe(pairs.size);
    const anime = new Set(queue.adaptationAfterAnime.map((r) => r.anime));
    expect(anime.size).toBeLessThan(queue.adaptationAfterAnime.length);
    for (const row of queue.adaptationAfterAnime) expect(row.comic).toBeGreaterThan(0);
  });

  it('дубли MAL учитываются отдельно от аниме-случаев', () => {
    expect(queue.counts.duplicateMalCases).toBe(queue.duplicateMal.length);
    for (const row of queue.duplicateMal) expect(row.comics.length).toBeGreaterThan(1);
  });
});
