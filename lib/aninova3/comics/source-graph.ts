/**
 * Снимок подтверждённых relation-рёбер «аниме → комикс».
 *
 * Источник данных — публичный relation-граф AniList, снятый ОФЛАЙН скриптом
 * scripts/aninova3-source-graph.mjs и закоммиченный как preview-данные. В рантайме
 * никаких внешних запросов нет: файл читается один раз на процесс и превращается
 * в индексы Map (O(1) на страницу аниме вместо N+1 обращений к API).
 *
 * Важно: связь создаётся ТОЛЬКО по идентификатору (AniList/MAL) и только из
 * relation-ребра. Совпадение названий кандидатом на связь не является.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ComicKind,
  ComicPublishingStatus,
  ComicSourceEvidence,
  RawRelationType,
  WorkRelationKind,
} from './model';

export interface RawGraphComic {
  anilist: number;
  mal?: number;
  shikimori?: number;
  /** MANGA | ONE_SHOT … как в AniList. */
  format?: string;
  /** JP | KR | CN | TW — из AniList countryOfOrigin. */
  country?: string | null;
  titleOriginal: string;
  titleNative?: string | null;
  year?: number | null;
  status?: string | null;
  chapters?: number | null;
  volumes?: number | null;
  cover?: string | null;
  authors?: string[];
}

export interface RawGraphEdge {
  anime: number;
  comic: number;
  /** Сырой relationType AniList. */
  raw: string;
  observedAt?: string;
  note?: string;
}

export interface RawSourceGraph {
  meta?: Record<string, unknown> & { generatedAt?: string; generator?: string; note?: string };
  comics?: RawGraphComic[];
  edges?: RawGraphEdge[];
}

export interface SourceGraph {
  meta: RawSourceGraph['meta'];
  comics: RawGraphComic[];
  edges: ComicSourceEvidence[];
  byAnime: Map<number, ComicSourceEvidence[]>;
  byComicAniList: Map<number, ComicSourceEvidence[]>;
  comicsByAniList: Map<number, RawGraphComic[]>;
  comicsByMal: Map<number, RawGraphComic[]>;
  comicsById: Map<string, RawGraphComic>;
}

/** Известные relationType AniList. Неизвестное значение не отбрасывается, а помечается UNKNOWN. */
const RAW_RELATIONS: readonly RawRelationType[] = [
  'ADAPTATION',
  'PARENT',
  'SEQUEL',
  'PREQUEL',
  'SIDE_STORY',
  'SPIN_OFF',
  'ALTERNATIVE',
  'OTHER',
  'SUMMARY',
  'CHARACTER',
  'COMPILATION',
  'FULL_STORY',
  'UNKNOWN',
];

export function normalizeRawRelation(raw: string | null | undefined): RawRelationType {
  const upper = (raw ?? '').trim().toUpperCase();
  return (RAW_RELATIONS as readonly string[]).includes(upper) ? (upper as RawRelationType) : 'UNKNOWN';
}

/**
 * relationType AniList → роль комикса относительно аниме.
 *
 * ADAPTATION на стороне аниме означает «аниме является адаптацией связанного
 * произведения» → связанная манга — SOURCE. SEQUEL/PREQUEL/SIDE_STORY — это части
 * той же серии, а НЕ первоисточник: их нельзя подмешивать в блок первоисточника.
 * PARENT, SUMMARY, CHARACTER, COMPILATION и прочие — только RELATED.
 */
export function relationFromRaw(raw: RawRelationType | string | null | undefined): WorkRelationKind {
  switch (normalizeRawRelation(raw ?? '')) {
    case 'ADAPTATION':
      return 'SOURCE';
    case 'SEQUEL':
      return 'SEQUEL';
    case 'PREQUEL':
      return 'PREQUEL';
    case 'SIDE_STORY':
    case 'SPIN_OFF':
      return 'SPIN_OFF';
    case 'ALTERNATIVE':
      return 'ALTERNATIVE';
    default:
      return 'RELATED';
  }
}

/** Комикс ли это по данным AniList (аниме-форматы отбрасываются). */
export function isComicFormat(format: string | null | undefined): boolean {
  const f = (format ?? '').toUpperCase();
  return f === 'MANGA' || f === 'ONE_SHOT';
}

