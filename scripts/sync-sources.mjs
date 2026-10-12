/* Воркер источников видео: Kodik → Supabase `episode_sources` / `episode_source_urls` (ТЗ 1.6.5).
 *
 * Зачем: на Vercel нет локальных Python-bridge (127.0.0.1:8765/8766), а прямой Kodik
 * с дата-центр IP отвечает 401 (LIMITS.md, проверено 23.09.2026). Поэтому источники
 * собирает этот воркер НЕ на Vercel (GitHub Actions с секретом или VPS), а рантайм
 * читает готовый результат из БД.
 *
 * Два режима:
 *   --mode bulk   (по умолчанию) один проход POST /list по всему каталогу Kodik
 *                 с пагинацией `next` и сопоставлением по shikimori_id. Это
 *                 ~200–400 запросов вместо 8000 запросов /search (лимит Kodik ~1 req/s),
 *                 поэтому bulk — основной путь для воркера по расписанию.
 *   --mode title  точечный POST /search?shikimori_id=… (ТЗ 1.6.5 «один поиск по тайтлу»);
 *                 удобно для онгоингов в день выхода серии и для ручного добора.
 *
 * Про один embed на тайтл (ТЗ 1.6.1 требовал проверить на реальном ответе API):
 * собственный KODIK_TOKEN для проверки в рамках аудита отсутствовал, но фактический
 * формат данных виден в scripts/import-kodik-bulk.py и .cache/providers-resolve-cache.json —
 * Kodik отдаёт ОТДЕЛЬНУЮ ссылку на каждую серию (/seria/<id>/<hash>), hash уникален,
 * поэтому «один embed + ?episode=N» для Kodik не работает. Отсюда две таблицы:
 * озвучка тайтла в episode_sources, ссылки серий в episode_source_urls.
 *
 * Память БД: Supabase Free даёт 500 МБ. Ссылка серии ≈ 90–150 байт, поэтому per-episode
 * строки пишем с лимитом MAX_EPISODE_URLS (по умолчанию 1200 последних серий на озвучку) —
 * иначе один «Садзаэ-сан» на 2784 серии × 10 озвучек дал бы ~4 МБ на тайтл.
 *
 * Секреты — только из env: KODIK_TOKEN (собственный, выдаётся Kodik разработчикам),
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY. Без токена воркер выходит с кодом 2
 * и ничего не ломает (провайдер просто остаётся пустым).
 *
 * Запуск:
 *   KODIK_TOKEN=… SUPABASE_SERVICE_KEY=… node scripts/sync-sources.mjs --mode bulk
 *   node scripts/sync-sources.mjs --mode title --slug one-piece
 *   node scripts/sync-sources.mjs --report
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const FILE = process.env.TITLES_FILE ?? 'lib/data/titles.json';
const CHECKPOINT = process.env.CHECKPOINT_FILE ?? '.cache/sync-sources-checkpoint.json';
const REPORT_FILE = '.cache/sync-sources-report.json';

const API_BASE = (process.env.KODIK_API_BASE_URL ?? 'https://kodik-api.com').replace(/\/$/, '');
const TOKEN = process.env.KODIK_TOKEN ?? '';
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

const argv = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split('=')[1] : dflt;
};

const MODE = argVal('mode', 'bulk'); // bulk | title
const SLUG = argVal('slug', '');
const DRY_RUN = argv.includes('--dry-run');
const REPORT_ONLY = argv.includes('--report');
/* ~1 запрос/с по практике Kodik (LIMITS.md). */
const SLEEP_MS = Number(process.env.KODIK_SLEEP_MS ?? 1000);
const PAGE_LIMIT = Number(process.env.KODIK_PAGE_LIMIT ?? 200);
const MAX_EPISODE_URLS = Number(process.env.MAX_EPISODE_URLS ?? 1200);
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS ?? 5);
const QUERY_TYPES = process.env.KODIK_TYPES ?? 'anime';
const ONGOING_ONLY = (process.env.SCOPE ?? '').toLowerCase() === 'ongoing';
const LIMIT = Number(argVal('limit', process.env.LIMIT ?? 0));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/* --------------------------------- HTTP ---------------------------------- */

