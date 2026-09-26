/* Точные даты выхода серий завершённых тайтлов (B6, AniList airingSchedule, notYetAired:false).
   Пишет t.epdates = { "<ep>": <ms> } для ВСЕХ finished-тайтлов (без лимита по episodes).

   Как добираются даты (по убыванию точности):
   1. airingSchedule батчами по 50 id (media(id_in), perPage:250) — основной путь;
   2. постраничный дозапрос airingSchedule(mediaId) для гигантов (>250 серий) и если
      батч упёрся в потолок perPage (проверка: nodes >= 250 или episodes > 250);
   3. фильмы/OVA/спешлы без ТВ-расписания: epdates["1"] = startDate (полная дата
      год+месяц+день; дата премьеры единственной «серии»). Неполные даты не fabric-уются.

   Resume: прогресс пишется в lib/data/titles.json каждые SAVE_EVERY батчей и по SIGINT —
   прерванный запуск продолжается с того же места (готовые epdates не перезапрашиваются).
   Идемпотентен: повторный запуск ничего не ломает и не дублирует.

   Запуск:
     node scripts/fetch-episode-dates.mjs            # догнать все finished + отчёт
     node scripts/fetch-episode-dates.mjs --report   # только отчёт покрытия (без сети) */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const FILE = 'lib/data/titles.json';
const UA = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': process.env.SHIKIMORI_USER_AGENT || 'Mozilla/5.0 (AniNova sync; contact: admin@example.com)',
};
const SAVE_EVERY = Number(process.env.SAVE_EVERY ?? 8); // батчей между записями
// --limit N (ТЗ блок B): обработать не более N pending-тайтлов за запуск — для батчей в workflow
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit')) ?? '').replace('--limit', '').replace('=', '') || 0);
const SLEEP_MS = Number(process.env.SLEEP_MS ?? 750); // пауза между запросами (rate-limit AniList)
const CHUNK = 50;

const titles = JSON.parse(readFileSync(FILE, 'utf8'));
const byId = new Map(titles.map((t) => [t.anilistId, t]));
const finished = titles.filter((t) => t.status === 'finished');
const hasDates = (t) => Boolean(t.epdates && Object.keys(t.epdates).length);

function save(tag = '') {
  writeFileSync(FILE, JSON.stringify(titles));
  if (tag) console.log(`\n[save] ${tag} — записано в ${FILE}`);
}

function report() {
  const withDates = finished.filter(hasDates);
  const pct = (100 * withDates.length) / finished.length;
  const noDates = finished.filter((t) => !hasDates(t));
  const byType = {};
  for (const t of noDates) byType[t.type] = (byType[t.type] ?? 0) + 1;
  const out = {
    generatedAt: new Date().toISOString(),
    finishedTotal: finished.length,
    withEpisodeDates: withDates.length,
    coveragePct: Number(pct.toFixed(1)),
    targetPct: 80,
    targetMet: pct >= 80,
    withoutDatesByType: byType,
    withoutDatesSamples: noDates.slice(0, 15).map((t) => ({ slug: t.slug, type: t.type, episodes: t.episodes, year: t.year })),
  };
  mkdirSync('.cache', { recursive: true });
  writeFileSync('.cache/episode-dates-report.json', JSON.stringify(out, null, 2));
  console.log(
    `\n=== Отчёт B6 (даты серий) ===\nfinished: ${out.finishedTotal} · с точными датами: ${out.withEpisodeDates} (${out.coveragePct}%)\nцель 80%: ${out.targetMet ? 'ВЫПОЛНЕНА' : 'НЕ ВЫПОЛНЕНА'}\nбез дат по типам: ${JSON.stringify(byType)}\nотчёт: .cache/episode-dates-report.json`,
  );
  return out;
}

if (process.argv.includes('--report')) {
  report();
  process.exit(0);
}

let dirty = false;
process.on('SIGINT', () => {
  if (dirty) save('SIGINT');
  report();
  process.exit(130);
});

async function gql(query, variables, tries = 5) {
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: UA,
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20000),
      });
      if (r.status === 429 || r.status >= 500) {
        const retry = Number(r.headers.get('retry-after')) || 0;
        await new Promise((z) => setTimeout(z, Math.max(retry * 1000, 3000 * (a + 1))));
        continue;
      }
      const j = await r.json();
      if (j?.errors && a < tries - 1) {
        await new Promise((z) => setTimeout(z, 1500 * (a + 1)));
        continue;
      }
      return j?.data ?? null;
    } catch {
      await new Promise((z) => setTimeout(z, 1200 * (a + 1)));
    }
  }
  return null;
}

