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
 * Два прохода (так проще уложиться в лимит сложности AniList):
 *   1) relations без staff — пачками по --batch (дефолт 25) ID аниме;
 *   2) staff (авторы) только для собранных комиксов — тоже пачками.
 *
 * Запуск (только чтение; в БД/Redis/Vercel ничего не пишется):
 *   node scripts/aninova3-source-graph.mjs --ids=20,21 --dry-run
 *   node scripts/aninova3-source-graph.mjs --verify --dry-run
 *   node scripts/aninova3-source-graph.mjs --all --limit=500
 *   node scripts/aninova3-source-graph.mjs --all            # весь каталог
 *
 * Что пишется: lib/aninova3/comics/source-graph.json — только комиксы
 * (MANGA/ONE_SHOT) и рёбра relation. Глав, страниц и текстов здесь нет.
 * Перед заменой снимка делается резервная копия в .cache/b1c/; запись атомарная
 * (temp + rename), при сбое батча старый снимок остаётся целым.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CATALOG = path.join(ROOT, 'lib', 'data', 'titles.json');
const OUT = path.join(ROOT, 'lib', 'aninova3', 'comics', 'source-graph.json');
const CACHE = path.join(ROOT, '.cache', 'b1c');
const LAST_RUN = path.join(CACHE, 'last-run.json');
const API = 'https://graphql.anilist.co';
const UA = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': 'AniNova 3.0 B1-C source graph (aninova-catalog.vercel.app)',
};

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
const ALL = flag('all');
const LIMIT = Number(val('limit', 0));
const IDS = String(val('ids', '')).split(',').map((s) => Number(s.trim())).filter(Boolean);
const BATCH = Math.max(1, Math.min(50, Number(val('batch', 25))));
const SLEEP_MS = Math.max(700, Number(val('sleep', 1200))); // лимит AniList ≈ 90 запросов/мин
const TIMEOUT_MS = Math.max(5_000, Number(val('timeout', 25_000)));
const RETRIES = Math.max(1, Number(val('retries', 5)));
const STAFF_BATCH = Math.max(1, Math.min(50, Number(val('staff-batch', 50))));

const COMIC_FORMATS = new Set(['MANGA', 'ONE_SHOT']);

const COMIC_NODE_FIELDS = `
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
`;

const ANIME_QUERY = `query ($ids: [Int]) {
  Page(page: 1, perPage: ${BATCH}) {
    pageInfo { currentPage hasNextPage }
    media(id_in: $ids, type: ANIME) {
      id
      relations { edges { relationType node {${COMIC_NODE_FIELDS}} } }
    }
  }
}`;

