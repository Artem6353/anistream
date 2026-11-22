#!/usr/bin/env node
/**
 * B1-E: массовая сверка русскоязычных метаданных Comics.
 *
 * Что делает:
 * 1. Берёт произведения-первоисточники из снимка relation-графа (AniList) —
 *    идентификатор произведения задаётся графом, а не поиском по названию.
 * 2. Для каждого произведения заново запрашивает Shikimori по MAL id (пакетами,
 *    с ограничением частоты, backoff и checkpoint для возобновления).
 * 3. Проверяет: совпадение AniList id, MAL id, Shikimori `id` и `myanimelist_id`,
 *    принадлежность русского названия этому произведению, качество русского
 *    текста, дубликаты названий, пустые/битые значения.
 * 4. Разделяет статусы: SOURCE_VERIFIED (название сверено по источнику),
 *    PENDING_REVIEW (спорные/дубликаты), NAME_MISMATCH, NO_RU_TITLE,
 *    NOT_FOUND, NO_MAL_ID, ID_MISMATCH, ERROR.
 * 5. Права на публикацию НЕ определяются. Лицензионное название в Shikimori —
 *    заявка третьей стороны, а не подтверждение издателя: помечается отдельно.
 *
 * Запуск:
 *   node scripts/aninova3-b1e-metadata-verify.mjs               # все SOURCE-произведения
 *   node scripts/aninova3-b1e-metadata-verify.mjs --limit=50    # проба
 *   node scripts/aninova3-b1e-metadata-verify.mjs --from-cache  # без сети (только проверки)
 *
 * Пишет:
 *   lib/aninova3/comics/metadata-verified.json        (рантайм, внутреннее)
 *   docs/data/aninova3-b1e-metadata-verification.json (машинный отчёт)
 * Прогресс: .cache/b1e/verify-progress.json (возобновляемо).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GRAPH = path.join(ROOT, 'lib', 'aninova3', 'comics', 'source-graph.json');
const CANDIDATES = path.join(ROOT, 'docs', 'data', 'aninova3-b1c-metadata-candidates.json');
const OUT_RUNTIME = path.join(ROOT, 'lib', 'aninova3', 'comics', 'metadata-verified.json');
const OUT_REPORT = path.join(ROOT, 'docs', 'data', 'aninova3-b1e-metadata-verification.json');
const CACHE = path.join(ROOT, '.cache', 'b1e');
const PROGRESS = path.join(CACHE, 'verify-progress.json');
const API = 'https://shikimori.one/api/mangas';
const UA = { 'User-Agent': 'AniNova/3.0 B1-E (aninova-catalog.vercel.app)', Accept: 'application/json' };

const args = process.argv.slice(2);
const val = (name, dflt) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

const LIMIT = Number(val('limit', 0));
const FROM_CACHE = flag('from-cache');
/* Частота: Shikimori держит ~5 запросов/сек. Ставим интервал между стартами
   запросов и держим 3 параллельных обработчика — стабильно и без 429-штормов. */
const INTERVAL_MS = Math.max(120, Number(val('interval', 220)));
const WORKERS = Math.max(1, Number(val('workers', 3)));
const RETRIES = Math.max(1, Number(val('retries', 4)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

function absoluteUrl(url) {
  if (!url) return null;
  const text = String(url).trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://shikimori.one${text.startsWith('/') ? '' : '/'}${text}`;
}

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

/** Русское название относится к этому произведению? Только sanity-check по id-связи. */
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

const PLACEHOLDERS = [
  'нет перевода',
  'без перевода',
  'название неизвестно',
  'неизвестно',
  'информация уточняется',
  'уточняется',
  'tba',
  'n/a',
];

/**
 * Качество русского названия: это должен быть человеческий русский текст,
 * а не заглушка, HTML, служебная разметка Shikimori или латиница.
 */
function checkRuTitle(raw) {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const defects = [];
  if (!text) return { ok: false, defects: ['empty'] };
  if (/[<>]|&[a-z]+;|\[\/?[a-z]+[^\]]*\]/i.test(text)) defects.push('markup');
  const cyrillic = (text.match(/[а-яё]/gi) ?? []).length;
  if (cyrillic < 2) defects.push('no_cyrillic');
  if (cyrillic / Math.max(1, text.replace(/\s/g, '').length) < 0.3) defects.push('mostly_latin');
  if (text.length < 2) defects.push('too_short');
  if (text.length > 300) defects.push('too_long');
  if (PLACEHOLDERS.includes(text.toLowerCase())) defects.push('placeholder');
  if (!/[a-zа-яё0-9]/i.test(text)) defects.push('no_letters');
  if (/^[\s\-–—.,:;!?()]+$/.test(text)) defects.push('punctuation_only');
  return { ok: defects.length === 0, defects };
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
      const name = err?.name === 'AbortError' ? 'timeout' : err.message;
      if (attempt >= RETRIES) return { error: name };
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    } finally {
      clearTimeout(timer);
    }
  }
}

