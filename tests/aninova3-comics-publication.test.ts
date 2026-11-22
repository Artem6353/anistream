import { describe, expect, it } from 'vitest';
import { buildComicStore } from '@/lib/aninova3/comics/store';
import { buildSourceGraph } from '@/lib/aninova3/comics/source-graph';
import {
  canOpenReader,
  chaptersLine,
  comicDisplayTitle,
  hasReaderSource,
  isPreviewReadable,
  isPubliclyReadable,
  isPublicRuChapter,
  publicationIssues,
  publicationSummary,
  publicRuChapters,
} from '@/lib/aninova3/comics/publication';
import type { ComicWork } from '@/lib/aninova3/comics/model';
import { FIXTURE_EDITORIALS, FIXTURE_GRAPH } from './fixtures/aninova3-comics';

/** B1-C.4: правила публикации — русское название, русские главы, права. */

const store = buildComicStore(buildSourceGraph(FIXTURE_GRAPH), FIXTURE_EDITORIALS);
const byId = (id: string): ComicWork => {
  const comic = store.byId.get(id);
  if (!comic) throw new Error(`fixture ${id} отсутствует`);
  return comic;
};

const approved = byId('comic:anilist:900001');
const approvedNoPages = byId('comic:anilist:900002');
const noRights = byId('comic:anilist:900003');
const foreignOnly = byId('comic:anilist:900004');
const unverified = byId('comic:anilist:900005');
const expired = byId('comic:anilist:900006');

describe('полная проверка публикации', () => {
  it('APPROVED + RU-название + метаданные + права + RU-главы = читается', () => {
    expect(approved.publication.status).toBe('APPROVED');
    expect(isPubliclyReadable(approved)).toBe(true);
    expect(canOpenReader(approved)).toBe(true);
    expect(publicationIssues(approved)).toEqual([]);
    expect(publicationSummary(approved)).toBe('Публикация разрешена');
  });

  it('без прав чтение запрещено, даже если главы на русском есть', () => {
    expect(publicRuChapters(noRights).length).toBe(1);
    expect(isPubliclyReadable(noRights)).toBe(false);
    expect(canOpenReader(noRights)).toBe(false);
    expect(publicationIssues(noRights)).toContain('rights_unverified');
  });

  it('права подтверждены, но страниц нет — кнопки чтения нет', () => {
    expect(isPubliclyReadable(approvedNoPages)).toBe(true);
    expect(hasReaderSource(approvedNoPages)).toBe(false);
    expect(canOpenReader(approvedNoPages)).toBe(false);
  });

  it('иностранные главы не подменяют русские', () => {
    expect(foreignOnly.chapters).toHaveLength(2);
    expect(publicRuChapters(foreignOnly)).toHaveLength(0);
    expect(isPubliclyReadable(foreignOnly)).toBe(false);
    expect(publicationIssues(foreignOnly)).toContain('no_ru_chapters');
    expect(canOpenReader(foreignOnly)).toBe(false);
  });

  it('глава на русском без страниц не считается доступной', () => {
    expect(isPublicRuChapter({ id: 'x', number: 1, titleRu: 'Глава 1', language: 'ru', pages: 0 })).toBe(false);
    expect(isPublicRuChapter({ id: 'x', number: 0, titleRu: '', language: 'ru', pages: 5 })).toBe(false);
    expect(isPublicRuChapter({ id: 'x', number: 1, titleRu: '', language: 'en', pages: 5 })).toBe(false);
    expect(isPublicRuChapter({ id: 'x', number: 1, titleRu: '', language: 'ru', pages: 5 })).toBe(true);
  });

  it('непроверенное русское название закрывает публикацию', () => {
    expect(unverified.publication.status).toBe('DRAFT');
    expect(publicationIssues(unverified)).toContain('title_unverified');
    expect(publicationIssues(unverified)).toContain('metadata_unverified');
    expect(isPubliclyReadable(unverified)).toBe(false);
    const title = comicDisplayTitle(unverified);
    expect(title.russian).toBe(false);
    expect(title.text).toBe(unverified.titleOriginal);
  });

  it('истёкшее разрешение закрывает публикацию', () => {
    expect(expired.publication.status).toBe('EXPIRED');
    expect(publicationIssues(expired)).toContain('expired');
    expect(isPubliclyReadable(expired)).toBe(false);
  });

  it('демо никогда не считается реально читаемым', () => {
    const demo: ComicWork = {
      ...approved,
      id: 'comic:demo:x',
      slug: 'demo-x',
      isDemo: true,
      publication: { ...approved.publication, status: 'APPROVED' },
    };
    expect(isPreviewReadable(demo)).toBe(true);
    expect(isPubliclyReadable(demo)).toBe(false);
    expect(publicationIssues(demo)).toContain('demo');
  });
});

describe('публичные формулировки', () => {
  it('не раскрывают внутренние документы', () => {
    for (const comic of store.list) {
      const text = publicationSummary(comic).toLowerCase();
      expect(text).not.toContain('договор');
      expect(text).not.toContain('лицензи');
      expect(text).not.toContain('контракт');
    }
  });

  it('число глав не выдумывается', () => {
    expect(chaptersLine(noRights)).toBe('1 глава на русском');
    expect(chaptersLine(foreignOnly)).toContain('Русских глав нет');
    expect(chaptersLine(foreignOnly)).toContain(String(foreignOnly.totalChaptersKnown));
  });
});