const STAFF_QUERY = `query ($ids: [Int]) {
  Page(page: 1, perPage: ${STAFF_BATCH}) {
    media(id_in: $ids, type: MANGA) {
      id
      staff(perPage: 3, sort: RELEVANCE) { edges { role node { name { full } } } }
    }
  }
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stats = {
  requests: 0,
  retries: 0,
  rateLimited: 0,
  failedBatches: [],
  requestedIds: 0,
  receivedAnime: 0,
  missingAnimeIds: [],
  edges: 0,
  skippedNonComic: {},
  skippedNoRelations: 0,
  staffRequests: 0,
  staffFailed: 0,
};

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function backupCurrentSnapshot(reason) {
  if (!existsSync(OUT)) return null;
  mkdirSync(CACHE, { recursive: true });
  const buf = readFileSync(OUT);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(CACHE, `source-graph.backup-${stamp}.json`);
  writeFileSync(file, buf);
  const info = {
    file: path.relative(ROOT, file),
    reason,
    createdAt: new Date().toISOString(),
    bytes: buf.length,
    sha256: sha256(buf),
  };
  writeFileSync(`${file}.sha256`, `${info.sha256}  ${path.basename(file)}\n`, 'utf8');
  return info;
}

/** Один GraphQL-запрос с таймаутом, повторами, backoff и поддержкой Retry-After. */
async function anilist(query, variables, label) {
  let attempt = 0;
  let backoff = 2_000;
  for (;;) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      stats.requests += 1;
      const res = await fetch(API, {
        method: 'POST',
        headers: UA,
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (res.status === 429) {
        stats.rateLimited += 1;
        const retryAfter = Number(res.headers.get('retry-after') ?? 0);
        const waitMs = Math.max(retryAfter > 0 ? retryAfter * 1000 : 0, backoff);
        if (attempt >= RETRIES) throw new Error(`429 после ${attempt} попыток (${label})`);
        stats.retries += 1;
        console.warn(`[b1c] 429 ${label}: ждём ${Math.round(waitMs / 1000)} c`);
        await sleep(waitMs);
        backoff = Math.min(backoff * 2, 60_000);
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= RETRIES) throw new Error(`${res.status} после ${attempt} попыток (${label})`);
        stats.retries += 1;
        console.warn(`[b1c] ${res.status} ${label}: повтор через ${Math.round(backoff / 1000)} c`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 60_000);
        continue;
      }
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw new Error(`HTTP ${res.status} ${label}: ${body}`);
      }
      const json = await res.json();
      if (json.errors?.length) {
        const message = json.errors.map((e) => e.message).join('; ');
        /* AniList отдаёт лимиты и в теле ответа: повторяем только их. */
        const retryable = /rate.?limit|too many requests|temporar/i.test(message);
        if (retryable && attempt < RETRIES) {
          stats.retries += 1;
          console.warn(`[b1c] GraphQL ${label}: повтор через ${Math.round(backoff / 1000)} c (${message})`);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 60_000);
          continue;
        }
        throw new Error(`GraphQL ${label}: ${message}`);
      }
      return json.data;
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      if (attempt >= RETRIES) throw new Error(`${aborted ? 'таймаут' : err.message} (${label}, ${attempt} попыток)`);
      stats.retries += 1;
      console.warn(`[b1c] ${aborted ? 'таймаут' : err.message} ${label}: повтор через ${Math.round(backoff / 1000)} c`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60_000);
    } finally {
      clearTimeout(timer);
    }
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
    authors: [],
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
      .filter((t) => (ALL ? true : Boolean(t.source)))
      .sort((a, b) => (b.favourites ?? 0) - (a.favourites ?? 0))
      .map((t) => t.anilistId);
    animeIds = LIMIT > 0 ? pool.slice(0, LIMIT) : pool;
  }
  animeIds = [...new Set(animeIds)];
  stats.requestedIds = animeIds.length;
  console.log(
    `[b1c] аниме: ${animeIds.length}, батч ${BATCH}, sleep ${SLEEP_MS} мс, режим ${IDS.length ? 'ids' : VERIFY ? 'verify' : ALL ? 'all' : 'source-only'}`,
  );

  const comics = new Map((existing.comics ?? []).map((c) => [c.anilist, c]));
  const edges = VERIFY ? new Map() : new Map((existing.edges ?? []).map((e) => [`${e.anime}:${e.comic}`, e]));
  const received = new Set();

  for (let i = 0; i < animeIds.length; i += BATCH) {
    const chunk = animeIds.slice(i, i + BATCH);
    const label = `${i + 1}-${i + chunk.length}`;
    let data;
    try {
      data = await anilist(ANIME_QUERY, { ids: chunk }, `relations ${label}`);
    } catch (err) {
      /* Не пропускаем пакет молча: фиксируем и продолжаем, чтобы проход не падал целиком. */
      stats.failedBatches.push({ label, ids: chunk, error: err.message });
      console.error(`[b1c] батч ${label} не получен: ${err.message}`);
      if (i + BATCH < animeIds.length) await sleep(SLEEP_MS);
      continue;
    }
    for (const anime of data?.Page?.media ?? []) {
      received.add(anime.id);
      const rel = anime.relations?.edges ?? [];
      if (!rel.length) {
        stats.skippedNoRelations += 1;
        continue;
      }
      for (const edge of rel) {
        const node = edge?.node;
        const type = String(node?.type ?? 'UNKNOWN');
        const format = String(node?.format ?? 'null');
        if (!node || !COMIC_FORMATS.has(format)) {
          /* Счётчик ведём по паре тип/формат: так видно, что отброшены именно
             NOVEL/аниме-форматы, а не комиксы. */
          const key = `${type}/${format}`;
          stats.skippedNonComic[key] = (stats.skippedNonComic[key] ?? 0) + 1;
          continue;
        }
        const prev = comics.get(node.id);
        comics.set(node.id, { ...(prev ?? {}), ...comicRecord(node) });
        const key = `${anime.id}:${node.id}`;
        edges.set(key, {
          anime: anime.id,
          comic: node.id,
          raw: edge.relationType,
          observedAt: new Date().toISOString().slice(0, 10),
        });
        stats.edges += 1;
      }
    }
    const done = Math.min(i + BATCH, animeIds.length);
    if (done % 250 === 0 || done === animeIds.length) {
      console.log(`[b1c] ${done}/${animeIds.length} · рёбер ${edges.size} · комиксов ${comics.size}`);
    }
    if (done < animeIds.length) await sleep(SLEEP_MS);
  }

  stats.receivedAnime = received.size;
  stats.missingAnimeIds = animeIds.filter((id) => !received.has(id));

  /* Проход 2: авторы только для собранных комиксов (отдельный, более дешёвый запрос). */
  const needAuthors = [...comics.values()].filter((c) => !(c.authors ?? []).length).map((c) => c.anilist);
  for (let i = 0; i < needAuthors.length; i += STAFF_BATCH) {
    const chunk = needAuthors.slice(i, i + STAFF_BATCH);
    try {
      stats.staffRequests += 1;
      const data = await anilist(STAFF_QUERY, { ids: chunk }, `staff ${i + 1}-${i + chunk.length}`);
      for (const media of data?.Page?.media ?? []) {
        const comic = comics.get(media.id);
        if (!comic) continue;
        const authors = authorNames(media);
        if (authors.length) comic.authors = authors;
      }
    } catch (err) {
      stats.staffFailed += 1;
      console.warn(`[b1c] авторы ${i + 1}-${i + chunk.length}: ${err.message}`);
    }
    if (i + STAFF_BATCH < needAuthors.length) await sleep(SLEEP_MS);
  }

  const edgeList = [...edges.values()].sort((a, b) => a.anime - b.anime || a.comic - b.comic);
  const comicList = [...comics.values()].sort((a, b) => a.anilist - b.anilist);
  const payload = {
    meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      generator: 'scripts/aninova3-source-graph.mjs',
      api: API,
      mode: IDS.length ? 'ids' : VERIFY ? 'verify' : ALL ? 'all' : 'source-only',
      params: { batch: BATCH, sleepMs: SLEEP_MS, staffBatch: STAFF_BATCH, timeoutMs: TIMEOUT_MS, retries: RETRIES },
      animeRequested: animeIds.length,
      animeReceived: stats.receivedAnime,
      animeMissing: stats.missingAnimeIds.length,
      requests: stats.requests,
      retries: stats.retries,
      rateLimited: stats.rateLimited,
      failedBatches: stats.failedBatches.length,
      edgesKept: edgeList.length,
      uniqueAnimeWithEdges: new Set(edgeList.map((e) => e.anime)).size,
      comicsKept: comicList.length,
      comicsWithMal: comicList.filter((c) => Number.isFinite(c.mal)).length,
      comicsWithAuthors: comicList.filter((c) => (c.authors?.length ?? 0) > 0).length,
      /* Разбивка по форматам нужна отчёту: манга/ваншот считаются отдельно. */
      comicsByFormat: comicList.reduce((acc, c) => {
        const key = c.format ?? 'UNKNOWN';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
      comicsByCountry: comicList.reduce((acc, c) => {
        const key = c.country ?? 'UNKNOWN';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
      skippedNoRelations: stats.skippedNoRelations,
      skippedNonComicByType: stats.skippedNonComic,
      /* Единый блок «что пропущено и почему» по требованию отчёта. */
      skipped: {
        animeWithoutRelations: stats.skippedNoRelations,
        nonComicNodesByType: stats.skippedNonComic,
        sourceMissingOnAniList: stats.missingAnimeIds.length,
      },
      missingAnimeIds: stats.missingAnimeIds.slice(0, 50),
      note:
        'Снимок публичного relation-графа AniList. Хранятся только комиксы (MANGA/ONE_SHOT) и рёбра relation; ' +
        'аниме-связи отброшены. Глав, страниц и текстов здесь нет — публикационные флаги ведутся в source-data.ts.',
    },
    comics: comicList,
    edges: edgeList,
  };

  mkdirSync(CACHE, { recursive: true });
  writeFileSync(
    LAST_RUN,
    `${JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        mode: payload.meta.mode,
        params: payload.meta.params,
        requested: animeIds.length,
        received: stats.receivedAnime,
        missing: stats.missingAnimeIds.slice(0, 200),
        failedBatches: stats.failedBatches,
        requests: stats.requests,
        retries: stats.retries,
        rateLimited: stats.rateLimited,
        staffRequests: stats.staffRequests,
        staffFailed: stats.staffFailed,
        edges: edgeList.length,
        comics: comicList.length,
        skippedNonComicByType: stats.skippedNonComic,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(
    `[b1c] итог: аниме получено ${stats.receivedAnime}/${animeIds.length}, рёбер ${edgeList.length}, ` +
      `комиксов ${comicList.length}, запросов ${stats.requests}, повторов ${stats.retries}, ` +
      `батчей с ошибкой ${stats.failedBatches.length}, исключено не-комиксов ${JSON.stringify(stats.skippedNonComic)}`,
  );

  if (VERIFY) {
    /* Режим проверки не меняет снимок: только отчёт в консоль и .cache. */
    console.log('[b1c] --verify: снимок не перезаписывается');
    return;
  }
  if (DRY) {
    console.log('[b1c] --dry-run: файл не записан');
    return;
  }
  if (stats.failedBatches.length) {
    console.error('[b1c] есть недоставленные батчи — снимок НЕ обновлён, повторите проход');
    writeFileSync(path.join(CACHE, 'partial-graph.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    process.exitCode = 1;
    return;
  }

  const backup = backupCurrentSnapshot('before-full-graph-update');
  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameSync(tmp, OUT);
  const bytes = statSync(OUT).size;
  writeFileSync(
    path.join(CACHE, 'snapshot.json'),
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        file: path.relative(ROOT, OUT),
        bytes,
        sha256: sha256(readFileSync(OUT)),
        backup,
        meta: payload.meta,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`[b1c] записано: ${path.relative(ROOT, OUT)} (${(bytes / 1024).toFixed(1)} КБ)`);
  if (backup) console.log(`[b1c] резервная копия: ${backup.file} (${backup.sha256.slice(0, 12)}…)`);
}

main().catch((err) => {
  console.error('[b1c] ошибка:', err.message);
  process.exitCode = 1;
});
