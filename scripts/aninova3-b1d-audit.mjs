#!/usr/bin/env node
/**
 * B1-D: аудит графа первоисточников.
 *
 * Что делает:
 *  1. пересчитывает все показатели B1-C по фактическим данным снимка и каталога;
 *  2. (с --fetch) заново снимает relations по всем аниме каталога и сверяет
 *     снимок с источником: пропавшие/лишние рёбра, изменения relationType,
 *     дрейф метаданных произведений;
 *  3. строит взаимоисключающую классификацию ВСЕХ запрошенных аниме, сумма
 *     категорий обязана совпасть со знаменателем;
 *  4. ищет структурные дефекты (висячие рёбра, дубли внешних id, неизвестные
 *     relationType, комиксы не того формата, временные аномалии);
 *  5. готовит разбор аниме с несколькими первоисточниками и очередь ревью.
 *
 * Сеть — только чтение публичного AniList GraphQL, батчами, с retry/backoff и
 * файлом прогресса (--resume). Снимок скрипт НЕ меняет: он пишет отчёт.
 *
 * Запуск:
 *   node scripts/aninova3-b1d-audit.mjs                 # офлайн-аудит снимка
 *   node scripts/aninova3-b1d-audit.mjs --fetch         # + сверка с AniList (долго)
 *   node scripts/aninova3-b1d-audit.mjs --fetch --limit=300 --dry-run
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CATALOG = path.join(ROOT, 'lib', 'data', 'titles.json');
const GRAPH = path.join(ROOT, 'lib', 'aninova3', 'comics', 'source-graph.json');
const CACHE = path.join(ROOT, '.cache', 'b1d');
const PROGRESS = path.join(CACHE, 'relations-progress.json');
const OUT = path.join(ROOT, 'docs', 'data', 'aninova3-b1d-graph-audit.json');
const REVIEW = path.join(ROOT, 'docs', 'data', 'aninova3-b1d-review-queue.json');
const API = 'https://graphql.anilist.co';
const UA = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': 'AniNova 3.0 B1-D graph audit (aninova-catalog.vercel.app)',
};

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n, d) => {
  const eq = args.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const FETCH = flag('fetch');
const DRY = flag('dry-run');
const LIMIT = Number(val('limit', 0));
const BATCH = Math.max(1, Math.min(50, Number(val('batch', 25))));
const SLEEP_MS = Math.max(700, Number(val('sleep', 1200)));
const RETRIES = Math.max(1, Number(val('retries', 5)));
const TIMEOUT_MS = Math.max(5_000, Number(val('timeout', 25_000)));

const COMIC_FORMATS = new Set(['MANGA', 'ONE_SHOT']);
const RELATION_TYPES = new Set([
  'ADAPTATION',
  'ALTERNATIVE',
  'CHARACTER',
  'OTHER',
  'PARENT',
  'PREQUEL',
  'SEQUEL',
  'SIDE_STORY',
  'SPIN_OFF',
  'SUMMARY',
]);

const readJson = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const QUERY = `query ($ids: [Int]) {
  Page(page: 1, perPage: ${BATCH}) {
    media(id_in: $ids, type: ANIME) {
      id
      startDate { year }
      relations { edges { relationType node { id idMal type format countryOfOrigin startDate { year } chapters title { romaji } } } }
    }
  }
}`;

const net = { requests: 0, retries: 0, rateLimited: 0, failedBatches: [], failedIds: [] };

async function anilist(ids, label) {
  let attempt = 0;
  let backoff = 2_000;
  for (;;) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      net.requests += 1;
      const res = await fetch(API, {
        method: 'POST',
        headers: UA,
        body: JSON.stringify({ query: QUERY, variables: { ids } }),
        signal: controller.signal,
      });
      if (res.status === 429) {
        net.rateLimited += 1;
        const retryAfter = Number(res.headers.get('retry-after') ?? 0);
        const waitMs = Math.max(retryAfter * 1000, backoff);
        if (attempt >= RETRIES) throw new Error(`429 ×${attempt} (${label})`);
        net.retries += 1;
        console.log(`[b1d] 429 ${label}: ждём ${Math.round(waitMs / 1000)} c`);
        await sleep(waitMs);
        backoff = Math.min(backoff * 2, 60_000);
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= RETRIES) throw new Error(`${res.status} ×${attempt} (${label})`);
        net.retries += 1;
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 60_000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} (${label})`);
      const json = await res.json();
      if (json.errors?.length) {
        const message = json.errors.map((e) => e.message).join('; ');
        if (/rate.?limit|too many|temporar/i.test(message) && attempt < RETRIES) {
          net.retries += 1;
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 60_000);
          continue;
        }
        throw new Error(`GraphQL (${label}): ${message}`);
      }
      return json.data;
    } catch (err) {
      if (attempt >= RETRIES) throw new Error(`${err.message} (${label})`);
      net.retries += 1;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60_000);
    } finally {
      clearTimeout(timer);
    }
  }
}

function yearOf(date) {
  return date?.year ?? null;
}

async function fetchFacts(animeIds) {
  mkdirSync(CACHE, { recursive: true });
  const progress = readJson(PROGRESS, { facts: {}, done: [] });
  const facts = progress.facts ?? {};
  const done = new Set(progress.done ?? []);
  const todo = animeIds.filter((id) => !done.has(id));
  console.log(`[b1d] сверка с AniList: ${todo.length} из ${animeIds.length} (кэш ${done.size})`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const label = `${i + 1}-${i + chunk.length}`;
    let data;
    try {
      data = await anilist(chunk, label);
    } catch (err) {
      net.failedBatches.push({ label, ids: chunk, error: err.message });
      net.failedIds.push(...chunk);
      console.error(`[b1d] батч ${label} не получен: ${err.message}`);
      if (i + BATCH < todo.length) await sleep(SLEEP_MS);
      continue;
    }
    const seen = new Set();
    for (const media of data?.Page?.media ?? []) {
      seen.add(media.id);
      const counts = { total: 0, byType: {}, byFormat: {}, comics: 0, comicEdges: [], nonComic: 0 };
      const rel = media.relations?.edges ?? [];
      counts.total = rel.length;
      for (const edge of rel) {
        const node = edge?.node;
        if (!node) continue;
        const type = String(node.type ?? 'UNKNOWN');
        const format = String(node.format ?? 'null');
        counts.byType[type] = (counts.byType[type] ?? 0) + 1;
        const fkey = `${type}/${format}`;
        counts.byFormat[fkey] = (counts.byFormat[fkey] ?? 0) + 1;
        if (COMIC_FORMATS.has(format)) {
          counts.comics += 1;
          counts.comicEdges.push({
            comic: node.id,
            mal: node.idMal ?? null,
            relation: String(edge.relationType ?? 'UNKNOWN'),
            format,
            country: node.countryOfOrigin ?? null,
            year: yearOf(node.startDate),
            chapters: node.chapters ?? null,
            title: node.title?.romaji ?? null,
          });
        } else {
          counts.nonComic += 1;
        }
      }
      facts[media.id] = {
        startYear: yearOf(media.startDate),
        total: counts.total,
        byType: counts.byType,
        byFormat: counts.byFormat,
        comics: counts.comics,
        nonComic: counts.nonComic,
        comicEdges: counts.comicEdges.sort((a, b) => a.comic - b.comic),
      };
    }
    for (const id of chunk) {
      if (!seen.has(id)) {
        facts[id] = { notFound: true, total: 0, byType: {}, byFormat: {}, comics: 0, nonComic: 0, comicEdges: [] };
      }
      done.add(id);
    }
    if ((i / BATCH) % 5 === 0 || i + BATCH >= todo.length) {
      writeFileSync(PROGRESS, `${JSON.stringify({ facts, done: [...done] })}\n`, 'utf8');
      console.log(`[b1d] ${Math.min(i + BATCH, todo.length)}/${todo.length} батчей, фактов ${Object.keys(facts).length}`);
    }
    if (i + BATCH < todo.length) await sleep(SLEEP_MS);
  }
  writeFileSync(PROGRESS, `${JSON.stringify({ facts, done: [...done] })}\n`, 'utf8');
  return facts;
}

/** Классификация одного аниме по взаимоисключающим категориям. */
function classify(fact) {
  if (!fact) return 'unverified';
  if (fact.notFound) return 'not_found_in_source';
  if (fact.total === 0) return 'no_relations';
  if (fact.comics === 0) return 'relations_without_comics';
  if (fact.comics === 1) return 'one_comic';
  return 'several_comics';
}

