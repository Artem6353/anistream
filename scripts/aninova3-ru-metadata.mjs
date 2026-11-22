#!/usr/bin/env node
/**
 * B1-C: кандидаты русских метаданных для произведения-комикса.
 *
 * Источник — публичный Shikimori API по MAL id манги. Связь произведения берётся
 * ТОЛЬКО из снимка relation-графа (AniList): поиск по названию здесь не создаёт
 * связей, он используется лишь как проверка совпадения (sanity check).
 *
 * Что важно:
 * 1. Никакие данные не объявляются проверенными. Результат — CANDIDATE:
 *    русское название и метаданные хранятся с provenance и очередью на ревью.
 * 2. Права на публикацию здесь НЕ определяются вообще.
 * 3. Публичный UI показывает русское название только после редакционной
 *    проверки (lib/aninova3/comics/source-data.ts / editorial.json).
 *
 * Запуск:
 *   node scripts/aninova3-ru-metadata.mjs --limit=20 --dry-run
 *   node scripts/aninova3-ru-metadata.mjs                  # все SOURCE-комиксы
 *   node scripts/aninova3-ru-metadata.mjs --scope=all     # все комиксы графа
 *
 * Пишет: lib/aninova3/comics/metadata-candidates.json (рантайм, внутреннее),
 * docs/data/aninova3-b1c-metadata-candidates.json (полный отчёт),
 * docs/data/aninova3-b1c-manual-review.json (очередь ревью).
 * Прогресс — .cache/b1c/ru-metadata-progress.json (возобновляемо).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GRAPH = path.join(ROOT, 'lib', 'aninova3', 'comics', 'source-graph.json');
const OUT_RUNTIME = path.join(ROOT, 'lib', 'aninova3', 'comics', 'metadata-candidates.json');
const OUT_REPORT = path.join(ROOT, 'docs', 'data', 'aninova3-b1c-metadata-candidates.json');
const OUT_REVIEW = path.join(ROOT, 'docs', 'data', 'aninova3-b1c-manual-review.json');
const CACHE = path.join(ROOT, '.cache', 'b1c');
const PROGRESS = path.join(CACHE, 'ru-metadata-progress.json');
const API = 'https://shikimori.one/api/mangas';
const UA = { 'User-Agent': 'AniNova/3.0 B1-C (aninova-catalog.vercel.app)', Accept: 'application/json' };

const args = process.argv.slice(2);
const val = (name, dflt) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

const SCOPE = String(val('scope', 'source'));
const LIMIT = Number(val('limit', 0));
const SLEEP_MS = Math.max(200, Number(val('sleep', 400)));
const RETRIES = Math.max(1, Number(val('retries', 4)));
const DRY = flag('dry-run');
const REFRESH = flag('refresh');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

/** Относительные пути Shikimori (`/system/mangas/...`) превращаем в полные URL. */
function absoluteUrl(url) {
  if (!url) return null;
  const text = String(url).trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://shikimori.one${text.startsWith('/') ? '' : '/'}${text}`;
}

/** Грубая нормализация для sanity-check: латиница/цифры, без пунктуации. */
function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яё\u3040-\u30ff\u4e00-\u9fff]+/gi, ' ')
    .trim();
}

function tokens(text) {
  return new Set(norm(text).split(/\s+/).filter((t) => t.length > 1));
}

/** Совпадение названия: не доказательство связи, только защита от чужого id. */
function titleMatches(shikiName, comic) {
  const a = tokens(shikiName);
  if (!a.size) return false;
  const variants = [comic.titleOriginal, comic.titleNative, comic.titleEnglish].filter(Boolean).map(tokens);
  return variants.some((b) => {
    if (!b.size) return false;
    let shared = 0;
    for (const t of a) if (b.has(t)) shared += 1;
    return shared / Math.min(a.size, b.size) >= 0.5;
  });
}

async function fetchShikimori(malId) {
  let attempt = 0;
  let backoff = 1_500;
  for (;;) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(`${API}/${malId}`, { headers: UA, signal: controller.signal });
      if (res.status === 429) {
        if (attempt >= RETRIES) return { error: '429' };
        const retryAfter = Number(res.headers.get('retry-after') ?? 0);
        await sleep(Math.max(retryAfter * 1000, backoff));
        backoff = Math.min(backoff * 2, 30_000);
        continue;
      }
      if (res.status === 404) return { missing: true };
      if (res.status >= 500) {
        if (attempt >= RETRIES) return { error: `HTTP ${res.status}` };
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30_000);
        continue;
      }
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return { data: await res.json() };
    } catch (err) {
      const name = err?.name === 'AbortError' ? 'таймаут' : err.message;
      if (attempt >= RETRIES) return { error: name };
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    } finally {
      clearTimeout(timer);
    }
  }
}

const KIND_RU = { manga: 'manga', manhwa: 'manhwa', manhua: 'manhua', one_shot: 'comic', doujin: 'comic' };

