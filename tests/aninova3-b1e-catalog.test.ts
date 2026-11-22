import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildComicStore, loadTitleCandidates, loadVerifiedMetadata } from '@/lib/aninova3/comics/store';
import { loadSourceGraph } from '@/lib/aninova3/comics/source-graph';
import { EDITORIAL_COMICS } from '@/lib/aninova3/comics/source-data';
import {
  buildCatalogIndex,
  catalogHref,
  catalogRoleFor,
  normalizeQuery,
  queryCatalog,
  resetCatalogCache,
  type CatalogEntry,
} from '@/lib/aninova3/comics/catalog';
import { comicDisplayTitle, canOpenReader, isPubliclyReadable } from '@/lib/aninova3/comics/publication';
import { PENDING_TITLE_TEXT, hasPublicRussianTitle } from '@/lib/aninova3/comics/model';
import { titleById } from '@/lib/catalog';

/**
 * B1-E: каталог Comics на реальных закоммиченных данных.
 *
 * Тест читает файлы этапа: если скрипт сверки запишет название без совпавших
 * идентификаторов, официальное название лицензии без издателя или пустит
 * непроверенное произведение в каталог — тест упадёт.
 */

const ROOT = process.cwd();
const read = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
const getTitle = (id: number) => titleById.get(id);

interface VerifiedFile {
  meta: { generatedAt: string; checkedLive: boolean; counts: Record<string, number> };
  records: Record<
    string,
    {
      status: string;
      mal: number | null;
      shikimoriId: number | null;
      titleRu: string | null;
      licenseNameRu: string | null;
      genres: string[];
      sourceUrl: string | null;
      checkedAt: string | null;
      defects: string[];
      animeIds: number[];
    }
  >;
}

const verified = read('lib/aninova3/comics/metadata-verified.json') as VerifiedFile;

let store: ReturnType<typeof buildComicStore>;
let entries: CatalogEntry[];

beforeAll(() => {
  store = buildComicStore(loadSourceGraph(), EDITORIAL_COMICS, loadTitleCandidates(), loadVerifiedMetadata());
  resetCatalogCache();
  entries = buildCatalogIndex(store, getTitle);
});

describe('проверенные метаданные (реальный файл)', () => {
  it('сверка выполнена по живым ответам источника и сохранила дату проверки', () => {
    expect(verified.meta.checkedLive).toBe(true);
    expect(Object.keys(verified.records).length).toBeGreaterThan(1000);
    for (const rec of Object.values(verified.records)) {
      if (rec.status === 'SOURCE_VERIFIED' || rec.status === 'PENDING_REVIEW') {
        expect(rec.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(rec.sourceUrl).toMatch(/^https:\/\/shikimori\.one\/mangas\/\d+$/);
      }
    }
  });

  it('русское название принимается только при совпадении всех идентификаторов', () => {
    for (const [key, rec] of Object.entries(verified.records)) {
      if (rec.status !== 'SOURCE_VERIFIED') continue;
      const anilist = Number(key);
      const comic = store.byAniList.get(anilist);
      expect(comic, `нет произведения ${anilist}`).toBeTruthy();
      expect(rec.mal).toBe(comic?.externalIds.mal);
      expect(rec.shikimoriId).toBe(rec.mal);
      expect(rec.titleRu).toBeTruthy();
      expect(rec.defects).toEqual([]);
      /* В названии есть русский текст, а не латиница под видом русского. */
      expect((rec.titleRu ?? '').match(/[а-яё]/gi)?.length ?? 0).toBeGreaterThan(1);
    }
  });

  it('лицензионное название источника не объявляется официальным', () => {
    for (const rec of Object.values(verified.records)) {
      expect(rec.licenseNameRu === null || typeof rec.licenseNameRu === 'string').toBe(true);
    }
    const official = store.list.filter((c) => c.metadata?.officialPublisherConfirmed && c.verification !== 'EDITORIALLY_VERIFIED');
    expect(official).toEqual([]);
  });

  it('статусы метаданных не смешиваются с правами и главами', () => {
    for (const comic of store.list) {
      if (hasPublicRussianTitle(comic.verification)) {
        /* Даже проверенное название не даёт ни прав, ни глав, ни читалки. */
        expect(comic.publication.rightsVerified).toBe(false);
        expect(comic.publication.status).not.toBe('APPROVED');
        expect(isPubliclyReadable(comic)).toBe(false);
        expect(canOpenReader(comic)).toBe(false);
      }
    }
  });

  it('название непубличного статуса не попадает в публичное поле', () => {
    for (const comic of store.list) {
      if (hasPublicRussianTitle(comic.verification)) continue;
      expect(comic.titleRu).toBe('');
      expect(comicDisplayTitle(comic).text).toBe(PENDING_TITLE_TEXT);
      expect(comicDisplayTitle(comic).pending).toBe(true);
    }
  });
});

describe('нейтральные слаги непроверенных произведений', () => {
  it('слаг не содержит оригинального названия', () => {
    let neutral = 0;
    for (const comic of store.list) {
      if (hasPublicRussianTitle(comic.verification)) continue;
      expect(comic.slug).toMatch(/^comic-\d+$/);
      neutral += 1;
    }
    expect(neutral).toBeGreaterThan(100);
  });

  it('публичный слаг построен из русского названия и уникален', () => {
    const slugs = store.list.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const comic of store.list) {
      if (!hasPublicRussianTitle(comic.verification)) continue;
      expect(comic.slug).not.toMatch(/^[a-z]*-?tanpenshuu/);
      expect(comic.slug.length).toBeGreaterThan(0);
    }
  });

  it('старые адреса разрешаются только через legacy-индекс', () => {
    const legacy = [...store.legacySlug.entries()];
    expect(legacy.length).toBeGreaterThan(0);
    for (const [slug] of legacy.slice(0, 50)) {
      expect(store.bySlug.has(slug)).toBe(false);
    }
  });
});