function retryAfterSeconds(res, attempt) {
  const raw = Number(res.headers.get('retry-after'));
  if (Number.isFinite(raw) && raw > 0) return Math.min(120, raw);
  return Math.min(60, 2 * 2 ** attempt);
}

async function kodik(endpoint, payload) {
  const body = new URLSearchParams({ token: TOKEN, ...payload });
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      const wait = Math.min(60, 2 * 2 ** attempt) * 1000;
      log(`  [kodik] ${e.message}, повтор через ${wait / 1000} с`);
      await sleep(wait);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = retryAfterSeconds(res, attempt) * 1000;
      log(`  [kodik] HTTP ${res.status}, ждём ${wait / 1000} с (Retry-After)`);
      await sleep(wait);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Kodik отклонил токен (HTTP ${res.status}). Нужен собственный KODIK_TOKEN; с дата-центр IP Kodik часто блокирует доступ.`);
    }
    if (!res.ok) throw new Error(`Kodik HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json().catch(() => null);
    if (!json || json.error) throw new Error(`Kodik error: ${JSON.stringify(json?.error ?? json).slice(0, 200)}`);
    return json;
  }
  throw new Error('Kodik: лимит повторов исчерпан (429/5xx)');
}

/* ------------------------------ разбор ответа ----------------------------- */

const abs = (u) => (!u ? null : String(u).startsWith('//') ? `https:${u}` : String(u));

function materialsOf(body) {
  return Array.isArray(body?.results) ? body.results : [];
}

function episodeLinks(material) {
  const found = new Map(); // number → link
  const collect = (raw) => {
    if (!raw) return;
    const entries = Array.isArray(raw)
      ? raw.map((e, i) => [String(e?.episode ?? i + 1), e])
      : Object.entries(raw);
    for (const [num, ep] of entries) {
      const n = Number(num);
      const link = abs(typeof ep === 'string' ? ep : ep?.link);
      if (Number.isFinite(n) && n > 0 && link) found.set(n, link);
    }
  };
  const seasons = material?.seasons;
  if (seasons) {
    for (const season of Array.isArray(seasons) ? seasons : Object.values(seasons)) collect(season?.episodes);
  }
  collect(material?.episodes);
  // Фильм/спецл из одного видео: ссылка лежит прямо в материале.
  if (!found.size && material?.type === 'anime') {
    const link = abs(material?.link);
    if (link) found.set(1, link);
  }
  return found;
}

function translationsOf(material) {
  const tr = material?.translation ?? {};
  const id = tr.id !== undefined && tr.id !== null ? String(tr.id) : '';
  if (!id) return [];
  return [
    {
      translation_id: id,
      translation_title: tr.title ?? null,
      translation_type: String(tr.type ?? 'voice').toLowerCase().includes('sub') ? 'sub' : 'voice',
    },
  ];
}

/* ------------------------------- Supabase -------------------------------- */

async function supaUpsert(table, conflict, rows) {
  if (!rows.length || DRY_RUN) return rows.length;
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`supabase ${table} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return rows.length;
}

/** Пометить источники тайтла, которых больше нет в ответе провайдера, как dead. */
async function markDead(animeId, provider, aliveKeys) {
  if (DRY_RUN || !SUPA_URL || !SUPA_KEY || !aliveKeys.size) return;
  const res = await fetch(
    `${SUPA_URL}/rest/v1/episode_sources?anime_id=eq.${animeId}&provider=eq.${provider}&select=translation_id`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }, signal: AbortSignal.timeout(20_000) },
  ).catch(() => null);
  if (!res || !res.ok) return;
  const rows = await res.json().catch(() => []);
  const dead = (Array.isArray(rows) ? rows : []).map((r) => r.translation_id).filter((id) => !aliveKeys.has(id));
  if (!dead.length) return;
  for (const id of dead) {
    await fetch(
      `${SUPA_URL}/rest/v1/episode_sources?anime_id=eq.${animeId}&provider=eq.${provider}&translation_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status: 'dead', checked_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(20_000),
      },
    ).catch(() => null);
  }
}

/* -------------------------------- каталог -------------------------------- */

function loadTitles() {
  const titles = JSON.parse(readFileSync(FILE, 'utf8'));
  return titles.filter((t) => t.slug && !t.hidden && (ONGOING_ONLY ? t.status === 'ongoing' : t.status !== 'upcoming'));
}

