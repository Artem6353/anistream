/* Синхронизация расписания выхода серий: AniList → Supabase `airing_schedule` (ТЗ 1.1).
 *
 * Зачем: AniList лимитирует 90 запросов/мин по IP, а у Vercel IP общие — рантайм-запрос
 * из lib/schedule.ts стабильно ловил 429, и /schedule падал в демо-неделю с фейковыми
 * «One Piece серия 5 / Наруто серия 11». Теперь AniList опрашивает этот воркер из
 * GitHub Actions (свой IP, cron каждые 30 минут), а рантайм читает только БД.
 *
 * Окно: −2 дня … +8 дней (вчерашние серии нужны блоку «Новые эпизоды», +8 дней —
 * чтобы расписание не пустело к концу недели между прогонами).
 *
 * Запуск:
 *   SUPABASE_SERVICE_KEY=... node scripts/sync-airing.mjs            # полный цикл
 *   node scripts/sync-airing.mjs --dry-run                           # только показать, что будет
 *
 * Секреты — только из env (SUPABASE_SERVICE_KEY, NEXT_PUBLIC_SUPABASE_URL).
 * Выход: 0 — записали, 2 — БД не настроена (не ошибка для CI без секретов), 1 — сбой.
 */
import { readFileSync } from 'node:fs';

const ANILIST = 'https://graphql.anilist.co';
const UA = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': process.env.SHIKIMORI_USER_AGENT || 'AniNova schedule sync (aninova-catalog.vercel.app)',
};

const DRY_RUN = process.argv.includes('--dry-run');
/* Пауза между запросами: 800 мс ≈ 75 запросов/мин — ниже лимита AniList 90/мин. */
const SLEEP_MS = Number(process.env.SLEEP_MS ?? 800);
const PER_PAGE = 250; // потолок AniList для airingSchedules
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 40);
const BACK_DAYS = Number(process.env.AIRING_BACK_DAYS ?? 2);
const FWD_DAYS = Number(process.env.AIRING_FWD_DAYS ?? 8);
const UPSERT_BATCH = 500;

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function windowBounds() {
  const now = Date.now();
  const start = Math.floor((now - BACK_DAYS * 86_400_000) / 1000);
  const end = Math.floor((now + FWD_DAYS * 86_400_000) / 1000);
  return { start, end };
}

/** GraphQL-запрос с уважением Retry-After при 429 и экспоненциальной задержкой. */
async function gql(query, variables, tries = 5) {
  for (let attempt = 0; attempt < tries; attempt++) {
    let res;
    try {
      res = await fetch(ANILIST, {
        method: 'POST',
        headers: UA,
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      console.log(`  [anilist] сеть: ${e.message}, повтор через ${(attempt + 1) * 2} с`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
      console.log(`  [anilist] ${res.status}, ждём ${Math.round(wait / 1000)} с`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`anilist ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    if (json?.errors) throw new Error(`anilist graphql: ${JSON.stringify(json.errors).slice(0, 200)}`);
    return json?.data;
  }
  throw new Error('anilist: лимит повторов исчерпан (429/5xx)');
}

/* notYetAired намеренно НЕ передаём: фильтр false отрезал бы будущие эфиры,
   а расписание нужно именно вперед. Без фильтра AniList отдаёт и вышедшие, и анонсированные. */
const QUERY = `query($page:Int!,$perPage:Int!,$start:Int!,$end:Int!){
  Page(page:$page,perPage:$perPage){
    pageInfo{ hasNextPage total }
    airingSchedules(airingAt_greater:$start, airingAt_lesser:$end, sort:TIME){
      airingAt episode mediaId
    }
  }
}`;

async function fetchWindow() {
  const { start, end } = windowBounds();
  const rows = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= MAX_PAGES) {
    const data = await gql(QUERY, { page, perPage: PER_PAGE, start, end });
    const nodes = data?.Page?.airingSchedules ?? [];
    for (const n of nodes) {
      if (!n?.mediaId || !Number.isFinite(n.episode) || !Number.isFinite(n.airingAt)) continue;
      rows.push({ anime_id: n.mediaId, episode: n.episode, airing_at: new Date(n.airingAt * 1000).toISOString() });
    }
    hasNext = Boolean(data?.Page?.pageInfo?.hasNextPage);
    console.log(`  стр ${page}: +${nodes.length} (всего ${rows.length})${hasNext ? '' : ' — конец'}`);
    page += 1;
    if (hasNext) await sleep(SLEEP_MS);
  }
  if (hasNext) console.log(`::warning::окно не дочитано: уперлись в MAX_PAGES=${MAX_PAGES}`);
  return { rows, start, end };
}

/** Дедуп по (anime_id, episode): AniList может отдать строку дважды на границе страниц. */
function dedupe(rows) {
  const map = new Map();
  for (const r of rows) map.set(`${r.anime_id}:${r.episode}`, r);
  return [...map.values()];
}

async function upsert(rows) {
  if (!SUPA_URL || !SUPA_KEY) return { skipped: true };
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const res = await fetch(`${SUPA_URL}/rest/v1/airing_schedule?on_conflict=anime_id,episode`, {
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
  return { written };
}

/** Чистка строк, выпавших из окна. Таблица — производные данные, полностью
 *  пересоздаётся каждым прогоном; доступ — только service_role (RLS). */
async function prune(beforeIso) {
  if (!SUPA_URL || !SUPA_KEY) return { skipped: true };
  const res = await fetch(`${SUPA_URL}/rest/v1/airing_schedule?airing_at=lt.${beforeIso}`, {
    method: 'DELETE',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: 'return=minimal' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`supabase prune ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { ok: true };
}

/** Сколько строк окна относятся к нашему каталогу — сигнал «воркер ещё и полезен». */
function catalogCoverage(rows) {
  try {
    const titles = JSON.parse(readFileSync('lib/data/titles.json', 'utf8'));
    const known = new Set(titles.map((t) => t.anilistId));
    const ours = rows.filter((r) => known.has(r.anime_id));
    const uniq = new Set(ours.map((r) => r.anime_id));
    return { rows: ours.length, titles: uniq.size, of: rows.length };
  } catch {
    return null;
  }
}

const started = Date.now();
console.log(`sync-airing: окно −${BACK_DAYS}…+${FWD_DAYS} дней${DRY_RUN ? ' (dry-run)' : ''}`);
if (!SUPA_URL || !SUPA_KEY) {
  console.log('SUPABASE_URL/SUPABASE_SERVICE_KEY не заданы — запись пропускается.');
  if (!DRY_RUN) process.exit(2);
}

try {
  const { rows, start } = await fetchWindow();
  const uniq = dedupe(rows);
  const cov = catalogCoverage(uniq);
  console.log(`итого: ${uniq.length} записей (из ${rows.length} сырых)`);
  if (cov) console.log(`из них в нашем каталоге: ${cov.rows} записей на ${cov.titles} тайтлов`);

  if (DRY_RUN) {
    console.log('dry-run: БД не трогаем');
    process.exit(0);
  }
  const up = await upsert(uniq);
  if (up.skipped) console.log('upsert пропущен: нет доступа к БД');
  else console.log(`upsert: ${up.written} строк`);
  await prune(new Date(start * 1000 - BACK_DAYS * 86_400_000).toISOString());
  console.log(`prune: удалены строки старее окна`);
  console.log(`готово за ${((Date.now() - started) / 1000).toFixed(1)} с`);
} catch (e) {
  console.error(`::error::sync-airing упал: ${e.message}`);
  process.exit(1);
}
