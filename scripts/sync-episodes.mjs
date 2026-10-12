/* Синхронизация серий: номера, даты выхода и названия → Supabase `episodes` (ТЗ 1.3).
 *
 * Зачем: на странице «Ван-Пис» последняя серия датировалась 29 июня 2025 (эп. 1134),
 * хотя на момент аудита (октябрь 2026) вышло 1180 серий, а названия серий везде были
 * «Episode 1123». Данные лежали в titles.json и после импорта не обновлялись.
 *
 * Источники (по надёжности):
 *   1. AniList `airingSchedule` батчами по 50 media-id — номера + ТОЧНЫЕ даты выхода.
 *      Это единственный источник, который отдаёт даты и для онгоингов, и для finished.
 *   2. Shikimori `/api/animes/{id}` — `episodes_aired` (сколько серий реально вышло;
 *      у «Ван-Пис» там 1180 при `episodes: 0`) и `next_episode_at`. Используется для
 *      сверки: для онгоинга берём БОЛЬШЕЕ из «вышло» (AniList vs Shikimori).
 *   3. Jikan `/anime/{mal_id}/episodes` — названия серий (title / title_japanese).
 *      Включается EPISODE_TITLES=jikan; API медленный (~3 req/min) и отдаёт только
 *      латиницу, поэтому по умолчанию выключен — UI в этом случае показывает «Серия N».
 *
 * Приоритет обхода: онгоинги → популярные → остальные (resumable по чекпоинту).
 * Секреты — только из env. Запуск:
 *   SUPABASE_SERVICE_KEY=... node scripts/sync-episodes.mjs --mode ongoing
 *   SUPABASE_SERVICE_KEY=... node scripts/sync-episodes.mjs --mode full --limit 500
 *   node scripts/sync-episodes.mjs --report        # только отчёт покрытия, без сети
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const FILE = process.env.TITLES_FILE ?? 'lib/data/titles.json';
const CHECKPOINT = process.env.CHECKPOINT_FILE ?? '.cache/sync-episodes-checkpoint.json';
const REPORT_FILE = '.cache/sync-episodes-report.json';

const ANILIST = 'https://graphql.anilist.co';
const SHIKIMORI_HOSTS = ['https://shikimori.io', 'https://shikimori.one'];
const JIKAN = 'https://api.jikan.moe/v4';

const UA_ANILIST = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': process.env.SHIKIMORI_USER_AGENT || 'AniNova episodes sync (aninova-catalog.vercel.app)',
};
const UA_SHIKI = { 'User-Agent': process.env.SHIKIMORI_USER_AGENT || 'AniNova/2.0 (aninova-catalog.vercel.app)' };

const argv = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split('=')[1] : dflt;
};

const MODE = argVal('mode', 'ongoing'); // ongoing | full
const LIMIT = Number(argVal('limit', process.env.LIMIT ?? 0));
const DRY_RUN = argv.includes('--dry-run');
const REPORT_ONLY = argv.includes('--report');
const WANT_JIKAN_TITLES = (process.env.EPISODE_TITLES ?? '').toLowerCase() === 'jikan';

const ANILIST_CHUNK = Number(process.env.ANILIST_CHUNK ?? 50); // лимит AniList: батч по 50 id
/* Потолок записей на один mediaId в батче (замерено: 50). Всё, что уперлось в него,
   дозапрашивается постранично. */
const ANILIST_BATCH_CAP = Number(process.env.ANILIST_BATCH_CAP ?? 50);
/* 800 мс ≈ 75 запросов/мин — ниже лимита AniList 90/мин (LIMITS.md). */
const ANILIST_SLEEP_MS = Number(process.env.SLEEP_MS ?? 800);
const SHIKI_SLEEP_MS = Number(process.env.SHIKI_SLEEP_MS ?? 1100); // ~1 req/s по правилам Shikimori
const SHIKI_WORKERS = Math.min(3, Number(process.env.SHIKI_WORKERS ?? 3)); // «воркеров не больше 3»
const JIKAN_SLEEP_MS = Number(process.env.JIKAN_SLEEP_MS ?? 21_000); // ~3 req/min
const UPSERT_BATCH = 300;

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/* ------------------------------- чекпоинт -------------------------------- */

function loadCheckpoint() {
  try {
    return JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
  } catch {
    return { done: [], at: null };
  }
}
function saveCheckpoint(cp) {
  if (DRY_RUN) return;
  mkdirSync('.cache', { recursive: true });
  cp.at = new Date().toISOString();
  // Храним только id — файл на 8000 чисел, а не дамп данных.
  writeFileSync(CHECKPOINT, JSON.stringify({ ...cp, done: [...new Set(cp.done)].slice(-20_000) }));
}