const shikimoriIdOf = (t) => {
  const v = t.shikimori?.id ?? t.shikimoriId ?? null;
  return v && String(v) !== '0' ? String(v) : null;
};

function loadCheckpoint() {
  try {
    return JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
  } catch {
    return { cursor: null, done: [], at: null };
  }
}
function saveCheckpoint(cp) {
  if (DRY_RUN) return;
  mkdirSync('.cache', { recursive: true });
  cp.at = new Date().toISOString();
  cp.done = [...new Set(cp.done ?? [])].slice(-20_000);
  writeFileSync(CHECKPOINT, JSON.stringify(cp));
}

/* ------------------------------- запись тайтла ---------------------------- */

/** material → строки БД. Для Kodik ссылки серий уникальны, поэтому пишем и
 *  озвучку (episode_sources), и per-episode URL (episode_source_urls). */
function rowsFor(animeId, provider, material) {
  const links = episodeLinks(material);
  const sources = [];
  const urls = [];
  for (const tr of translationsOf(material)) {
    sources.push({
      anime_id: animeId,
      provider,
      translation_id: tr.translation_id,
      translation_title: tr.translation_title,
      translation_type: tr.translation_type,
      kind: 'embed',
      embed_url: abs(material?.link) ?? null,
      episodes_count: links.size || null,
      checked_at: new Date().toISOString(),
      status: 'ok',
    });
    if (!links.size) continue;
    /* Лимит памяти БД: берём ПОСЛЕДНИЕ серии — их смотрят чаще всего. */
    const numbers = [...links.keys()].sort((a, b) => b - a).slice(0, MAX_EPISODE_URLS);
    for (const n of numbers) {
      urls.push({
        anime_id: animeId,
        provider,
        translation_id: tr.translation_id,
        episode: n,
        kind: 'embed',
        embed_url: links.get(n),
        checked_at: new Date().toISOString(),
        status: 'ok',
      });
    }
  }
  return { sources, urls, episodes: links.size };
}

/* --------------------------------- режимы --------------------------------- */

async function runBulk() {
  const titles = loadTitles();
  const byShiki = new Map();
  for (const t of titles) {
    const sid = shikimoriIdOf(t);
    if (!sid) continue;
    if (!byShiki.has(sid)) byShiki.set(sid, []);
    byShiki.get(sid).push(t);
  }
  log(`bulk: ${titles.length} тайтлов, из них с shikimori_id — ${byShiki.size}`);

  const cp = loadCheckpoint();
  let cursor = cp.cursor ?? null;
  let pages = 0;
  let matched = 0;
  let sourcesWritten = 0;
  let urlsWritten = 0;
  const seenMaterials = new Set();

  for (;;) {
    const payload = { limit: String(PAGE_LIMIT), types: QUERY_TYPES, with_episodes_data: 'true' };
    if (cursor) payload.next = cursor;
    const body = await kodik('/list', payload);
    pages++;
    const materials = materialsOf(body);
    if (!materials.length) break;

    const srcBatch = [];
    const urlBatch = [];
    for (const m of materials) {
      const sid = m.shikimori_id !== undefined && m.shikimori_id !== null ? String(m.shikimori_id) : null;
      const candidates = sid ? byShiki.get(sid) : null;
      if (!candidates?.length) continue;
      for (const t of candidates) {
        const key = `${t.anilistId}:${m.translation?.id ?? ''}:${m.id ?? ''}`;
        if (seenMaterials.has(key)) continue;
        seenMaterials.add(key);
        const rows = rowsFor(t.anilistId, 'kodik', m);
        srcBatch.push(...rows.sources);
        urlBatch.push(...rows.urls);
        if (rows.sources.length) matched++;
      }
    }
    sourcesWritten += await supaUpsert('episode_sources', 'anime_id,provider,translation_id', srcBatch);
    urlsWritten += await supaUpsert('episode_source_urls', 'anime_id,provider,translation_id,episode', urlBatch);

    cursor = body.next ?? null;
    cp.cursor = cursor;
    saveCheckpoint(cp);
    log(`  стр ${pages}: материалов ${materials.length}, совпало ${matched}, записано ${sourcesWritten}+${urlsWritten}`);
    if (!cursor) break;
    if (LIMIT && pages >= LIMIT) {
      log(`  достигнут лимит страниц LIMIT=${LIMIT}`);
      break;
    }
    await sleep(SLEEP_MS);
  }

  cp.cursor = null; // проход завершён — следующий запуск с начала
  saveCheckpoint(cp);
  return { pages, matched, sourcesWritten, urlsWritten };
}

