/**
 * Реестр комиксов, доступных preview-слою.
 *
 * Собирается из двух источников:
 * 1. relation-граф (`source-graph.json`) — фактические метаданные произведения
 *    (оригинальное название, тип, год, статус, обложка, автор);
 * 2. редакционная проверка (`source-data.ts`) — русское название, публикационные
 *    флаги, реальные русские главы.
 *
 * Реестр строится один раз на процесс. Никаких запросов в БД, внешних API и
 * чтения полного каталога аниме на каждый рендер: только Map-индексы.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ComicKind,
  ComicPublishingStatus,
  ComicTitleCandidate,
  ComicVerification,
  ComicWork,
} from './model';
import { comicInternalId, comicKindFrom, comicStatusFrom, loadSourceGraph, type RawGraphComic, type SourceGraph } from './source-graph';
import { findEditorialComic, type EditorialComic } from './source-data';

/**
 * Кандидаты русских метаданных (scripts/aninova3-ru-metadata.mjs).
 * Это ТОЛЬКО кандидаты: публично они не выводятся, пока редакция не подтвердит
 * название (см. publication.ts → comicDisplayTitle).
 */
interface RuntimeCandidates {
  meta?: { generatedAt?: string; counts?: Record<string, number> };
  candidates?: { anilist: number; titleRu: string | null; name?: string | null; sourceUrl?: string | null; fetchedAt?: string }[];
}

const CANDIDATES_FILE = () => path.join(process.cwd(), 'lib', 'aninova3', 'comics', 'metadata-candidates.json');

let CANDIDATE_CACHE: Map<number, ComicTitleCandidate> | null = null;

export function loadTitleCandidates(): Map<number, ComicTitleCandidate> {
  if (CANDIDATE_CACHE) return CANDIDATE_CACHE;
  CANDIDATE_CACHE = new Map();
  try {
    const raw = JSON.parse(readFileSync(CANDIDATES_FILE(), 'utf8')) as RuntimeCandidates;
    for (const row of raw.candidates ?? []) {
      if (!row?.anilist || !row.titleRu) continue;
      CANDIDATE_CACHE.set(row.anilist, {
        title: row.titleRu,
        source: 'shikimori',
        url: row.sourceUrl ?? null,
        fetchedAt: row.fetchedAt ?? raw.meta?.generatedAt ?? '',
      });
    }
  } catch {
    /* Файла нет — работаем без кандидатов, UI останется в нейтральном состоянии. */
  }
  return CANDIDATE_CACHE;
}

export function setTitleCandidatesForTesting(candidates: Map<number, ComicTitleCandidate> | null): void {
  CANDIDATE_CACHE = candidates;
}

export interface ComicStore {
  list: ComicWork[];
  bySlug: Map<string, ComicWork>;
  byId: Map<string, ComicWork>;
  byAniList: Map<number, ComicWork>;
  byMal: Map<number, ComicWork>;
  /** Внешние id, которые встречаются у разных произведений: такие id не разрешают связь. */
  duplicates: { anilist: number[]; mal: number[] };
  /** Сколько произведений в графе вообще. */
  graphTotal: number;
}

/** Транслитерация ограниченного набора: slug должен быть стабильным и ASCII. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'ju', я: 'ja',
};

export function slugifyTitle(input: string): string {
  const lower = (input ?? '').toLowerCase();
  let out = '';
  for (const ch of lower) out += TRANSLIT[ch] ?? ch;
  return out
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function comicSlug(raw: RawGraphComic, taken: Set<string>): string {
  const base = slugifyTitle(raw.titleOriginal || raw.titleNative || '') || `comic-${raw.anilist}`;
  if (!taken.has(base)) return base;
  const withId = `${base}-${raw.anilist}`;
  return withId;
}

/**
 * Сводит сырой граф, редакционную проверку и автоматического кандидата.
 *
 * Ключевое правило: `titleRu` — это ПУБЛИЧНОЕ название, и оно заполняется
 * русским текстом только при редакционной проверке. Автоматический кандидат
 * кладётся в `titleRuCandidate` (внутреннее поле) и в UI не попадает.
 */
