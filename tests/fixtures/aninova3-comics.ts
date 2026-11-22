/**
 * FIXTURE — только для unit-тестов B1-C.
 *
 * Это НЕ реальные данные и НЕ каталог: идентификаторы, названия и главы здесь
 * вымышлены специально, чтобы проверить положительный сценарий (подтверждённая
 * связь + права + русские главы + страницы), который в реальных данных пока
 * недостижим. Ни один роут preview этот файл не импортирует.
 */
import type { Title } from '@/lib/types';
import type { ComicChapter } from '@/lib/aninova3/comics/model';
import type { EditorialComic } from '@/lib/aninova3/comics/source-data';
import type { RawSourceGraph } from '@/lib/aninova3/comics/source-graph';
import type { TitleLookup } from '@/lib/aninova3/comics/source-links';

const baseTitle: Omit<Title, 'anilistId' | 'slug' | 'ru' | 'romaji'> = {
  type: 'tv',
  year: 2020,
  status: 'finished',
  episodes: 12,
  score: 7.5,
  favourites: 100,
  genres: ['action'],
  poster: '',
  description: '',
};

export function fixtureTitle(partial: Pick<Title, 'anilistId' | 'slug' | 'ru' | 'romaji'> & Partial<Title>): Title {
  return { ...baseTitle, ...partial } as Title;
}

function chapter(number: number, language: ComicChapter['language'], pages = 18): ComicChapter {
  return { id: `ch-${number}`, number, titleRu: `Глава ${number}`, language, pages };
}

/** Утверждённое произведение: права есть, русские главы есть, страницы есть. */
export const FIXTURE_APPROVED: EditorialComic = {
  anilist: 900001,
  titleRu: 'Тестовая манга',
  russianTitleVerified: true,
  authorsRu: ['Тестовый автор'],
  authorsVerified: true,
  metadataVerified: true,
  descriptionRu: 'Fixture для проверки положительного сценария.',
  publicationStatus: 'APPROVED',
  rightsVerified: true,
  verifiedAt: '2026-11-20',
  kind: 'manga',
  status: 'completed',
  year: 2015,
  chapters: [
    { ...chapter(1, 'ru'), pageImages: ['/demo/comics/page-1.jpg', '/demo/comics/page-2.jpg'] },
    { ...chapter(2, 'ru'), pageImages: ['/demo/comics/page-3.jpg'] },
  ],
};

/** Права подтверждены, но страницы глав не подключены → кнопки чтения быть не должно. */
export const FIXTURE_APPROVED_NO_PAGES: EditorialComic = {
  anilist: 900002,
  titleRu: 'Манга без страниц',
  russianTitleVerified: true,
  metadataVerified: true,
  publicationStatus: 'APPROVED',
  rightsVerified: true,
  chapters: [chapter(1, 'ru')],
};

/** Нет прав. */
export const FIXTURE_NO_RIGHTS: EditorialComic = {
  anilist: 900003,
  titleRu: 'Манга без прав',
  russianTitleVerified: true,
  metadataVerified: true,
  publicationStatus: 'PENDING_VERIFICATION',
  rightsVerified: false,
  chapters: [chapter(1, 'ru')],
};

/** Только иностранные главы: русских нет, fallback запрещён. */
export const FIXTURE_FOREIGN_ONLY: EditorialComic = {
  anilist: 900004,
  titleRu: 'Манга без русских глав',
  russianTitleVerified: true,
  metadataVerified: true,
  publicationStatus: 'APPROVED',
  rightsVerified: true,
  chapters: [chapter(1, 'en'), chapter(2, 'ja')],
};

/** Ожидает проверки русского названия. */
export const FIXTURE_UNVERIFIED_RU: EditorialComic = {
  anilist: 900005,
  titleRu: 'Несверенное название',
  russianTitleVerified: false,
  metadataVerified: false,
  publicationStatus: 'DRAFT',
  rightsVerified: false,
  chapters: [],
};

/** Истёкшее разрешение. */
export const FIXTURE_EXPIRED: EditorialComic = {
  anilist: 900006,
  titleRu: 'Истекшее разрешение',
  russianTitleVerified: true,
  metadataVerified: true,
  publicationStatus: 'EXPIRED',
  rightsVerified: true,
  chapters: [chapter(1, 'ru')],
};

/** Вторая часть той же серии — продолжение, а не первоисточник. */
export const FIXTURE_SEQUEL: EditorialComic = {
  anilist: 900007,
  titleRu: 'Тестовая манга: продолжение',
  russianTitleVerified: true,
  metadataVerified: true,
  publicationStatus: 'PENDING_VERIFICATION',
  rightsVerified: false,
  chapters: [],
};

export const FIXTURE_EDITORIALS: EditorialComic[] = [
  FIXTURE_APPROVED,
  FIXTURE_APPROVED_NO_PAGES,
  FIXTURE_NO_RIGHTS,
  FIXTURE_FOREIGN_ONLY,
  FIXTURE_UNVERIFIED_RU,
  FIXTURE_EXPIRED,
  FIXTURE_SEQUEL,
];