const KIND_RU = { manga: 'manga', manhwa: 'manhwa', manhua: 'manhua', one_shot: 'comic', doujin: 'comic' };
const names = (list) =>
  Array.isArray(list) ? list.map((l) => (typeof l === 'string' ? l : (l?.name ?? null))).filter(Boolean) : [];
const genres = (list) =>
  Array.isArray(list) ? list.map((g) => (typeof g === 'string' ? g : (g?.russian ?? g?.name ?? null))).filter(Boolean) : [];

/** Произведения-первоисточники: те, у кого есть ADAPTATION-ребро в графе. */
function buildScope(graph) {
  const comics = new Map(graph.comics.map((c) => [c.anilist, c]));
  const sourceEdges = new Map();
  const animeCount = new Map();
  for (const edge of graph.edges) {
    animeCount.set(edge.comic, (animeCount.get(edge.comic) ?? 0) + 1);
    if (edge.raw === 'ADAPTATION') {
      const all = sourceEdges.get(edge.comic) ?? [];
      all.push(edge.anime);
      sourceEdges.set(edge.comic, all);
    }
  }
  const rows = [];
  for (const [anilist, animeIds] of sourceEdges) {
    const comic = comics.get(anilist);
    if (!comic) continue;
    rows.push({ comic, animeIds, animeCount: animeCount.get(anilist) ?? 0 });
  }
  rows.sort((a, b) => b.animeCount - a.animeCount || a.comic.anilist - b.comic.anilist);
  return LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
}

/** Разбор одного ответа Shikimori в проверенную запись. */
function buildRecord(row, result) {
  const { comic, animeIds } = row;
  const base = {
    anilist: comic.anilist,
    mal: comic.mal ?? null,
    graphKind: comic.kind ?? null,
    graphYear: comic.year ?? null,
    animeIds,
  };
  if (!comic.mal) return { ...base, status: 'NO_MAL_ID', defects: ['no_mal_in_graph'] };
  if (result.missing) return { ...base, status: 'NOT_FOUND', defects: ['not_found_on_source'] };
  if (result.error) return { ...base, status: 'ERROR', defects: ['fetch_error'], error: result.error };

  const d = result.data;
  const defects = [];
  const idMatches = Number(d.id) === Number(comic.mal);
  const malFieldOk = d.myanimelist_id == null || Number(d.myanimelist_id) === Number(comic.mal);
  if (!idMatches) defects.push('shikimori_id_mismatch');
  if (!malFieldOk) defects.push('myanimelist_id_mismatch');
  const nameOk = titleMatches(d.name, comic);
  if (!nameOk) defects.push('title_mismatch');
  const ru = checkRuTitle(d.russian);
  defects.push(...ru.defects.map((x) => `ru_${x}`));

  const status =
    !idMatches || !malFieldOk
      ? 'ID_MISMATCH'
      : !String(d.russian ?? '').trim()
        ? 'NO_RU_TITLE'
        : !nameOk
          ? 'NAME_MISMATCH'
          : ru.ok
            ? 'SOURCE_VERIFIED'
            : 'PENDING_REVIEW';

  return {
    ...base,
    status,
    defects,
    shikimoriId: d.id ?? null,
    myanimelistId: d.myanimelist_id ?? null,
    nameOriginal: d.name ?? null,
    titleRu: String(d.russian ?? '').trim() || null,
    /* Название русской лицензии по данным Shikimori: заявка источника, не подтверждение издателя. */
    licenseNameRu: String(d.license_name_ru ?? '').trim() || null,
    licenseClaimSource: String(d.license_name_ru ?? '').trim() ? 'shikimori-license-field' : null,
    officialPublisherConfirmed: false,
    licensors: names(d.licensors),
    publishers: names(d.publishers),
    genres: genres(d.genres),
    japanese: Array.isArray(d.japanese) ? d.japanese.filter(Boolean) : d.japanese ? [d.japanese] : [],
    english: Array.isArray(d.english) ? d.english.filter(Boolean) : d.english ? [d.english] : [],
    kind: KIND_RU[d.kind] ?? d.kind ?? null,
    sourceStatus: d.status ?? null,
    year: d.aired_on ? Number(String(d.aired_on).slice(0, 4)) : null,
    volumes: Number.isFinite(d.volumes) ? d.volumes : null,
    chapters: Number.isFinite(d.chapters) ? d.chapters : null,
    cover: absoluteUrl(d.image?.original ?? d.image?.preview ?? null),
    score: typeof d.score === 'number' ? d.score : null,
    descriptionRu: d.description
      ? String(d.description)
          .replace(/\[[^\]]*\]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 600)
      : null,
    sourceUrl: d.id ? `https://shikimori.one/mangas/${d.id}` : null,
    apiUrl: `${API}/${comic.mal}`,
    checkedAt: new Date().toISOString(),
  };
}

