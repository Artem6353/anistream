#!/usr/bin/env node
/**
 * B1-C: снимок relation-графа «аниме → комикс» из публичного AniList GraphQL.
 *
 * Зачем: в lib/data/titles.json у связей есть только { id, type } и только для
 * аниме-форматов — по ним НЕЛЬЗЯ определить конкретную мангу (`source: MANGA` —
 * это тип первоисточника, а не идентификатор произведения). Поэтому граф
 * первоисточников снимается отдельным офлайн-проходом и коммитится как
 * preview-данные: рантайм ничего не запрашивает и не делает N+1.
 *
 * Запуск (только чтение, никаких записей в БД/Redis/Vercel):
 *   node scripts/aninova3-source-graph.mjs --ids=20        # точечная проверка
 *   node scripts/aninova3-source-graph.mjs --verify        # перепроверить готовый снимок
 *   node scripts/aninova3-source-graph.mjs --limit=200     # первые 200 аниме с источником
 *   node scripts/aninova3-source-graph.mjs                 # весь каталог (долго)
 *
 * Что пишется: lib/aninova3/comics/source-graph.json — только комиксы (MANGA/ONE_SHOT)
 * и рёбра relation; аниме-связи отбрасываются. Никаких глав и текстов.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CATALOG = path.join(ROOT, 'lib', 'data', 'titles.json');
const OUT = path.join(ROOT, 'lib', 'aninova3', 'comics', 'source-graph.json');
const API = 'https://graphql.anilist.co';
const UA = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'AniNova 3.0 B1-C source graph (aninova-catalog.vercel.app)' };

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const val = (name, dflt) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};

const VERIFY = flag('verify');
const DRY = flag('dry-run');
const LIMIT = Number(val('limit', VERIFY ? 0 : 0));
const IDS = String(val('ids', '')).split(',').map((s) => Number(s.trim())).filter(Boolean);
const BATCH = Math.max(1, Math.min(25, Number(val('batch', 25))));
const SLEEP_MS = Math.max(400, Number(val('sleep', 1200))); // лимит AniList ≈ 90 запросов/мин
const ONLY_WITH_SOURCE = !flag('all');

const MEDIA_FIELDS = `
  id
  idMal
  type
  format
  countryOfOrigin
  status
  startDate { year }
  chapters
  volumes
  coverImage { large }
  title { romaji native english }
  staff(perPage: 3, sort: RELEVANCE) { edges { role node { name { full } } } }
`;

const ANIME_QUERY = `query ($ids: [Int]) {
  Page(page: 1, perPage: ${BATCH}) {
    media(id_in: $ids, type: ANIME) {
      id
      relations { edges { relationType node {${MEDIA_FIELDS}} } }
    }
  }
}`;

/** Комікс ли формат: аниме-адаптации в граф первоисточников не попадают. */
const isComicFormat = (format) => format === 'MANGA' || format === 'ONE_SHOT';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function anilist(query, variables) {
  const res = await fetch(API, { method: 'POST', headers: UA, body: JSON.stringify({ query, variables }) });
  if (!res.ok) throw new Error(`AniList ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`AniList GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  return json.data;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function authorNames(node) {
  const edges = node.staff?.edges ?? [];
  return [...new Set(edges.map((e) => e?.node?.name?.full).filter(Boolean))].slice(0, 3);
}

function comicRecord(node) {
  return {
    anilist: node.id,
    ...(node.idMal ? { mal: node.idMal } : {}),
    format: node.format ?? undefined,
    country: node.countryOfOrigin ?? null,
    titleOriginal: node.title?.romaji || node.title?.native || node.title?.english || `AniList ${node.id}`,
    titleNative: node.title?.native ?? null,
    year: node.startDate?.year ?? null,
    status: node.status ?? null,
    chapters: node.chapters ?? null,
    volumes: node.volumes ?? null,
    cover: node.coverImage?.large ?? null,
    authors: authorNames(node),
  };
}

async function main() {
  const catalog = readJson(CATALOG, []);
  if (!Array.isArray(catalog) || !catalog.length) throw new Error('Каталог titles.json не найден или пуст');
  const existing = readJson(OUT, { meta: {}, comics: [], edges: [] });

  let animeIds;
  if (IDS.length) {
    animeIds = IDS;
  } else if (VERIFY) {
    animeIds = [...new Set((existing.edges ?? []).map((e) => e.anime))];
  } else {
    const pool = catalog
      .filter((t) => Number.isFinite(t.anilistId))
      .filter((t) => (ONLY_WITH_SOURCE ? Boolean(t.source) : true))
      .sort((a, b) => (b.favourites ?? 0) - (a.favourites ?? 0))
      .map((t) => t.anilistId);
    animeIds = LIMIT > 0 ? pool.slice(0, LIMIT) : pool;
  }
  animeIds = [...new Set(animeIds)];
  console.log(`[b1c] аниме к запросу: ${animeIds.length}, батч ${BATCH}, verify=${VERIFY}`);

  const comics = new Map((existing.comics ?? []).map((c) => [c.anilist, c]));
  const edges = new Map((existing.edges ?? []).map((e) => [`${e.anime}:${e.comic}`, e]));
  let requests = 0;
  let skippedNonComic = 0;
  let skippedNoRelations = 0;

  for (let i = 0; i < animeIds.length; i += BATCH) {
    const chunk = animeIds.slice(i, i + BATCH);
    const data = await anilist(ANIME_QUERY, { ids: chunk });
    requests += 1;
    const media = data?.Page?.media ?? [];
    for (const anime of media) {
      const rel = anime.relations?.edges ?? [];
      if (!rel.length) {
        skippedNoRelations += 1;
        continue;
      }
      for (const edge of rel) {
        const node = edge?.node;
        if (!node || !isComicFormat(node.format)) {
          skippedNonComic += 1;
          continue;
        }
        comics.set(node.id, { ...(comics.get(node.id) ?? {}), ...comicRecord(node) });
        const key = `${anime.id}:${node.id}`;
        edges.set(key, {
          anime: anime.id,
          comic: node.id,
          raw: edge.relationType,
          observedAt: new Date().toISOString().slice(0, 10),
        });
      }
    }
    const done = Math.min(i + BATCH, animeIds.length);
    if (done % 100 === 0 || done === animeIds.length) console.log(`[b1c] ${done}/${animeIds.length} · рёбер ${edges.size}`);
    if (done < animeIds.length) await sleep(SLEEP_MS);
  }

  const payload = {
    meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      generator: 'scripts/aninova3-source-graph.mjs',
      api: API,
      animeQueried: animeIds.length,
      requests,
      edgesKept: edges.size,
      comicsKept: comics.size,
      skippedNonComic,
      skippedNoRelations,
      note:
        'Снимок публичного relation-графа AniList. Хранятся только комиксы (MANGA/ONE_SHOT) и рёбра relation; ' +
        'аниме-связи отброшены. Глав, страниц и текстов здесь нет — публикационные флаги ведутся в source-data.ts.',
    },
    comics: [...comics.values()].sort((a, b) => a.anilist - b.anilist),
    edges: [...edges.values()].sort((a, b) => a.anime - b.anime || a.comic - b.comic),
  };

  console.log(
    `[b1c] итог: рёбер ${payload.edges.length}, комиксов ${payload.comics.length}, ` +
      `отброшено не-комиксов ${skippedNonComic}, без связей ${skippedNoRelations}`,
  );
  if (DRY) {
    console.log('[b1c] --dry-run: файл не записан');
    return;
  }
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[b1c] записано: ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error('[b1c] ошибка:', err.message);
  process.exitCode = 1;
});