/* ------------------------------- HTTP/ретраи ------------------------------ */

/** Запрос с экспоненциальной задержкой и уважением Retry-After (429/5xx). */
async function withRetry(label, fn, tries = 5) {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const out = await fn();
      if (out?.status === 429 || out?.status >= 500) {
        const retryAfter = Number(out.headers?.get?.('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
        log(`  [${label}] ${out.status}, ждём ${Math.round(wait / 1000)} с`);
        await sleep(wait);
        continue;
      }
      return out;
    } catch (e) {
      const wait = 1500 * 2 ** attempt;
      log(`  [${label}] ${e.message}, повтор через ${Math.round(wait / 1000)} с`);
      await sleep(wait);
    }
  }
  return null;
}

async function anilist(query, variables) {
  const res = await withRetry('anilist', () =>
    fetch(ANILIST, {
      method: 'POST',
      headers: UA_ANILIST,
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(25_000),
    }),
  );
  if (!res || !res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json || json.errors) {
    log(`  [anilist] graphql-ошибка: ${JSON.stringify(json?.errors ?? json).slice(0, 200)}`);
    return null;
  }
  return json.data;
}

async function shikimori(path) {
  for (const host of SHIKIMORI_HOSTS) {
    const res = await withRetry('shikimori', () =>
      fetch(`${host}${path}`, { headers: UA_SHIKI, signal: AbortSignal.timeout(20_000) }),
    );
    if (res && res.ok) return res.json().catch(() => null);
    if (res && res.status === 404) return null;
  }
  return null;
}

async function jikanEpisodes(malId) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const res = await withRetry('jikan', () =>
      fetch(`${JIKAN}/anime/${malId}/episodes?page=${page}`, { headers: UA_SHIKI, signal: AbortSignal.timeout(25_000) }),
    );
    if (!res || !res.ok) break;
    const json = await res.json().catch(() => null);
    const data = json?.data ?? [];
    for (const e of data) {
      if (!Number.isFinite(e.mal_id)) continue;
      out.push({ number: e.mal_id, title_en: e.title ?? null, aired_at: e.aired ? Date.parse(e.aired) : null });
    }
    if (!json?.pagination?.has_next_page) break;
    await sleep(JIKAN_SLEEP_MS);
  }
  return out;
}

/* ------------------------------- данные ---------------------------------- */

/* ВАЖНО (проверено на реальном API 12.10.2026): Page с perPage:250 при
   mediaId_in:[21] («Ван-Пис») вернул только 50 записей (эп. 1123…1172) — AniList
   режет выдачу по одному mediaId. Поэтому батч даёт pageInfo, а подозрительные
   тайтлы дозапрашиваются постранично одним mediaId (QUERY_SINGLE). */
const QUERY_BATCH = `query($ids:[Int]){
  Page(page:1,perPage:250){
    pageInfo{ hasNextPage total }
    airingSchedules(mediaId_in:$ids, sort:TIME){ airingAt episode mediaId }
  }
}`;

/** Дозапрос для гигантов (>250 серий в батче): по одному mediaId со страницами. */
const QUERY_SINGLE = `query($id:Int!,$page:Int!){
  Page(page:$page,perPage:250){
    pageInfo{ hasNextPage }
    airingSchedules(mediaId:$id, sort:TIME){ airingAt episode mediaId }
  }
}`;

async function airingForIds(ids) {
  const byMedia = new Map();
  const data = await anilist(QUERY_BATCH, { ids });
  for (const n of data?.Page?.airingSchedules ?? []) {
    if (!Number.isFinite(n.mediaId) || !Number.isFinite(n.episode) || !Number.isFinite(n.airingAt)) continue;
    if (!byMedia.has(n.mediaId)) byMedia.set(n.mediaId, []);
    byMedia.get(n.mediaId).push({ number: n.episode, aired_at: n.airingAt * 1000 });
  }
  return { byMedia, truncated: Boolean(data?.Page?.pageInfo?.hasNextPage) };
}

/** Нужен ли постраничный дозапрос: батч упёрся в потолок или серий явно больше,
 *  чем вернулось (длинные онгоинги, гиганты вроде «Садзаэ-сан» на 2700+ серий). */
function needsDeepFetch(title, got) {
  if (got >= ANILIST_BATCH_CAP) return true;
  const declared = Number(title.episodes);
  return Number.isFinite(declared) && declared > got;
}