async function runTitles() {
  const titles = loadTitles().filter((t) => (SLUG ? t.slug === SLUG : true));
  if (SLUG && !titles.length) throw new Error(`тайтл не найден или исключён: ${SLUG}`);
  const cp = loadCheckpoint();
  const done = new Set(cp.done ?? []);
  const queue = titles.filter((t) => shikimoriIdOf(t) && !done.has(t.anilistId));
  const plan = LIMIT > 0 ? queue.slice(0, LIMIT) : queue;
  log(`title: к обработке ${plan.length} (в чекпоинте ${done.size})`);

  let matched = 0;
  let sourcesWritten = 0;
  let urlsWritten = 0;
  for (const t of plan) {
    const sid = shikimoriIdOf(t);
    const body = await kodik('/search', { shikimori_id: sid, limit: '20', with_episodes_data: 'true' }).catch((e) => {
      log(`  [${t.slug}] ${e.message}`);
      return null;
    });
    await sleep(SLEEP_MS);
    if (!body) continue;

    const srcBatch = [];
    const urlBatch = [];
    const alive = new Set();
    for (const m of materialsOf(body)) {
      const rows = rowsFor(t.anilistId, 'kodik', m);
      srcBatch.push(...rows.sources);
      urlBatch.push(...rows.urls);
      for (const s of rows.sources) alive.add(s.translation_id);
      if (rows.sources.length) matched++;
    }
    sourcesWritten += await supaUpsert('episode_sources', 'anime_id,provider,translation_id', srcBatch);
    urlsWritten += await supaUpsert('episode_source_urls', 'anime_id,provider,translation_id,episode', urlBatch);
    await markDead(t.anilistId, 'kodik', alive);

    cp.done = [...(cp.done ?? []), t.anilistId];
    saveCheckpoint(cp);
    log(`  ${t.slug}: озвучек ${alive.size}, серий ${urlBatch.length}`);
  }
  return { matched, sourcesWritten, urlsWritten };
}

function report() {
  const titles = loadTitles();
  const out = {
    generatedAt: new Date().toISOString(),
    mode: MODE,
    eligibleTitles: titles.length,
    withShikimoriId: titles.filter((t) => shikimoriIdOf(t)).length,
    ongoing: titles.filter((t) => t.status === 'ongoing').length,
    kodikToken: Boolean(TOKEN),
    supabase: Boolean(SUPA_URL && SUPA_KEY),
    checkpoint: loadCheckpoint().at,
    maxEpisodeUrlsPerTranslation: MAX_EPISODE_URLS,
  };
  mkdirSync('.cache', { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  log(`\n=== Отчёт sync-sources ===\n${JSON.stringify(out, null, 2)}\nфайл: ${REPORT_FILE}`);
}

if (REPORT_ONLY) {
  report();
  process.exit(0);
}
if (!TOKEN) {
  log('KODIK_TOKEN не задан — провайдер остаётся пустым, воркер ничего не ломает (ТЗ 1.6.6).');
  log('Токен выдаёт Kodik разработчикам; автоподбор публичных токенов в продакшен-пути не используется.');
  report();
  process.exit(2);
}
if (!SUPA_URL || !SUPA_KEY) {
  log('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY не заданы — записывать некуда.');
  report();
  process.exit(2);
}

const started = Date.now();
log(`sync-sources: mode=${MODE}${DRY_RUN ? ' (dry-run)' : ''} · API ${API_BASE}`);
try {
  const res = MODE === 'bulk' ? await runBulk() : await runTitles();
  log(`\nготово за ${((Date.now() - started) / 1000).toFixed(0)} с: ${JSON.stringify(res)}`);
  report();
} catch (e) {
  log(`::error::sync-sources упал: ${e.message}`);
  report();
  process.exit(1);
}