function coalesceComic(
  raw: RawGraphComic,
  editorial: EditorialComic | undefined,
  candidate?: ComicTitleCandidate,
): ComicWork {
  const kind: ComicKind = editorial?.kind ?? comicKindFrom(raw.format, raw.country);
  const status: ComicPublishingStatus = editorial?.status ?? comicStatusFrom(raw.status);
  const authorsVerified = Boolean(editorial?.authorsVerified);
  const authors = authorsVerified && editorial?.authorsRu?.length ? editorial.authorsRu : (raw.authors ?? []);
  const verification: ComicVerification = editorial?.russianTitleVerified
    ? 'EDITORIALLY_VERIFIED'
    : candidate
      ? 'CANDIDATE'
      : 'UNVERIFIED';

  return {
    id: comicInternalId(raw.anilist),
    /* slug подставляется в buildComicStore: он зависит от соседей по реестру. */
    slug: '',
    titleRu: editorial?.titleRu?.trim() || '',
    titleOriginal: raw.titleNative?.trim() || raw.titleOriginal,
    kind,
    authors,
    authorsVerified,
    year: editorial?.year ?? raw.year ?? null,
    status,
    cover: editorial?.cover ?? raw.cover ?? null,
    descriptionRu: editorial?.descriptionRu ?? null,
    chapters: editorial?.chapters ?? [],
    totalChaptersKnown: raw.chapters ?? null,
    externalIds: {
      anilist: raw.anilist,
      mal: raw.mal,
      shikimori: raw.shikimori,
      internal: comicInternalId(raw.anilist),
    },
    publication: {
      status: editorial?.publicationStatus ?? 'DRAFT',
      russianTitleVerified: Boolean(editorial?.russianTitleVerified),
      russianMetadataVerified: Boolean(editorial?.metadataVerified),
      rightsVerified: Boolean(editorial?.rightsVerified),
      verificationBasis: editorial ? 'editorial' : 'anilist-relation',
      verifiedAt: editorial?.verifiedAt,
    },
    verification,
    titleRuCandidate: candidate ?? null,
    provenance: editorial
      ? { source: 'editorial', observedAt: editorial.verifiedAt, verification: 'editorial' }
      : { source: 'anilist-relation', verification: 'recorded' },
  };
}

/** Чистая сборка реестра: подходит и для рантайма, и для тестов/скриптов. */
export function buildComicStore(
  graph: SourceGraph,
  editorials?: EditorialComic[],
  candidates: Map<number, ComicTitleCandidate> = new Map(),
): ComicStore {
  const taken = new Set<string>();
  const seen = new Set<number>();
  const list: ComicWork[] = [];

  /* Порядок детерминирован: сорт по AniList id, чтобы slug-коллизии разрешались
     одинаково в любом процессе и в любом тесте. */
  const comics = [...graph.comics].sort((a, b) => a.anilist - b.anilist);
  for (const raw of comics) {
    if (seen.has(raw.anilist)) continue;
    seen.add(raw.anilist);
    const editorial = editorials ? editorials.find((e) => e.anilist === raw.anilist) : findEditorialComic(raw.anilist);
    const comic = coalesceComic(raw, editorial, candidates.get(raw.anilist));
    comic.slug = comicSlug(raw, taken);
    taken.add(comic.slug);
    list.push(comic);
  }

  const bySlug = new Map(list.map((c) => [c.slug, c]));
  const byId = new Map(list.map((c) => [c.id, c]));
  const byAniList = new Map<number, ComicWork>();
  const byMal = new Map<number, ComicWork>();
  const malSeen = new Map<number, number>();
  const anilistSeen = new Map<number, number>();
  for (const comic of list) {
    if (comic.externalIds.anilist) {
      byAniList.set(comic.externalIds.anilist, comic);
      anilistSeen.set(comic.externalIds.anilist, (anilistSeen.get(comic.externalIds.anilist) ?? 0) + 1);
    }
    if (comic.externalIds.mal) {
      byMal.set(comic.externalIds.mal, comic);
      malSeen.set(comic.externalIds.mal, (malSeen.get(comic.externalIds.mal) ?? 0) + 1);
    }
  }

  const duplicates = {
    anilist: [...anilistSeen.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    mal: [...malSeen.entries()].filter(([, n]) => n > 1).map(([id]) => id),
  };

  return { list, bySlug, byId, byAniList, byMal, duplicates, graphTotal: graph.comics.length };
}

let CACHE: ComicStore | null = null;

export function comicStore(): ComicStore {
  if (!CACHE) CACHE = buildComicStore(loadSourceGraph(), undefined, loadTitleCandidates());
  return CACHE;
}

/** Только для тестов/скриптов: подменить реестр в процессе. */
export function setComicStoreForTesting(store: ComicStore | null): void {
  CACHE = store;
}

export function getComicBySlug(slug: string): ComicWork | null {
  return comicStore().bySlug.get(slug) ?? null;
}

export function getComicById(id: string): ComicWork | null {
  return comicStore().byId.get(id) ?? null;
}
