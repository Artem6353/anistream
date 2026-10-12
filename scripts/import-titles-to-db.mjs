/* Одноразовый перенос каталога lib/data/titles.json → Supabase public.titles (ТЗ 2.1).
 *
 * Идемпотентен: upsert по `id` (AniList id) пачками, повторный запуск ничего не дублирует.
 * Ничего не удаляет — существующие строки в БД только перезаписываются свежими данными.
 *
 * После переноса:
 *   1) CATALOG_SOURCE=db (по умолчанию, если заданы Supabase-переменные) — lib/catalog.ts
 *      читает БД при старте процесса (instrumentation.ts), файл остаётся fallback'ом;
 *   2) из .github/workflows/sync-catalog.yml убираются коммиты titles.json каждые 6 часов
 *      (скрипты sync пишут в БД); см. docs/REPORT.md, раздел про git pack.
 *
 * Запуск:
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node scripts/import-titles-to-db.mjs
 *   node scripts/import-titles-to-db.mjs --dry-run --limit 50
 *   node scripts/import-titles-to-db.mjs --verify       # сверка числа строк и выборки
 */
import { readFileSync } from 'node:fs';

const FILE = process.env.TITLES_FILE ?? 'lib/data/titles.json';
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
const BATCH = Number(process.env.IMPORT_BATCH ?? 500);

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const VERIFY = argv.includes('--verify');
const LIMIT = Number((argv.find((a) => a.startsWith('--limit=')) ?? '').split('=')[1] || 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function toRow(t) {
  return {
    id: t.anilistId,
    slug: t.slug,
    anilist_id: t.anilistId,
    mal_id: num(t.malId),
    shikimori_id: num(t.shikimori?.id),
    title_ru: t.ru ?? null,
    title_en: t.en ?? null,
    title_romaji: t.romaji ?? null,
    format: t.type ?? 'tv',
    status: t.status ?? 'finished',
    year: num(t.year),
    season: t.season ?? null,
    /* КЛЮЧЕВОЕ (ТЗ 1.2): заглушки 12/24 в БД не переносим. null = «итог не объявлен»,
       отдельное поле episodes_released хранит сколько серий реально вышло. */
    episodes_total: num(t.episodes),
    episodes_released: num(t.episodesReleased ?? (t.status === 'ongoing' ? maxKnown(t) : null)),
    score: num(t.score) ?? 0,
    popularity: num(t.favourites) ?? 0,
    genres: Array.isArray(t.genres) ? t.genres : [],
    studios: Array.isArray(t.studios) ? t.studios : [],
    source: t.source ?? null,
    duration: num(t.duration),
    is_adult: Boolean(t.isAdult),
    description_ru: t.description ?? null,
    description_alt: t.shikimori?.description ?? null,
    poster: t.poster ?? null,
    banner: t.banner ?? null,
    trailer: t.trailer ?? null,
    meta_source: t.metaSource ?? 'anilist',
    hidden: Boolean(t.hidden),
    updated_at: new Date().toISOString(),
  };
}

function maxKnown(t) {
  let max = 0;
  for (const a of t.airing ?? []) if (a.ep > max) max = a.ep;
  const ed = t.epdates;
  if (ed) for (const k of Object.keys(ed)) { const n = Number(k); if (Number.isFinite(n) && n > max) max = n; }
  return max || null;
}

async function upsert(table, rows, conflict) {
  if (DRY_RUN) return rows.length;
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${table} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return rows.length;
}

if (!SUPA_URL || !SUPA_KEY) {
  console.log('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY не заданы — импорт невозможен.');
  console.log('Секреты берутся только из env; в коде и логах их быть не должно.');
  process.exit(2);
}

const titles = JSON.parse(readFileSync(FILE, 'utf8'));
const plan = LIMIT > 0 ? titles.slice(0, LIMIT) : titles;
console.log(`импорт: ${plan.length} тайтлов из ${titles.length} (пачки по ${BATCH})${DRY_RUN ? ' · dry-run' : ''}`);

if (VERIFY) {
  const res = await fetch(`${SUPA_URL}/rest/v1/titles?select=id&limit=1`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: 'count=exact', Range: '0-0' },
  });
  const total = res.headers.get('content-range')?.split('/')?.[1] ?? '?';
  console.log(`в таблице titles строк: ${total} (в файле ${titles.length})`);
  const sample = plan[0];
  const one = await fetch(`${SUPA_URL}/rest/v1/titles?id=eq.${sample.anilistId}&select=slug,title_ru,episodes_total,episodes_released,status`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  }).then((r) => r.json());
  console.log(`контрольная выборка (${sample.slug}):`, JSON.stringify(one));
  console.log(`в файле: episodes=${sample.episodes} released=${sample.episodesReleased ?? null} status=${sample.status}`);
  process.exit(0);
}

let written = 0;
const relations = [];
const characters = [];
for (let i = 0; i < plan.length; i += BATCH) {
  const chunk = plan.slice(i, i + BATCH);
  written += await upsert('titles', chunk.map(toRow), 'id');
  for (const t of chunk) {
    for (const r of t.relations ?? []) relations.push({ anime_id: t.anilistId, related_id: r.id, relation_type: r.type });
    (t.characters ?? []).slice(0, 12).forEach((c, idx) =>
      characters.push({ anime_id: t.anilistId, position: idx + 1, name: c.name, image: c.img ?? null, role: c.role ?? null }),
    );
  }
  console.log(`  ${Math.min(i + BATCH, plan.length)}/${plan.length} · titles: ${written}`);
  await sleep(150);
}

for (let i = 0; i < relations.length; i += BATCH) {
  await upsert('title_relations', relations.slice(i, i + BATCH), 'anime_id,related_id');
}
console.log(`title_relations: ${relations.length}`);
for (let i = 0; i < characters.length; i += BATCH) {
  await upsert('title_characters', characters.slice(i, i + BATCH), 'anime_id,position');
}
console.log(`title_characters: ${characters.length}`);
console.log(`готово: ${written} тайтлов${DRY_RUN ? ' (dry-run, БД не тронута)' : ''}`);