function main() {
  const catalog = readJson(CATALOG, []);
  const graph = readJson(GRAPH, null);
  if (!catalog.length || !graph) throw new Error('нет каталога или снимка графа');

  const catalogIds = catalog.filter((t) => Number.isFinite(t.anilistId)).map((t) => t.anilistId);
  const uniqueCatalogIds = [...new Set(catalogIds)];
  const duplicatesInCatalog = catalogIds.length - uniqueCatalogIds.length;

  const comics = new Map(graph.comics.map((c) => [c.anilist, c]));
  const edgeByKey = new Map();
  const duplicateEdges = [];
  for (const e of graph.edges) {
    const key = `${e.anime}:${e.comic}`;
    if (edgeByKey.has(key)) duplicateEdges.push(key);
    edgeByKey.set(key, e);
  }

  return { graph, catalog, uniqueCatalogIds, duplicatesInCatalog, comics, edgeByKey, duplicateEdges };
}

async function run() {
  const base = main();
  const { graph, catalog, uniqueCatalogIds, duplicatesInCatalog, comics, edgeByKey, duplicateEdges } = base;

  /* ---------- 1. Факты: из кэша AniList или из снимка ---------- */
  let facts = null;
  const cached = readJson(PROGRESS, null);
  if (FETCH) {
    const pool = LIMIT > 0 ? uniqueCatalogIds.slice(0, LIMIT) : uniqueCatalogIds;
    facts = await fetchFacts(pool);
  } else if (cached?.facts && Object.keys(cached.facts).length) {
    /* Уже снятые факты переиспользуем: повторный сетевой проход не нужен. */
    facts = cached.facts;
    console.log(`[b1d] факты из кэша: ${Object.keys(facts).length}`);
  }

  /* Без сети категорию «есть отношения, но нет комиксов» вывести из снимка нельзя
     честно: снимок хранит только комикс-рёбра. Поэтому офлайн-режим считает то,
     что действительно видно, и явно помечает остальное как неклассифицируемое. */
  const perAnimeEdges = new Map();
  for (const e of graph.edges) {
    const list = perAnimeEdges.get(e.anime) ?? [];
    list.push(e);
    perAnimeEdges.set(e.anime, list);
  }

  const classes = {
    not_found_in_source: [],
    no_relations: [],
    relations_without_comics: [],
    one_comic: [],
    several_comics: [],
    unverified: [],
  };

  if (facts) {
    for (const id of uniqueCatalogIds) {
      const cls = classify(facts[id]);
      classes[cls].push(id);
    }
  } else {
    for (const id of uniqueCatalogIds) {
      const list = perAnimeEdges.get(id) ?? [];
      const uniqueComics = new Set(list.map((e) => e.comic));
      if (uniqueComics.size === 0) classes.unverified.push(id);
      else if (uniqueComics.size === 1) classes.one_comic.push(id);
      else classes.several_comics.push(id);
    }
  }

  const denominator = uniqueCatalogIds.length;
  const sum = Object.values(classes).reduce((n, list) => n + list.length, 0);

  /* ---------- 2. Сверка снимка с источником ---------- */
  const diff = {
    checked: facts ? Object.keys(facts).length : 0,
    edgesMissingInSnapshot: [],
    edgesExtraInSnapshot: [],
    relationChanged: [],
    comicMetadataDrift: [],
    snapshotComicsNotSeenInSource: [],
  };
  if (facts) {
    const sourceEdges = new Map();
    for (const [id, fact] of Object.entries(facts)) {
      if (fact.notFound) continue;
      for (const ce of fact.comicEdges ?? []) {
        sourceEdges.set(`${id}:${ce.comic}`, { anime: Number(id), ...ce });
      }
    }
    for (const [key, e] of sourceEdges) {
      if (!edgeByKey.has(key)) diff.edgesMissingInSnapshot.push({ key, relation: e.relation, comic: e.comic, anime: e.anime });
      else if (edgeByKey.get(key).raw !== e.relation) {
        diff.relationChanged.push({ key, snapshot: edgeByKey.get(key).raw, source: e.relation });
      }
    }
    for (const [key, e] of edgeByKey) {
      if (!sourceEdges.has(key) && !(facts[e.anime]?.notFound || facts[e.anime] === undefined)) {
        diff.edgesExtraInSnapshot.push({ key, relation: e.raw, anime: e.anime, comic: e.comic });
      }
    }
    for (const ce of sourceEdges.values()) {
      const comic = comics.get(ce.comic);
      if (!comic) {
        diff.snapshotComicsNotSeenInSource.push({ comic: ce.comic, anime: ce.anime });
        continue;
      }
      const drift = [];
      if ((comic.mal ?? null) !== (ce.mal ?? null)) drift.push('mal');
      if ((comic.format ?? null) !== (ce.format ?? null)) drift.push('format');
      if ((comic.chapters ?? null) !== (ce.chapters ?? null)) drift.push('chapters');
      if ((comic.year ?? null) !== (ce.year ?? null)) drift.push('year');
      if (drift.length) diff.comicMetadataDrift.push({ comic: ce.comic, fields: drift, snapshot: { mal: comic.mal, format: comic.format, chapters: comic.chapters, year: comic.year }, source: { mal: ce.mal, format: ce.format, chapters: ce.chapters, year: ce.year } });
    }
    diff.edgesMissingInSnapshot.sort((a, b) => a.key.localeCompare(b.key));
    diff.edgesExtraInSnapshot.sort((a, b) => a.key.localeCompare(b.key));
  }

  /* ---------- 3. Структурные дефекты снимка ---------- */
  const structural = {
    duplicateEdges,
    edgesWithoutComic: [],
    danglingComicRefs: [],
    selfEdges: [],
    unknownRelationTypes: [],
    nonComicFormats: [],
    duplicateMal: [],
    duplicateTitles: [],
    comicsOwnedByAnimeInCatalog: [],
    adaptationAfterAnime: [],
    oneShotWithoutMal: 0,
  };
  const malSeen = new Map();
  const titleSeen = new Map();
  for (const e of graph.edges) {
    if (!comics.has(e.comic)) structural.edgesWithoutComic.push(`${e.anime}:${e.comic}`);
    if (e.anime === e.comic) structural.selfEdges.push(e.anime);
    if (!RELATION_TYPES.has(e.raw)) structural.unknownRelationTypes.push(`${e.anime}:${e.comic}:${e.raw}`);
    const comic = comics.get(e.comic);
    if (comic) {
      if (!COMIC_FORMATS.has(comic.format)) structural.nonComicFormats.push(comic.anilist);
      if (Number.isFinite(comic.mal)) {
        const list = malSeen.get(comic.mal) ?? [];
        list.push(comic.anilist);
        malSeen.set(comic.mal, list);
      }
    }
  }
  for (const c of graph.comics) {
    if (c.format === 'ONE_SHOT' && !Number.isFinite(c.mal)) structural.oneShotWithoutMal += 1;
    const norm = String(c.titleOriginal ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (norm) {
      const list = titleSeen.get(norm) ?? [];
      list.push(c.anilist);
      titleSeen.set(norm, list);
    }
  }
  for (const [mal, ids] of malSeen) if (new Set(ids).size > 1) structural.duplicateMal.push({ mal, comics: [...new Set(ids)] });
  for (const [title, ids] of titleSeen) if (new Set(ids).size > 1) structural.duplicateTitles.push({ title, comics: [...new Set(ids)] });
  const catalogIdSet = new Set(uniqueCatalogIds);
  for (const c of graph.comics) if (catalogIdSet.has(c.anilist)) structural.comicsOwnedByAnimeInCatalog.push(c.anilist);

  /* Временная аномалия: комикс-«первоисточник» начался позже аниме. */
  const animeYearById = new Map(catalog.map((t) => [t.anilistId, t.year ?? null]));
  for (const e of graph.edges) {
    if (e.raw !== 'ADAPTATION') continue;
    const ay = animeYearById.get(e.anime);
    const comic = comics.get(e.comic);
    if (!ay || !comic?.year) continue;
    if (comic.year > ay + 1) {
      structural.adaptationAfterAnime.push({ anime: e.anime, animeYear: ay, comic: e.comic, comicYear: comic.year, comicTitle: comic.titleOriginal, format: comic.format, chapters: comic.chapters ?? null });
    }
  }

  /* ---------- 4. Многоисточниковые аниме ---------- */
  const multiSourceIds = classes.several_comics.length
    ? classes.several_comics
    : [...perAnimeEdges.entries()].filter(([, list]) => new Set(list.map((e) => e.comic)).size > 1).map(([id]) => id);

  const animeSourceById = new Map(catalog.map((t) => [t.anilistId, (t.source ?? '').toString().toUpperCase()]));
  const COMIC_MEDIA = new Set(['MANGA', 'COMIC', 'DOUJINSHI']);

  const multiSource = multiSourceIds.map((animeId) => {
    const fact = facts?.[animeId];
    const rows = (fact ? fact.comicEdges.map((c) => ({ comic: c.comic, relation: c.relation, format: c.format, year: c.year, chapters: c.chapters, mal: c.mal, title: c.title }))
      : (perAnimeEdges.get(animeId) ?? []).map((e) => {
          const c = comics.get(e.comic) ?? {};
          return { comic: e.comic, relation: e.raw, format: c.format ?? null, year: c.year ?? null, chapters: c.chapters ?? null, mal: c.mal ?? null, title: c.titleOriginal ?? null };
        }));
    /* Первоисточник — это ADAPTATION с комиксом, вышедшим не позже аниме.
       Комикс, начавшийся на 2+ года позже, — адаптация самого аниме. */
    const animeYear = animeYearById.get(animeId) ?? fact?.startYear ?? null;
    const adaptationEdges = rows.filter((r) => r.relation === 'ADAPTATION');
    const sources = adaptationEdges.filter((r) => !(r.year && animeYear && r.year > animeYear + 1));
    const laterAdaptations = adaptationEdges.filter((r) => !sources.includes(r));
    const serialized = sources.filter((r) => r.format !== 'ONE_SHOT');
    const oneShots = sources.filter((r) => r.format === 'ONE_SHOT');
    const malDupes = new Set();
    const seenMal = new Set();
    for (const r of rows) {
      if (r.mal && seenMal.has(r.mal)) malDupes.add(r.mal);
      if (r.mal) seenMal.add(r.mal);
    }
    let verdict;
    let reason;
    /* Направление связи само по себе не бывает «подтверждённым» по одним годам:
       `multi_source_catalog` — каталог говорит, что аниме снято по манге;
       `multi_source_dated` — несколько произведений проходят фильтр по датам,
       но основание только косвенное. */
    const catalogManga = COMIC_MEDIA.has(animeSourceById.get(animeId) ?? '');
    const several = sources.length >= 2;
    if (several && serialized.length >= 2) {
      verdict = catalogManga ? 'multi_source_catalog' : 'multi_source_dated';
      reason = 'several_serialized_sources';
    } else if (several && serialized.length === 0) {
      verdict = catalogManga ? 'multi_source_catalog' : 'multi_source_dated';
      reason = 'anthology_of_one_shots';
    } else if (several) {
      verdict = catalogManga ? 'multi_source_catalog' : 'multi_source_dated';
      reason = 'one_serialized_plus_one_shots';
    } else if (serialized.length === 1 && oneShots.length >= 1) {
      verdict = 'single_source_plus_prototypes';
      reason = 'one_shot_is_prototype_or_side_story';
    } else if (sources.length === 0 && adaptationEdges.length >= 2) {
      verdict = 'comic_adapts_anime';
      reason = 'all_adaptation_edges_started_after_anime';
    } else if (sources.length <= 1) {
      verdict = 'single_source_after_date_filter';
      reason = 'other_adaptation_edges_are_later_comics';
    } else {
      verdict = 'needs_review';
      reason = 'unclassified';
    }
    /* В очередь ревью — только то, что нельзя подтвердить автоматически:
       дубли MAL и «первоисточники» того же года без числа глав (похоже на
       промо-мангу, выпущенную к аниме, а не на оригинал). */
    const issues = [];
    if (malDupes.size) issues.push('duplicate_mal_id');
    const promoLike = sources.filter(
      (r) => r.format !== 'ONE_SHOT' && r.chapters == null && animeYear && r.year != null && r.year >= animeYear,
    );
    if (promoLike.length) issues.push('source_same_year_without_chapters');
    if (issues.length && (verdict === 'multi_source_catalog' || verdict === 'multi_source_dated')) {
      verdict = 'multi_source_with_issues';
    }
    return {
      anime: animeId,
      startYear: animeYearById.get(animeId) ?? fact?.startYear ?? null,
      verdict,
      reason,
      catalogSource: animeSourceById.get(animeId) ?? null,
      issues,
      sources,
      laterAdaptations,
      otherEdges: rows.filter((r) => r.relation !== 'ADAPTATION'),
    };
  });

  const multiSummary = multiSource.reduce((acc, row) => {
    acc[row.verdict] = (acc[row.verdict] ?? 0) + 1;
    return acc;
  }, {});

  /* ---------- 5. Агрегаты по типам произведений ---------- */
  const relationTotals = { edges: graph.edges.length, byRelation: {}, byComicFormat: {}, byComicCountry: {} };
  for (const e of graph.edges) relationTotals.byRelation[e.raw] = (relationTotals.byRelation[e.raw] ?? 0) + 1;
  for (const c of graph.comics) {
    const f = c.format ?? 'UNKNOWN';
    relationTotals.byComicFormat[f] = (relationTotals.byComicFormat[f] ?? 0) + 1;
    const k = c.country ?? 'UNKNOWN';
    relationTotals.byComicCountry[k] = (relationTotals.byComicCountry[k] ?? 0) + 1;
  }

  const sourceTypeTotals = facts
    ? Object.values(facts).reduce((acc, f) => {
        for (const [k, v] of Object.entries(f.byFormat ?? {})) acc[k] = (acc[k] ?? 0) + v;
        return acc;
      }, {})
    : null;

  /* ---------- 6. Очередь проверки: явный учёт уникальных случаев ---------- */
  const multiSourceNeedsReview = multiSource.filter(
    (r) => r.verdict === 'needs_review' || r.verdict === 'multi_source_with_issues' || (r.issues ?? []).length,
  );
  const queueArrays = {
    /* Массивы разного уровня: первые два — случаи на уровне аниме, третий — рёбра. */
    multiSourceNeedsReview,
    comicAdaptsAnime: multiSource.filter((r) => r.verdict === 'comic_adapts_anime'),
    adaptationAfterAnime: structural.adaptationAfterAnime,
    duplicateMal: structural.duplicateMal,
  };
  const rowsPerArray = Object.fromEntries(Object.entries(queueArrays).map(([k, v]) => [k, v.length]));
  const rowsTotal = Object.values(rowsPerArray).reduce((n, v) => n + v, 0);
  /* Уникальность считается по аниме: в одном массиве оно может повторяться
     (несколько рёбер), а разные массивы часто описывают одно и то же аниме. */
  const animePerArray = Object.fromEntries(
    Object.entries(queueArrays).map(([k, v]) => [k, new Set(v.map((r) => r.anime)).size]),
  );
  const animeSets = Object.entries(queueArrays)
    .filter(([k]) => k !== 'duplicateMal')
    .map(([k, v]) => [k, new Set(v.map((r) => r.anime))]);
  const uniqueAnime = new Set(animeSets.flatMap(([, set]) => [...set]));
  const edgePairs = new Set(queueArrays.adaptationAfterAnime.map((r) => `${r.anime}|${r.comic}`));
  const overlaps = {};
  for (let i = 0; i < animeSets.length; i += 1) {
    for (let j = i + 1; j < animeSets.length; j += 1) {
      const [nameA, setA] = animeSets[i];
      const [nameB, setB] = animeSets[j];
      const shared = [...setA].filter((id) => setB.has(id));
      if (shared.length) overlaps[`${nameA}×${nameB}`] = shared;
    }
  }
  const queueCounts = {
    /* rowsTotal ≠ количество случаев: 85 рёбер относятся к 74 аниме. */
    rowsPerArray,
    rowsTotal,
    animePerArray,
    uniqueEdges: edgePairs.size,
    uniqueAnime: uniqueAnime.size,
    duplicateMalCases: queueArrays.duplicateMal.length,
    overlaps: Object.fromEntries(Object.entries(overlaps).map(([k, v]) => [k, v.length])),
    overlapAnime: overlaps,
    note:
      'Аниме может попадать в несколько массивов сразу, поэтому sum(rowsPerArray) ≠ uniqueAnime. ' +
      'adaptationAfterAnime — это рёбра (anime+comic), их больше, чем аниме.',
  };
  if (rowsTotal !== queueArrays.multiSourceNeedsReview.length + queueArrays.comicAdaptsAnime.length + queueArrays.adaptationAfterAnime.length + queueArrays.duplicateMal.length) {
    throw new Error('очередь ревью: арифметика массивов не сходится');
  }

  /* ---------- 7. Отчёт ---------- */
  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      catalog: path.relative(ROOT, CATALOG),
      graph: path.relative(ROOT, GRAPH),
      graphGeneratedAt: graph.meta?.generatedAt ?? null,
      graphBytes: existsSync(GRAPH) ? readFileSync(GRAPH).length : null,
      graphSha256: existsSync(GRAPH) ? sha256(readFileSync(GRAPH)) : null,
      verifiedAgainstApi: Boolean(facts),
    },
    catalog: {
      titles: catalog.length,
      uniqueAnimeIds: uniqueCatalogIds.length,
      duplicateAnimeIds: duplicatesInCatalog,
      denominator: denominator,
    },
    classification: {
      basis: facts ? 'anilist-relations' : 'snapshot-only',
      classes: Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, v.length])),
      sum,
      matchesDenominator: sum === denominator,
      /* Пояснение к знаменателю: 8033 записи каталога, из них N уникальных id. */
      note:
        'Категории взаимоисключающие: каждая запись каталога попадает ровно в одну. ' +
        'relations_without_comics = у аниме есть отношения, но ни одно не ведёт к комиксу (MANGA/ONE_SHOT).',
    },
    relations: {
      edges: relationTotals.edges,
      byRelation: relationTotals.byRelation,
      byComicFormat: relationTotals.byComicFormat,
      byComicCountry: relationTotals.byComicCountry,
      uniqueComics: graph.comics.length,
      animeWithComicEdges: new Set(graph.edges.map((e) => e.anime)).size,
      sourceEdges: graph.edges.filter((e) => e.raw === 'ADAPTATION').length,
      sourceComics: new Set(graph.edges.filter((e) => e.raw === 'ADAPTATION').map((e) => e.comic)).size,
      sourceTypeBreakdownFromApi: sourceTypeTotals,
    },
    graphDiff: diff,
    structural,
    multiSource: {
      total: multiSource.length,
      verdicts: multiSummary,
      cases: multiSource,
    },
    verification: {
      /* Сверка всего каталога: полный проход по всем уникальным id аниме. */
      performed: Boolean(facts),
      batches: facts ? Math.ceil(Object.keys(facts).length / BATCH) : 0,
      batchSize: BATCH,
      animeChecked: facts ? Object.keys(facts).length : 0,
      failedBatches: net.failedBatches.length,
      edgesMissingInSnapshot: diff.edgesMissingInSnapshot.length,
      edgesExtraInSnapshot: diff.edgesExtraInSnapshot.length,
      relationTypeChanged: diff.relationChanged.length,
      metadataDrift: diff.comicMetadataDrift.length,
      note:
        'Сверка идёт отдельным проходом (--fetch): все id каталога заново запрашиваются у AniList, ' +
        'после чего снимок сравнивается с источником. Счётчики HTTP этого прохода в отчёт не ' +
        'переносятся (они относятся к запуску), фиксируются только результат сверки и ошибки батчей.',
    },
    network: {
      requests: net.requests,
      retries: net.retries,
      rateLimited: net.rateLimited,
      failedBatches: net.failedBatches.length,
      failedIds: net.failedIds.length,
    },
    reviewQueue: {
      generatedAt: new Date().toISOString(),
      note: 'Случаи, которым нужна редакционная/техническая проверка. Связи не удалены — только помечены.',
      counts: queueCounts,
      multiSourceNeedsReview,
      comicAdaptsAnime: queueArrays.comicAdaptsAnime,
      adaptationAfterAnime: queueArrays.adaptationAfterAnime,
      duplicateMal: queueArrays.duplicateMal,
    },
  };

  /* Инварианты: аудит не имеет права выдавать несогласованные числа. */
  const problems = [];
  if (!report.classification.matchesDenominator) problems.push('сумма категорий ≠ знаменателю');
  if (diff.edgesMissingInSnapshot.length) problems.push(`в снимке нет ${diff.edgesMissingInSnapshot.length} рёбер из источника`);
  if (diff.edgesExtraInSnapshot.length) problems.push(`в снимке лишних рёбер: ${diff.edgesExtraInSnapshot.length}`);
  if (structural.duplicateEdges.length) problems.push(`дубли рёбер: ${structural.duplicateEdges.length}`);
  if (structural.danglingComicRefs.length) problems.push(`висячие ссылки: ${structural.danglingComicRefs.length}`);
  if (structural.unknownRelationTypes.length) problems.push(`неизвестные relationType: ${structural.unknownRelationTypes.length}`);
  if (structural.nonComicFormats.length) problems.push(`не-комиксы в comics[]: ${structural.nonComicFormats.length}`);
  if (net.failedBatches.length) problems.push(`батчей с ошибкой: ${net.failedBatches.length}`);
  report.integrity = { ok: problems.length === 0, problems };

  console.log('[b1d] классификация:', JSON.stringify(report.classification.classes), 'сумма', sum, '/', denominator);
  console.log('[b1d] рёбра:', relationTotals.edges, 'комиксов:', graph.comics.length, 'аниме с комиксами:', report.relations.animeWithComicEdges);
  if (facts) {
    console.log(
      `[b1d] сверка: пропало ${diff.edgesMissingInSnapshot.length}, лишних ${diff.edgesExtraInSnapshot.length}, ` +
        `смена типа ${diff.relationChanged.length}, дрейф метаданных ${diff.comicMetadataDrift.length}`,
    );
  }
  console.log('[b1d] многоисточниковых:', multiSource.length, JSON.stringify(multiSummary));
  console.log(
    '[b1d] очередь: строк', rowsTotal, '| уникальных аниме', uniqueAnime.size, '| рёбер (anime+comic)', edgePairs.size,
    '| по массивам', JSON.stringify(rowsPerArray),
  );
  console.log('[b1d] инварианты:', report.integrity.ok ? 'OK' : JSON.stringify(problems));

  if (DRY) {
    console.log('[b1d] --dry-run: файлы не записаны');
    return;
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(REVIEW, `${JSON.stringify(report.reviewQueue, null, 2)}\n`, 'utf8');
  console.log(`[b1d] записано: ${path.relative(ROOT, OUT)}, ${path.relative(ROOT, REVIEW)}`);
}

run().catch((err) => {
  console.error('[b1d] ошибка:', err.message);
  process.exitCode = 1;
});