async function airingForOne(id) {
  const rows = [];
  for (let page = 1; page <= 12; page++) {
    const data = await anilist(QUERY_SINGLE, { id, page });
    const nodes = data?.Page?.airingSchedules ?? [];
    for (const n of nodes) if (Number.isFinite(n.episode) && Number.isFinite(n.airingAt)) rows.push({ number: n.episode, aired_at: n.airingAt * 1000 });
    if (!data?.Page?.pageInfo?.hasNextPage) break;
    await sleep(ANILIST_SLEEP_MS);
  }
  return rows;
}

/* ------------------------------- порядок --------------------------------- */

function orderedTitles(titles) {
  const rank = (t) => {
    if (t.status === 'ongoing') return 0; // онгоинги — сначала (даты устаревают быстрее всего)
    if (t.status === 'upcoming') return 3; // анонсы — в конце (серий ещё нет)
    return t.favourites > 20_000 ? 1 : 2; // популярные → остальные
  };
  return [...titles].sort((a, b) => rank(a) - rank(b) || b.favourites - a.favourites);
}

async function upsertEpisodes(rows) {
  if (!SUPA_URL || !SUPA_KEY || !rows.length) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const res = await fetch(`${SUPA_URL}/rest/v1/episodes?on_conflict=anime_id,number`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`supabase upsert ${res.status}: ${(await res.text()).slice(0, 300)}`);
    written += batch.length;
  }
  return written;
}

/* ------------------------------- отчёт ----------------------------------- */