const BATCH_Q = `query($ids:[Int]){ Page(page:1,perPage:50){ media(id_in:$ids){
  id episodes format startDate{ year month day }
  airingSchedule(notYetAired:false,perPage:250){ nodes{ episode airingAt } }
} } }`;

const PAGED_Q = `query($id:Int,$page:Int){ Page(page:$page,perPage:50){
  airingSchedule(mediaId:$id,notYetAired:false){ pageInfo{ hasNextPage } nodes{ episode airingAt } }
} }`;

function applyNodes(t, nodes, { merge = false } = {}) {
  const ed = merge && t.epdates ? { ...t.epdates } : {};
  let n = 0;
  for (const node of nodes) {
    if (node?.episode == null || !node.airingAt) continue;
    ed[String(node.episode)] = node.airingAt * 1000;
    n++;
  }
  if (n) {
    t.epdates = ed;
    dirty = true;
  }
  return n;
}

function applyStartDate(t, sd) {
  if (!sd?.year || !sd?.month || !sd?.day) return false; // неполную дату не fabric-уем
  t.epdates = { '1': Date.UTC(sd.year, sd.month - 1, sd.day) };
  t.epdatesSource = 'startDate';
  dirty = true;
  return true;
}

// --- Шаг 1: батчи по 50 id для всех finished без дат -------------------------
let pending = finished.filter((t) => !hasDates(t) && Number(t.episodes ?? 0) <= 250);
if (LIMIT > 0) pending = pending.slice(0, LIMIT);
const longPending = finished.filter((t) => !hasDates(t) && Number(t.episodes ?? 0) > 250);
console.log(`pending: ${pending.length} (батчи) + ${longPending.length} (гиганты >250 серий)`);

let processed = 0;
let scheduled = 0;
let viaStart = 0;
let sinceSave = 0;
const recheck = []; // тайтлы, где батч мог упереться в потолок perPage

for (let i = 0; i < pending.length; i += CHUNK) {
  const chunk = pending.slice(i, i + CHUNK);
  const data = await gql(BATCH_Q, { ids: chunk.map((t) => t.anilistId) });
  const media = data?.Page?.media ?? [];
  for (const m of media) {
    const t = byId.get(m.id);
    if (!t) continue;
    const nodes = m.airingSchedule?.nodes ?? [];
    if (nodes.length) {
      scheduled += applyNodes(t, nodes) ? 1 : 0;
      if (nodes.length >= 250 || Number(t.episodes ?? 0) > nodes.length + 2) recheck.push(t.anilistId);
    } else if (applyStartDate(t, m.startDate)) {
      viaStart++;
    }
  }
  processed += chunk.length;
  sinceSave++;
  process.stdout.write(`\rбатч ${Math.floor(i / CHUNK) + 1}/${Math.ceil(pending.length / CHUNK)} · обработано ${processed} · расписание ${scheduled} · startDate ${viaStart}   `);
  if (sinceSave >= SAVE_EVERY) {
    save(`прогресс ${processed}/${pending.length}`);
    sinceSave = 0;
  }
  await new Promise((z) => setTimeout(z, SLEEP_MS));
}

// --- Шаг 2: гиганты >250 серий — постраничный airingSchedule ------------------
for (const t of longPending) {
  const all = [];
  for (let page = 1; page <= 60; page++) {
    const data = await gql(PAGED_Q, { id: t.anilistId, page });
    const conn = data?.Page?.airingSchedule;
    if (!conn) break;
    all.push(...(conn.nodes ?? []));
    if (!conn.pageInfo?.hasNextPage) break;
    await new Promise((z) => setTimeout(z, SLEEP_MS));
  }
  if (all.length) applyNodes(t, all);
  console.log(`\nгигант ${t.slug}: ${all.length} дат из ${t.episodes} серий`);
  await new Promise((z) => setTimeout(z, SLEEP_MS));
}

// --- Шаг 3: добор для упёршихся в потолок perPage -----------------------------
const uniq = [...new Set(recheck)].filter((id) => {
  const t = byId.get(id);
  return t && Number(t.episodes ?? 0) > Object.keys(t.epdates ?? {}).length;
});
console.log(`\nдозапрос постранично: ${uniq.length} тайтлов`);
for (const id of uniq) {
  const t = byId.get(id);
  for (let page = 1; page <= 20; page++) {
    const data = await gql(PAGED_Q, { id, page });
    const conn = data?.Page?.airingSchedule;
    if (!conn) break;
    applyNodes(t, conn.nodes ?? [], { merge: true });
    if (!conn.pageInfo?.hasNextPage) break;
    await new Promise((z) => setTimeout(z, SLEEP_MS));
  }
  console.log(`  ${t.slug}: теперь ${Object.keys(t.epdates ?? {}).length}/${t.episodes}`);
}

save('финал');
report();