/** Дубликаты русского названия у разных произведений — повод для ручной проверки. */
function applyDuplicateRule(records) {
  const groups = new Map();
  for (const rec of records) {
    if (!rec.titleRu) continue;
    const key = norm(rec.titleRu);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), rec]);
  }
  let duplicated = 0;
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    duplicated += 1;
    for (const rec of list) {
      if (rec.status !== 'SOURCE_VERIFIED') continue;
      rec.status = 'PENDING_REVIEW';
      rec.defects = [...new Set([...(rec.defects ?? []), 'duplicate_ru_title'])];
    }
  }
  return duplicated;
}

async function main() {
  const graph = readJson(GRAPH, null);
  if (!graph?.comics?.length) throw new Error('source-graph.json не найден — сначала npm run graph:b1c');
  mkdirSync(CACHE, { recursive: true });
  const progress = readJson(PROGRESS, {});
  const scope = buildScope(graph);
  console.log(`[b1e] произведений-первоисточников: ${scope.length}; в кэше ${Object.keys(progress).length}; режим ${FROM_CACHE ? 'cache' : 'live'}`);

  let requests = 0;
  let retries = 0;
  let done = 0;
  let next = 0;
  let lastStart = 0;

  /** Общий ограничитель частоты: старты запросов не чаще INTERVAL_MS. */
  async function rateLimitedFetch(mal) {
    for (;;) {
      const now = Date.now();
      const wait = lastStart + INTERVAL_MS - now;
      if (wait <= 0) {
        lastStart = Date.now();
        const result = await fetchShikimori(mal);
        requests += 1;
        if (result.error === '429') retries += 1;
        return result;
      }
      await sleep(wait);
    }
  }

  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= scope.length) return;
      const row = scope[index];
      const key = String(row.comic.anilist);
      if (progress[key] && progress[key].status !== 'ERROR') {
        done += 1;
        continue;
      }
      let result;
      if (FROM_CACHE) {
        /* Оффлайн-режим: используем сохранённый ответ предыдущего прохода. */
        const cached = readJson(CANDIDATES, null);
        const hit = cached?.candidates?.find((c) => c.anilist === row.comic.anilist);
        result = hit
          ? {
              data: {
                id: hit.shikimoriId,
                myanimelist_id: hit.myanimelistId,
                name: hit.name,
                russian: hit.titleRu,
                license_name_ru: hit.licenseNameRu,
                licensors: hit.licensors,
                publishers: hit.publishers,
                genres: hit.genres,
                japanese: hit.japanese,
                english: hit.english,
                kind: hit.kind === 'comic' ? 'one_shot' : hit.kind,
                status: hit.shikimoriStatus,
                aired_on: hit.year ? `${hit.year}-01-01` : null,
                volumes: hit.volumes,
                chapters: hit.chapters,
                image: { original: hit.cover },
                score: hit.score,
                url: hit.url?.replace('https://shikimori.one', ''),
                description: hit.descriptionRu,
              },
            }
          : { missing: true };
      } else {
        result = await rateLimitedFetch(row.comic.mal);
      }
      progress[key] = { ...buildRecord(row, result), verifiedAtSource: !FROM_CACHE };
      done += 1;
      if (done % 50 === 0) {
        writeFileSync(PROGRESS, `${JSON.stringify(progress)}\n`, 'utf8');
        console.log(`[b1e] ${done}/${scope.length} · запросов ${requests} · 429 ${retries}`);
      }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, () => worker()));
  writeFileSync(PROGRESS, `${JSON.stringify(progress)}\n`, 'utf8');

  const records = scope.map((row) => progress[String(row.comic.anilist)]).filter(Boolean);
  const rowAuthors = new Map(scope.map((row) => [row.comic.anilist, row.comic.authors ?? []]));
  const duplicateGroups = applyDuplicateRule(records);

  const byStatus = (status) => records.filter((r) => r.status === status).length;
  const stats = {
    generatedAt: new Date().toISOString(),
    source: 'shikimori.one (публичный API по MAL id из relation-графа AniList)',
    method:
      'Связь задаётся только идентификатором: AniList id → MAL id → ответ Shikimori, у которого проверяются ' +
      'id, myanimelist_id и принадлежность названия произведению. Поиск по названию связей не создаёт.',
    scope: 'произведения с ADAPTATION-ребром в снимке графа',
    total: records.length,
    sourceVerified: byStatus('SOURCE_VERIFIED'),
    pendingReview: byStatus('PENDING_REVIEW'),
    candidate: byStatus('CANDIDATE'),
    nameMismatch: byStatus('NAME_MISMATCH'),
    noRuTitle: byStatus('NO_RU_TITLE'),
    notFound: byStatus('NOT_FOUND'),
    noMalId: byStatus('NO_MAL_ID'),
    idMismatch: byStatus('ID_MISMATCH'),
    error: byStatus('ERROR'),
    duplicateTitleGroups: duplicateGroups,
    withRuTitle: records.filter((r) => r.titleRu).length,
    withLicenseClaim: records.filter((r) => r.licenseNameRu).length,
    withOfficialPublisherConfirmation: records.filter((r) => r.officialPublisherConfirmed).length,
    withRuDescription: records.filter((r) => r.descriptionRu).length,
    /* Авторы берутся из AniList staff того же произведения (привязка по id) и
       попадают в данные графа; Shikimori-авторы в этом проходе не используются. */
    withAuthors: records.filter((r) => (rowAuthors.get(r.anilist)?.length ?? 0) > 0).length,
    authorsSource: 'anilist-staff (привязка по id произведения)',
    withCover: records.filter((r) => r.cover).length,
    withGenres: records.filter((r) => (r.genres?.length ?? 0) > 0).length,
    withChaptersKnown: records.filter((r) => Number.isFinite(r.chapters) && r.chapters > 0).length,
    requests,
    rateLimitRetries: retries,
    note:
      'SOURCE_VERIFIED — русское название сверено с источником по совпавшим идентификаторам. ' +
      'Это не редакционное подтверждение, не официальное название лицензии и не права на публикацию.',
  };

  /* Рантайм: только то, что нужно приложению; описание не публикуется. */
  const runtime = {
    meta: {
      generatedAt: stats.generatedAt,
      source: stats.source,
      checkedLive: !FROM_CACHE,
      counts: {
        total: stats.total,
        sourceVerified: stats.sourceVerified,
        pendingReview: stats.pendingReview,
        withRuTitle: stats.withRuTitle,
        withLicenseClaim: stats.withLicenseClaim,
      },
    },
    records: Object.fromEntries(
      records
        .filter((r) => ['SOURCE_VERIFIED', 'PENDING_REVIEW', 'NAME_MISMATCH', 'NO_RU_TITLE', 'ID_MISMATCH'].includes(r.status))
        .map((r) => [
          String(r.anilist),
          {
            status: r.status,
            mal: r.mal,
            shikimoriId: r.shikimoriId ?? null,
            titleRu: r.titleRu,
            licenseNameRu: r.licenseNameRu,
            genres: r.genres ?? [],
            kind: r.kind,
            year: r.year,
            volumes: r.volumes,
            chapters: r.chapters,
            cover: r.cover,
            sourceUrl: r.sourceUrl,
            checkedAt: r.checkedAt,
            defects: r.defects ?? [],
            animeIds: r.animeIds ?? [],
          },
        ]),
    ),
  };

  writeFileSync(OUT_RUNTIME, `${JSON.stringify(runtime)}\n`, 'utf8');
  writeFileSync(OUT_REPORT, `${JSON.stringify({ ...stats, records }, null, 1)}\n`, 'utf8');
  console.log(`[b1e] ${JSON.stringify({ total: stats.total, sourceVerified: stats.sourceVerified, pending: stats.pendingReview, mismatches: stats.nameMismatch + stats.idMismatch, noRu: stats.noRuTitle, notFound: stats.notFound, noMal: stats.noMalId, errors: stats.error, licenses: stats.withLicenseClaim, desc: stats.withRuDescription })}`);
  console.log(`[b1e] записано: ${path.relative(ROOT, OUT_RUNTIME)}, ${path.relative(ROOT, OUT_REPORT)}`);
}

main().catch((err) => {
  console.error('[b1e] ошибка:', err.message);
  process.exitCode = 1;
});