/**
 * Граф-фикстура:
 * - 1001: манга-первоисточник + продолжение (SIDE_STORY) → несколько связей;
 * - 1002: две экранизации одной манги 900010;
 * - 1003: неизвестный relationType;
 * - 1004: два разных произведения с одним MAL id → неоднозначность;
 * - 1005: аниме без единой связи (оригинальное);
 * - 1006: ребро ссылается на комикс, которого нет в графе.
 */
export const FIXTURE_GRAPH: RawSourceGraph = {
  meta: { generatedAt: 'fixture', generator: 'FIXTURE', note: 'Только для unit-тестов' },
  comics: [
    {
      anilist: 900001,
      mal: 800001,
      format: 'MANGA',
      country: 'JP',
      titleOriginal: 'Fixture Manga',
      year: 2015,
      status: 'FINISHED',
      chapters: 40,
      cover: null,
      authors: ['Test Author'],
    },
    {
      anilist: 900002,
      mal: 800002,
      format: 'MANGA',
      country: 'JP',
      titleOriginal: 'Fixture No Pages',
      year: 2016,
      status: 'FINISHED',
      chapters: 12,
    },
    {
      anilist: 900003,
      mal: 800003,
      format: 'MANGA',
      country: 'KR',
      titleOriginal: 'Fixture Manhwa',
      year: 2018,
      status: 'RELEASING',
      chapters: 90,
    },
    {
      anilist: 900004,
      mal: 800004,
      format: 'MANGA',
      country: 'CN',
      titleOriginal: 'Fixture Manhua',
      year: 2019,
      status: 'RELEASING',
      chapters: 60,
    },
    {
      anilist: 900005,
      mal: 800005,
      format: 'MANGA',
      country: 'JP',
      titleOriginal: 'Unverified Title',
      year: 2020,
      status: 'FINISHED',
    },
    {
      anilist: 900006,
      mal: 800006,
      format: 'MANGA',
      country: 'JP',
      titleOriginal: 'Expired Rights',
      year: 2021,
      status: 'FINISHED',
    },
    {
      anilist: 900007,
      mal: 800007,
      format: 'MANGA',
      country: 'JP',
      titleOriginal: 'Fixture Manga Sequel',
      year: 2022,
      status: 'RELEASING',
    },
    { anilist: 900010, mal: 800010, format: 'MANGA', country: 'JP', titleOriginal: 'Two Adaptations', year: 2010 },
    { anilist: 900011, mal: 800099, format: 'MANGA', country: 'JP', titleOriginal: 'Duplicate Mal A', year: 2012 },
    { anilist: 900012, mal: 800099, format: 'MANGA', country: 'JP', titleOriginal: 'Duplicate Mal B', year: 2013 },
  ],
  edges: [
    { anime: 1001, comic: 900001, raw: 'ADAPTATION', observedAt: 'fixture' },
    { anime: 1001, comic: 900007, raw: 'SIDE_STORY', observedAt: 'fixture' },
    { anime: 1002, comic: 900010, raw: 'ADAPTATION', observedAt: 'fixture' },
    { anime: 1012, comic: 900010, raw: 'ADAPTATION', observedAt: 'fixture' },
    { anime: 1003, comic: 900002, raw: 'WEIRD_NEW_TYPE', observedAt: 'fixture' },
    { anime: 1004, comic: 900011, raw: 'ADAPTATION', observedAt: 'fixture' },
    { anime: 1004, comic: 900012, raw: 'ADAPTATION', observedAt: 'fixture' },
    { anime: 1006, comic: 909999, raw: 'ADAPTATION', observedAt: 'fixture' },
    { anime: 1007, comic: 900003, raw: 'ADAPTATION', observedAt: 'fixture' },
    { anime: 1008, comic: 900004, raw: 'ADAPTATION', observedAt: 'fixture' },
    { anime: 1009, comic: 900005, raw: 'ADAPTATION', observedAt: 'fixture' },
    { anime: 1010, comic: 900006, raw: 'ADAPTATION', observedAt: 'fixture' },
    /* Совпадение названия без идентификатора: ребра нет — связи быть не должно. */
  ],
};

/** Аниме-каталог для обратной навигации. */
export const FIXTURE_TITLES: Record<number, Title> = {
  1001: fixtureTitle({ anilistId: 1001, slug: 'fixture-anime', ru: 'Тестовое аниме', romaji: 'Fixture Anime' }),
  1002: fixtureTitle({ anilistId: 1002, slug: 'fixture-anime-2', ru: 'Тестовое аниме 2', romaji: 'Fixture Anime 2' }),
  1003: fixtureTitle({ anilistId: 1003, slug: 'fixture-anime-3', ru: 'Тестовое аниме 3', romaji: 'Fixture Anime 3' }),
  1009: fixtureTitle({ anilistId: 1009, slug: 'fixture-anime-9', ru: 'Тестовое аниме 9', romaji: 'Fixture Anime 9' }),
  1011: fixtureTitle({
    anilistId: 1011,
    slug: 'fixture-anime-11',
    ru: 'Тёзка без связи',
    romaji: 'Fixture Manga',
    hidden: true,
  }),
  1012: fixtureTitle({
    anilistId: 1012,
    slug: 'fixture-anime-12',
    ru: 'Вторая адаптация',
    romaji: 'Second Adaptation',
  }),
};

export const FIXTURE_TITLE_LOOKUP: TitleLookup = {
  get: (id: number) => FIXTURE_TITLES[id],
};