/**
 * Вид произведения: страна происхождения приоритетнее формата, потому что
 * манхва/маньхуа — это те же MANGA в терминах AniList.
 * Вебтун выставляется только редакционно (в AniList отдельного формата нет),
 * поэтому здесь он не угадывается.
 */
export function comicKindFrom(format?: string | null, country?: string | null): ComicKind {
  if ((format ?? '').toUpperCase() === 'ONE_SHOT') return 'comic';
  switch ((country ?? '').toUpperCase()) {
    case 'KR':
      return 'manhwa';
    case 'CN':
    case 'TW':
      return 'manhua';
    default:
      return 'manga';
  }
}

export function comicStatusFrom(raw: string | null | undefined): ComicPublishingStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'RELEASING':
      return 'ongoing';
    case 'FINISHED':
      return 'completed';
    case 'HIATUS':
      return 'hiatus';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

export function comicInternalId(anilistId: number): string {
  return `comic:anilist:${anilistId}`;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Чистая сборка индексов из снимка (используется и тестами, и загрузчиком). */
export function buildSourceGraph(raw: RawSourceGraph): SourceGraph {
  const comics = Array.isArray(raw.comics) ? raw.comics.filter((c) => Number.isFinite(c.anilist)) : [];
  const byAnime = new Map<number, ComicSourceEvidence[]>();
  const byComicAniList = new Map<number, ComicSourceEvidence[]>();
  const comicsByAniList = new Map<number, RawGraphComic[]>();
  const comicsByMal = new Map<number, RawGraphComic[]>();
  const comicsById = new Map<string, RawGraphComic>();
  const edges: ComicSourceEvidence[] = [];

  for (const comic of comics) {
    push(comicsByAniList, comic.anilist, comic);
    if (Number.isFinite(comic.mal)) push(comicsByMal, comic.mal as number, comic);
    comicsById.set(comicInternalId(comic.anilist), comic);
  }

  for (const edge of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!Number.isFinite(edge.anime) || !Number.isFinite(edge.comic)) continue;
    const rawRelation = normalizeRawRelation(edge.raw);
    const evidence: ComicSourceEvidence = {
      animeAniListId: edge.anime,
      comicAniListId: edge.comic,
      comicInternalId: comicInternalId(edge.comic),
      role: relationFromRaw(rawRelation),
      evidence: 'anilist-relation',
      rawRelation,
      note: edge.note,
      observedAt: edge.observedAt,
    };
    edges.push(evidence);
    push(byAnime, edge.anime, evidence);
    push(byComicAniList, edge.comic, evidence);
  }

  return { meta: raw.meta, comics, edges, byAnime, byComicAniList, comicsByAniList, comicsByMal, comicsById };
}

export const EMPTY_SOURCE_GRAPH: SourceGraph = buildSourceGraph({});

const GRAPH_FILE = () => path.join(process.cwd(), 'lib', 'aninova3', 'comics', 'source-graph.json');

let CACHE: SourceGraph | null = null;
let CACHE_KEY = '';

/**
 * Ленивая загрузка снимка. Файл маленький и читается один раз на процесс;
 * mtime-кэш нужен только для dev-правок без рестарта. Отсутствие файла не роняет
 * страницу: граф пуст, блок первоисточника просто не рендерится.
 */
export function loadSourceGraph(): SourceGraph {
  if (CACHE) return CACHE;
  try {
    const file = GRAPH_FILE();
    const raw = JSON.parse(readFileSync(file, 'utf8')) as RawSourceGraph;
    CACHE_KEY = String(raw?.meta?.generatedAt ?? '');
    CACHE = buildSourceGraph(raw);
  } catch {
    CACHE_KEY = '';
    CACHE = EMPTY_SOURCE_GRAPH;
  }
  return CACHE;
}

/** Только для тестов/скриптов: подменить граф в процессе. */
export function setSourceGraphForTesting(graph: SourceGraph | null): void {
  CACHE = graph;
  CACHE_KEY = graph ? 'testing' : '';
}

export function sourceGraphKey(): string {
  return CACHE_KEY;
}