function report(titles) {
  const out = {
    generatedAt: new Date().toISOString(),
    mode: MODE,
    total: titles.length,
    ongoing: titles.filter((t) => t.status === 'ongoing').length,
    withMalId: titles.filter((t) => t.malId).length,
    checkpoint: existsSync(CHECKPOINT) ? loadCheckpoint().at : null,
    doneInCheckpoint: existsSync(CHECKPOINT) ? loadCheckpoint().done.length : 0,
  };
  mkdirSync('.cache', { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  log(`\n=== Отчёт sync-episodes ===\n${JSON.stringify(out, null, 2)}\nфайл: ${REPORT_FILE}`);
  return out;
}

/* ------------------------------- основной цикл ---------------------------- */

const titles = JSON.parse(readFileSync(FILE, 'utf8'));

if (REPORT_ONLY) {
  report(titles);
  process.exit(0);
}

const pool = orderedTitles(MODE === 'ongoing' ? titles.filter((t) => t.status === 'ongoing') : titles);
const cp = loadCheckpoint();
const done = new Set(cp.done ?? []);
// Полный проход игнорирует чекпоинт онгоингов: он помечает всё заново.
const queue = pool.filter((t) => !done.has(t.anilistId));
const plan = LIMIT > 0 ? queue.slice(0, LIMIT) : queue;

log(`sync-episodes: mode=${MODE} · всего ${pool.length} · в чекпоинте ${done.size} · к обработке ${plan.length}${DRY_RUN ? ' (dry-run)' : ''}`);
if (!SUPA_URL || !SUPA_KEY) {
  log('SUPABASE_URL/SUPABASE_SERVICE_KEY не заданы — запись в БД пропускается.');
  if (!DRY_RUN) process.exit(2);
}
if (!plan.length) {
  log('все тайтлы уже обработаны: чекпоинт полный. Удалите ' + CHECKPOINT + ' для полного прохода.');
  process.exit(0);
}

let interrupted = false;
process.on('SIGINT', () => {
  interrupted = true;
  saveCheckpoint(cp);
  log('\n[SIGINT] чекпоинт сохранён — повторный запуск продолжит с этого места');
  process.exit(130);
});

const started = Date.now();
let written = 0;
let processed = 0;
let shikiQueue = [];
/** anime_id → сколько серий реально вышло по Shikimori `episodes_aired`. */
const releasedFix = new Map();

/** Shikimori-сверка «сколько вышло» — отдельным медленным пулом (≤3 воркеров, ~1 req/s). */
async function drainShikimori() {
  while (shikiQueue.length) {
    const batch = shikiQueue.splice(0, SHIKI_WORKERS);
    await Promise.all(
      batch.map(async (item) => {
        const data = await shikimori(`/api/animes/${item.shikimoriId}`);
        await sleep(SHIKI_SLEEP_MS);
        if (!data) return;
        const aired = Number(data.episodes_aired);
        if (!Number.isFinite(aired) || aired <= 0) return;
        /* ТЗ 1.3.2: для онгоинга приоритет у БОЛЬШЕГО из «вышло».
           Shikimori отдаёт episodes_aired=1180 у «Ван-Пис» при episodes=0, а
           airingSchedule AniList на длинных сериалах может не содержать хвост. */
        item.released = Math.max(item.releasedFromAnilist, aired);
        if (item.released > item.releasedFromAnilist) releasedFix.set(item.animeId, item.released);
        item.nextEpisodeAt = data.next_episode_at ? Date.parse(data.next_episode_at) : null;
      }),
    );
  }
}

/** Пишет уточнённое число вышедших серий в public.titles через RPC.
 *
 *  Почему не POST /titles?on_conflict=id: частичная строка {id, episodes_released}
 *  СОЗДАЛА бы строку-огрызок с null во всех остальных колонках, если тайтла ещё нет
 *  в таблице (до импорта каталога). RPC `set_episodes_released` делает UPDATE
 *  существующих строк и только на увеличение — миграция
 *  supabase/migrations/20261012_set_episodes_released.sql. */
async function flushReleasedFix() {
  if (!releasedFix.size || !SUPA_URL || !SUPA_KEY || DRY_RUN) return;
  const rows = [...releasedFix.entries()].map(([id, released]) => ({ id, released }));
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/set_episodes_released`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ p_rows: rows }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res) return;
  if (res.ok) {
    const updated = await res.json().catch(() => null);
    log(`  episodes_released: отправлено ${rows.length}, обновлено строк ${updated ?? '?'}`);
  } else {
    log(`  episodes_released не записан (${res.status}): нет RPC/таблицы titles — пропускаем`);
  }
  releasedFix.clear();
}

for (let i = 0; i < plan.length; i += ANILIST_CHUNK) {
  if (interrupted) break;
  const batch = plan.slice(i, i + ANILIST_CHUNK);
  const ids = batch.map((t) => t.anilistId);
  const { byMedia } = await airingForIds(ids);
  await sleep(ANILIST_SLEEP_MS);

  const rows = [];
  const summary = [];
  for (const t of batch) {
    let eps = byMedia.get(t.anilistId) ?? [];
    /* Онгоинги и длинные тайтлы дозапрашиваем ВСЕГДА постранично: батч режет
       выдачу по одному mediaId, из-за чего «Ван-Пис» останавливался на 1172-й серии. */
    if (t.status === 'ongoing' || needsDeepFetch(t, eps.length)) {
      const single = await airingForOne(t.anilistId);
      if (single.length >= eps.length) eps = single.length ? single : eps;
      await sleep(ANILIST_SLEEP_MS);
    }
    const dedup = new Map();
    for (const e of eps) {
      const prev = dedup.get(e.number);
      if (!prev || (e.aired_at && !prev.aired_at)) dedup.set(e.number, e);
    }
    const list = [...dedup.values()].sort((a, b) => a.number - b.number);
    const item = {
      animeId: t.anilistId,
      shikimoriId: t.shikimori?.id ?? null,
      releasedFromAnilist: list.length ? list[list.length - 1].number : 0,
      released: list.length ? list[list.length - 1].number : 0,
      nextEpisodeAt: null,
      rows: list,
    };
    if (item.shikimoriId) shikiQueue.push(item);
    summary.push({ title: t, item });
    processed++;
  }

  await drainShikimori();

  // Названия серий (Jikan) — только когда явно включены: API медленный и без кириллицы.
  if (WANT_JIKAN_TITLES) {
    for (const { title: t, item } of summary) {
      if (!t.malId || !item.rows.length) continue;
      const named = await jikanEpisodes(t.malId);
      if (!named.length) continue;
      const byNumber = new Map(item.rows.map((r) => [r.number, r]));
      for (const n of named) {
        const target = byNumber.get(n.number);
        if (target && n.title_en && !target.title_en) target.title_en = n.title_en;
      }
      await sleep(JIKAN_SLEEP_MS);
    }
  }

  for (const { title: t, item } of summary) {
    for (const e of item.rows) {
      rows.push({
        anime_id: t.anilistId,
        number: e.number,
        title_ru: e.title_ru ?? null,
        title_en: e.title_en ?? null,
        aired_at: e.aired_at ? new Date(e.aired_at).toISOString() : null,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length >= UPSERT_BATCH || i + ANILIST_CHUNK >= plan.length) {
    if (!DRY_RUN) written += await upsertEpisodes(rows);
    else log(`  dry-run: в БД ушло бы ${rows.length} строк`);
    rows.length = 0;
  }

  await flushReleasedFix();

  cp.done = [...(cp.done ?? []), ...batch.map((t) => t.anilistId)];
  saveCheckpoint(cp);
  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  log(`  ${Math.min(i + ANILIST_CHUNK, plan.length)}/${plan.length} тайтлов · ${written} строк в БД · ${elapsed} с`);
}

saveCheckpoint(cp);
log(`\nготово: обработано ${processed} тайтлов, записано ${written} строк за ${((Date.now() - started) / 1000).toFixed(0)} с`);
report(titles);