describe('индекс каталога', () => {
  it('в каталог попадают только произведения с проверенным русским названием', () => {
    expect(entries.length).toBeGreaterThan(500);
    for (const entry of entries) {
      expect(hasPublicRussianTitle(entry.comic.verification)).toBe(true);
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.comic.isDemo).toBeFalsy();
      expect(store.bySlug.get(entry.comic.slug)).toBe(entry.comic);
    }
  });

  it('роль считается тем же правилом, что на страницах аниме', () => {
    for (const entry of entries) {
      const role = catalogRoleFor(entry.comic, getTitle);
      expect(entry.role).toBe(role);
      expect(entry.roleLabel.length).toBeGreaterThan(0);
    }
    /* Первоисточники и комиксы по аниме должны быть представлены. */
    expect(entries.filter((e) => e.role === 'source').length).toBeGreaterThan(100);
  });

  it('сортировка по названию стабильна и не зависит от порядка графа', () => {
    const titles = entries.map((e) => e.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b, 'ru'));
    expect(titles).toEqual(sorted);
  });
});

describe('серверные фильтры, поиск, сортировка и пагинация', () => {
  const fixture = () => entries;

  it('поиск идёт по русскому названию и нормализует регистр/ё', () => {
    const sample = entries[0];
    const word = sample.title.split(/\s+/)[0];
    const found = queryCatalog(fixture(), { q: word.toUpperCase() });
    expect(found.items.some((e) => e.comic.id === sample.comic.id)).toBe(true);
    expect(normalizeQuery('Ёжик  и ЛИСА')).toBe('ежик и лиса');
    /* Латиница в названии не подменяет поиск: запрос по оригиналу ничего не ищет. */
    expect(queryCatalog(fixture(), { q: sample.comic.titleOriginal }).items).not.toContainEqual(
      expect.objectContaining({ comic: sample.comic }),
    );
  });

  it('пустой запрос возвращает весь каталог', () => {
    const all = queryCatalog(fixture(), { pageSize: 5000 });
    expect(all.total).toBe(entries.length);
  });

  it('фильтры по роли, типу и жанру сужают выборку согласованно', () => {
    const sources = queryCatalog(fixture(), { role: 'source', pageSize: 5000 });
    expect(sources.total).toBeGreaterThan(0);
    expect(sources.items.every((e) => e.role === 'source')).toBe(true);
    expect(sources.total).toBeLessThan(entries.length);

    const manga = queryCatalog(fixture(), { kind: 'manga', pageSize: 5000 });
    expect(manga.items.every((e) => e.comic.kind === 'manga')).toBe(true);

    const genre = entries.find((e) => e.genres.length)?.genres[0] ?? '';
    expect(genre).toBeTruthy();
    const byGenre = queryCatalog(fixture(), { genre, pageSize: 5000 });
    expect(byGenre.items.every((e) => e.genres.includes(genre))).toBe(true);
    expect(byGenre.facets.genres.some((g) => g.value === genre)).toBe(true);
  });

  it('пагинация не дублирует и не теряет записи', () => {
    const pageSize = 24;
    const first = queryCatalog(fixture(), { pageSize });
    expect(first.items).toHaveLength(pageSize);
    expect(first.pages).toBe(Math.ceil(first.total / pageSize));
    const second = queryCatalog(fixture(), { pageSize, page: 2 });
    const ids = new Set([...first.items, ...second.items].map((e) => e.comic.id));
    expect(ids.size).toBe(first.items.length + second.items.length);
    const tooFar = queryCatalog(fixture(), { pageSize, page: 9999 });
    expect(tooFar.page).toBe(tooFar.pages);
    expect(tooFar.items.length).toBeGreaterThan(0);
  });

  it('сортировки меняют порядок, но не состав', () => {
    const byYear = queryCatalog(fixture(), { sort: 'year', pageSize: 5000 });
    expect(byYear.total).toBe(entries.length);
    const years = byYear.items.map((e) => e.comic.year ?? 0);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    const byAnime = queryCatalog(fixture(), { sort: 'anime', pageSize: 5000 });
    const counts = byAnime.items.map((e) => e.sourceAnimeCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('ссылка каталога сохраняет фильтры и сбрасывает страницу', () => {
    const href = catalogHref({ q: 'наруто', genre: 'Драма', sort: 'year', page: 3 }, { page: 1 });
    expect(href).toContain('q=');
    expect(href).toContain('genre=');
    expect(href).toContain('sort=year');
    expect(href).not.toContain('page=');
  });

  it('фасеты не выходят за текущую выборку', () => {
    const result = queryCatalog(fixture(), { role: 'source', pageSize: 5000 });
    const sum = result.facets.roles.reduce((n, r) => n + r.count, 0);
    expect(sum).toBe(result.total);
  });
});