function buildCandidates(graph) {
  const comics = new Map(graph.comics.map((c) => [c.anilist, c]));
  const byComic = new Map();
  for (const edge of graph.edges) {
    const row = byComic.get(edge.comic) ?? { roles: new Set(), animeCount: 0, sourceEdges: 0 };
    row.roles.add(edge.raw);
    row.animeCount += 1;
    if (edge.raw === 'ADAPTATION') row.sourceEdges += 1;
    byComic.set(edge.comic, row);
  }
  const rows = [];
  for (const [anilist, row] of byComic) {
    const comic = comics.get(anilist);
    if (!comic) continue;
    const isSource = row.sourceEdges > 0;
    if (SCOPE === 'source' && !isSource) continue;
    rows.push({ comic, isSource, animeCount: row.animeCount });
  }
  /* Сначала первоисточники, затем по числу аниме: очередь ревью должна начинаться
     с того, что реально влияет на страницы аниме. */
  rows.sort((a, b) => Number(b.isSource) - Number(a.isSource) || b.animeCount - a.animeCount || a.comic.anilist - b.comic.anilist);
  return LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
}

async function main() {
  const graph = readJson(GRAPH, null);
  if (!graph?.comics?.length) throw new Error('source-graph.json не найден или пуст — сначала npm run graph:b1c');
  mkdirSync(CACHE, { recursive: true });
  const progress = REFRESH ? {} : readJson(PROGRESS, {});
  const rows = buildCandidates(graph);
  console.log(`[b1c] кандидаты: ${rows.length} произведений (scope=${SCOPE}), уже в кэше ${Object.keys(progress).length}`);

  let done = 0;
  let requests = 0;
  for (const row of rows) {
    const mal = row.comic.mal;
    const key = String(row.comic.anilist);
    if (!mal) {
      progress[key] = { anilist: row.comic.anilist, status: 'NO_MAL_ID', fetchedAt: new Date().toISOString() };
      continue;
    }
    if (progress[key] && progress[key].status !== 'ERROR') continue;
    const result = await fetchShikimori(mal);
    requests += 1;
    if (result.missing) {
      progress[key] = { anilist: row.comic.anilist, mal, status: 'NOT_FOUND', fetchedAt: new Date().toISOString() };
    } else if (result.error) {
      progress[key] = { anilist: row.comic.anilist, mal, status: 'ERROR', error: result.error, fetchedAt: new Date().toISOString() };
    } else {
      const d = result.data;
      const idMatches = Number(d.id) === Number(mal);
      /* Дополнительная защита: Shikimori сам сообщает MAL id — он обязан совпасть. */
      const malOk = !d.myanimelist_id || Number(d.myanimelist_id) === Number(mal);
      const nameOk = titleMatches(d.name, row.comic);
      const hasRu = Boolean(String(d.russian ?? '').trim());
      /* Кандидат без русского названия — не кандидат: показывать нечего. */
      const status = !idMatches || !malOk
        ? 'ID_MISMATCH'
        : !hasRu
          ? 'NO_RU_TITLE'
          : nameOk
            ? 'CANDIDATE'
            : 'NAME_MISMATCH';
      progress[key] = {
        anilist: row.comic.anilist,
        mal,
        shikimoriId: d.id,
        myanimelistId: d.myanimelist_id ?? null,
        status,
        name: d.name ?? null,
        titleRu: d.russian ?? null,
        /* Официальное название русской лицензии — внутреннее свидетельство, не публичный текст. */
        licenseNameRu: String(d.license_name_ru ?? '').trim() || null,
        licensors: Array.isArray(d.licensors)
          ? d.licensors.map((l) => (typeof l === 'string' ? l : (l?.name ?? null))).filter(Boolean)
          : [],
        publishers: Array.isArray(d.publishers)
          ? d.publishers.map((l) => (typeof l === 'string' ? l : (l?.name ?? null))).filter(Boolean)
          : [],
        genres: Array.isArray(d.genres)
          ? d.genres.map((g) => (typeof g === 'string' ? g : (g?.russian ?? g?.name ?? null))).filter(Boolean)
          : [],
        japanese: d.japanese ?? null,
        english: d.english ?? null,
        kind: KIND_RU[d.kind] ?? d.kind ?? null,
        shikimoriStatus: d.status ?? null,
        year: d.aired_on ? Number(String(d.aired_on).slice(0, 4)) : null,
        volumes: d.volumes ?? null,
        chapters: d.chapters ?? null,
        /* Shikimori отдаёт относительный путь: без домена ссылка битая. */
        cover: absoluteUrl(d.image?.original ?? d.image?.preview ?? null),
        score: d.score ?? null,
        url: d.url ? `https://shikimori.one${d.url}` : null,
        descriptionRu: d.description ? String(d.description).replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 600) : null,
        fetchedAt: new Date().toISOString(),
      };
    }
    done += 1;
    if (done % 50 === 0) {
      writeFileSync(PROGRESS, `${JSON.stringify(progress, null, 0)}\n`, 'utf8');
      console.log(`[b1c] ${done} запросов · последняя ${key} · ${progress[key]?.status}`);
    }
    await sleep(SLEEP_MS);
  }

  const candidates = rows
    .map((row) => {
      const p = progress[String(row.comic.anilist)];
      return p ? { ...p, priority: row.isSource ? 'SOURCE' : 'RELATED', animeCount: row.animeCount, titleOriginal: row.comic.titleOriginal, kindGraph: row.comic.kind ?? null } : null;
    })
    .filter(Boolean);
  const stats = {
    generatedAt: new Date().toISOString(),
    source: 'shikimori.one (публичный API, MAL id)',
    scope: SCOPE,
    total: candidates.length,
    candidate: candidates.filter((c) => c.status === 'CANDIDATE').length,
    noRuTitle: candidates.filter((c) => c.status === 'NO_RU_TITLE').length,
    withRuLicenseName: candidates.filter((c) => c.status === 'CANDIDATE' && c.licenseNameRu).length,
    withRuDescription: candidates.filter((c) => c.status === 'CANDIDATE' && c.descriptionRu).length,
    withCover: candidates.filter((c) => c.status === 'CANDIDATE' && c.cover).length,
    notFound: candidates.filter((c) => c.status === 'NOT_FOUND').length,
    noMalId: candidates.filter((c) => c.status === 'NO_MAL_ID').length,
    nameMismatch: candidates.filter((c) => c.status === 'NAME_MISMATCH').length,
    idMismatch: candidates.filter((c) => c.status === 'ID_MISMATCH').length,
    error: candidates.filter((c) => c.status === 'ERROR').length,
    requests,
    note:
      'CANDIDATE ≠ проверено. Русское название из Shikimori — кандидат до редакционной сверки; ' +
      'права на публикацию здесь не определяются.',
  };

  const runtime = {
    meta: {
      generatedAt: stats.generatedAt,
      source: stats.source,
      note: stats.note,
      counts: { total: stats.total, candidate: stats.candidate, notFound: stats.notFound, mismatch: stats.nameMismatch + stats.idMismatch },
    },
    /* В рантайм попадают только id-совпадения: источник для внутреннего отчёта и
       будущей редакционной сверки. Публично кандидат не показывается. */
    candidates: candidates
      .filter((c) => c.status === 'CANDIDATE')
      .map((c) => ({
        anilist: c.anilist,
        mal: c.mal,
        titleRu: c.titleRu,
        name: c.name,
        licenseNameRu: c.licenseNameRu,
        kind: c.kind,
        year: c.year,
        cover: c.cover,
        sourceUrl: c.url,
        fetchedAt: c.fetchedAt,
        verification: 'CANDIDATE',
      })),
  };

  const review = {
    generatedAt: stats.generatedAt,
    note:
      'Очередь редакционной проверки: сначала SOURCE-произведения с наибольшим числом аниме-связей. ' +
      'Полный список кандидатов — в aninova3-b1c-metadata-candidates.json; здесь только то, ' +
      'что требует рук и первая тысяча очереди.',
    counts: {
      candidate: stats.candidate,
      notFound: stats.notFound,
      noMalId: stats.noMalId,
      nameMismatch: stats.nameMismatch,
      idMismatch: stats.idMismatch,
      error: stats.error,
    },
    needsReview: candidates
      .filter((c) => c.status === 'CANDIDATE')
      .slice(0, 1000)
      .map((c) => [c.anilist, c.mal, c.priority, c.animeCount, c.titleRu, c.url]),
    needsReviewColumns: ['anilist', 'mal', 'priority', 'animeCount', 'candidateTitleRu', 'sourceUrl'],
    problems: candidates
      .filter((c) => ['NOT_FOUND', 'NO_MAL_ID', 'NO_RU_TITLE', 'NAME_MISMATCH', 'ID_MISMATCH', 'ERROR'].includes(c.status))
      .map((c) => [c.anilist, c.mal ?? null, c.status, c.titleOriginal, c.error ?? null]),
    problemsColumns: ['anilist', 'mal', 'status', 'titleOriginal', 'error'],
  };

  console.log(`[b1c] готово: ${JSON.stringify(stats)}`);
  if (DRY) {
    console.log('[b1c] --dry-run: файлы не записаны');
    return;
  }
  writeFileSync(PROGRESS, `${JSON.stringify(progress, null, 0)}\n`, 'utf8');
  writeFileSync(OUT_RUNTIME, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');
  mkdirSync(path.dirname(OUT_REPORT), { recursive: true });
  writeFileSync(OUT_REPORT, `${JSON.stringify({ ...stats, candidates }, null, 2)}\n`, 'utf8');
  writeFileSync(OUT_REVIEW, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  console.log(`[b1c] записано: ${path.relative(ROOT, OUT_RUNTIME)}, ${path.relative(ROOT, OUT_REPORT)}, ${path.relative(ROOT, OUT_REVIEW)}`);
}

main().catch((err) => {
  console.error('[b1c] ошибка:', err.message);
  process.exitCode = 1;
});
