/* Перенос файлового кэша источников в Supabase (аудит 2026-10, задача 4).
 *
 * Зачем: .cache/providers-resolve-cache.json весит 97,6 МБ и читается рантаймом —
 * замер показывает 675 мс на чтение, 1038 мс на JSON.parse и 370 МБ RSS процесса
 * (heapUsed 318 МБ) на ОДНОМ резолве. Функция Vercel ограничена 1024 МБ, то есть
 * несколько параллельных запросов дают memory pressure и риск таймаута. Плюс файл
 * трекается в git и раздувает pack.
 *
 * Замер содержимого (12.10.2026, фактический файл):
 *   79 426 записей, все ключи вида ep:<slug>:<n>;
 *   79 424 записи содержат ПРЯМЫЕ источники (isDirectProviderSource) — то есть
 *     кэш практически чистый, мусора почти нет;
 *   336 515 прямых источников: kodik 334 471 · cvh 1 214 · aniboom 850;
 *     guessed 20, synthesized 0, demo 0;
 *   5 778 тайтлов, 30 202 уникальных озвучки, 336 515 per-episode ссылок;
 *   медианная длина embed_url 74 байта (max 238).
 *
 * Оценка размера в БД (при переносе ТОЛЬКО прямых записей):
 *   episode_sources      ~30 202 строки ≈ 4,4 МБ
 *   episode_source_urls  ~336 515 строк ≈ 36,8 МБ JSON / ~38,5 МБ в Postgres + индексы
 *   итого ≈ 45–80 МБ из 500 МБ Supabase Free (9–16 %) — запас есть, но не бесконечный,
 *   поэтому per-episode строки пишутся с лимитом MAX_EPISODE_URLS на озвучку.
 *
 * Почему НЕ в Redis: весь кэш в компактном виде — 37,9 МБ при среднем значении 500 Б.
 * Формально это влезает в db_memory_threshold=64 МиB (LIMITS.md), но заливать 79 426
 * ключей разом нельзя: порог памяти базы отдельный и ниже общего лимита тарифа,
 * а 500k команд/мес расходуются одним таким сидом почти на треть. Redis остаётся
 * ГОРЯЧИМ кэшем с TTL (lib/providers/cache-kv.ts), а не хранилищем сида.
 *
 * Запуск:
 *   node scripts/import-provider-cache-to-db.mjs --dry-run            # оценка, без записи
 *   node scripts/import-provider-cache-to-db.mjs --limit 200          # порция тайтлов
 *   node scripts/import-provider-cache-to-db.mjs                      # полный перенос
 *   node scripts/import-provider-cache-to-db.mjs --verify             # сверка с БД
 * Резюме (resumable): .cache/import-provider-cache-checkpoint.json — повторный запуск
 * продолжает с непрошенных тайтлов, уже записанные строки перезаписываются идемпотентно.
 *
 * Секреты только из env. Без SUPABASE_SERVICE_KEY — exit 2, ничего не ломает.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CACHE_FILE = process.env.KODIK_CACHE_FILE ?? '.cache/providers-resolve-cache.json';
const TITLES_FILE = process.env.TITLES_FILE ?? 'lib/data/titles.json';
const CHECKPOINT = process.env.CHECKPOINT_FILE ?? '.cache/import-provider-cache-checkpoint.json';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argVal = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split('=')[1] : dflt;
};

const DRY_RUN = has('--dry-run');
const VERIFY = has('--verify');
const LIMIT = Number(argVal('limit', process.env.LIMIT ?? 0));
const MAX_EPISODE_URLS = Number(process.env.MAX_EPISODE_URLS ?? 1200);
const BATCH = Number(process.env.IMPORT_BATCH ?? 1000);
const PAUSE_MS = Number(process.env.IMPORT_PAUSE_MS ?? 120);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/* Тот же критерий, что в lib/providers/cache.ts:isDirectProviderSource. */
function isDirect(s) {
  return Boolean(s) && s.providerId !== 'demo' && !s.guessed && !s.synthesized && !/:s\d+$/.test(String(s.id ?? ''));
}

/**
 * translation_id — часть первичного ключа (anime_id, provider, translation_id),
 * поэтому он обязан быть непустым и стабильным.
 * В кэше у 13 669 источников translationId пустой, но номер озвучки лежит в `id`:
 *   kodik:cache:610     → 610
 *   cvh:cache:2:11      → 2
 *   aniboom:cache:0:11  → 0
 * Если и там ничего — берём транслитерацию подписи (детерминированно).
 */
function translationIdOf(source) {
  const raw = String(source.translationId ?? '').trim();
  if (raw) return raw.slice(0, 64);
  const parts = String(source.id ?? '').split(':').filter(Boolean);
  const numeric = parts.filter((p) => /^\d+$/.test(p));
  if (numeric.length) return numeric[0].slice(0, 64);
  const slug = String(source.label ?? 'source')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return slug || 'source';
}

const translationTypeOf = (source) => (source.voice === 'subtitles' ? 'sub' : 'voice');

function loadCheckpoint() {
  try {
    return JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
  } catch {
    return { done: [] };
  }
}
function saveCheckpoint(cp) {
  if (DRY_RUN) return;
  mkdirSync('.cache', { recursive: true });
  writeFileSync(CHECKPOINT, JSON.stringify({ ...cp, at: new Date().toISOString(), done: [...new Set(cp.done)] }));
}

async function upsert(table, conflict, rows) {
  if (!rows.length) return 0;
  if (DRY_RUN) return rows.length;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${table} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    written += batch.length;
    if (PAUSE_MS) await sleep(PAUSE_MS);
  }
  return written;
}

async function countRows(table) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=anime_id&limit=1`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: 'count=exact', Range: '0-0' },
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const range = res.headers.get('content-range') ?? '';
  const total = range.split('/')[1];
  return Number.isFinite(Number(total)) ? Number(total) : null;
}

/* --------------------------------- данные -------------------------------- */

log(`читаю ${CACHE_FILE} …`);
const t0 = Date.now();
const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
log(`прочитано за ${Date.now() - t0} мс, записей ${Object.keys(cache).length}, RSS ${(process.memoryUsage().rss / 1048576) | 0} МБ`);

const titles = JSON.parse(readFileSync(TITLES_FILE, 'utf8'));
const animeIdBySlug = new Map(titles.map((t) => [t.slug, t.anilistId]));

/** slug → Map(ep → { at, sources }): `at` нужен для checked_at в БД. */
const bySlug = new Map();
for (const [key, entry] of Object.entries(cache)) {
  const m = key.match(/^ep:(.+):(\d+)$/);
  if (!m) continue;
  const sources = (entry?.sources?.sources ?? []).filter(isDirect);
  if (!sources.length) continue;
  const slug = m[1];
  const ep = Number(m[2]);
  if (!Number.isFinite(ep) || ep < 1) continue;
  if (!bySlug.has(slug)) bySlug.set(slug, new Map());
  bySlug.get(slug).set(ep, { at: Number(entry?.at) || Date.now(), sources });
}

if (VERIFY) {
  if (!SUPA_URL || !SUPA_KEY) {
    log('SUPABASE_SERVICE_KEY не задан — сверка невозможна.');
    process.exit(2);
  }
  const [srcCount, urlCount] = await Promise.all([countRows('episode_sources'), countRows('episode_source_urls')]);
  log('\n=== сверка ===');
  log(`в файле : тайтлов ${bySlug.size}, озвучек (оценка) — см. dry-run, per-episode ссылок — см. dry-run`);
  log(`в БД    : episode_sources ${srcCount ?? '?'}, episode_source_urls ${urlCount ?? '?'}`);
  const sample = [...bySlug.keys()].slice(0, 3);
  for (const slug of sample) {
    const id = animeIdBySlug.get(slug);
    if (!id) continue;
    const res = await fetch(`${SUPA_URL}/rest/v1/episode_source_urls?anime_id=eq.${id}&select=episode&order=episode.desc&limit=1`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    const rows = res && res.ok ? await res.json() : null;
    const inFile = Math.max(...bySlug.get(slug).keys());
    log(`  ${slug}: в файле max ep ${inFile}, в БД max ep ${rows?.[0]?.episode ?? 'нет строк'}`);
  }
  process.exit(0);
}

/* ------------------------------- перенос -------------------------------- */

const cp = loadCheckpoint();
const done = new Set(cp.done ?? []);
const slugs = [...bySlug.keys()].filter((s) => animeIdBySlug.has(s) && !done.has(s));
const skippedNoTitle = [...bySlug.keys()].filter((s) => !animeIdBySlug.has(s));
const plan = LIMIT > 0 ? slugs.slice(0, LIMIT) : slugs;

log(`\nплан: ${plan.length} тайтлов (в кэше ${bySlug.size}, в чекпоинте ${done.size}, без пары в titles.json ${skippedNoTitle.length})`);
if (skippedNoTitle.length) log(`  примеры без anime_id: ${skippedNoTitle.slice(0, 5).join(', ')}`);
if (!plan.length) {
  log('всё уже перенесено. Удалите ' + CHECKPOINT + ' для повторного полного прохода.');
  process.exit(0);
}

/* dry-run работает без БД: он и нужен, чтобы оценить объём ДО переноса.
   Реальная запись без секретов невозможна. */
if (!SUPA_URL || !SUPA_KEY) {
  if (!DRY_RUN) {
    log('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY не заданы — перенос невозможен.');
    log('Секреты берутся только из env; в коде, логах и отчёте их быть не должно.');
    process.exit(2);
  }
  log('(dry-run: БД не задана, считаю только объём)');
}

const stats = { titles: 0, sources: 0, urls: 0, skippedUrls: 0, collisions: 0 };
const seenTranslation = new Set();

for (let i = 0; i < plan.length; i++) {
  const slug = plan[i];
  const animeId = animeIdBySlug.get(slug);
  const eps = bySlug.get(slug);

  /** provider|translation_id → строка episode_sources (озвучка тайтла) */
  const translations = new Map();
  /** provider|translation_id → Map(ep → url) */
  const perTranslationEpisodes = new Map();

  for (const [ep, rec] of eps) {
    for (const s of rec.sources) {
      const tid = translationIdOf(s);
      const tkey = `${s.providerId}|${tid}`;
      if (!translations.has(tkey)) {
        const globalKey = `${animeId}|${tkey}`;
        if (seenTranslation.has(globalKey)) stats.collisions++;
        seenTranslation.add(globalKey);
        translations.set(tkey, {
          anime_id: animeId,
          provider: s.providerId,
          translation_id: tid,
          translation_title: String(s.label ?? '').slice(0, 200) || null,
          translation_type: translationTypeOf(s),
          kind: s.kind === 'file' ? 'file' : 'embed',
          embed_url: s.embedUrl ?? s.files?.[0]?.url ?? null,
          episodes_count: null,
          checked_at: new Date(rec.at).toISOString(),
          status: 'ok',
        });
        perTranslationEpisodes.set(tkey, new Map());
      }
      const url = s.embedUrl ?? s.files?.[0]?.url ?? null;
      if (url) perTranslationEpisodes.get(tkey).set(ep, url);
    }
  }

  const sourceRows = [];
  const urlRows = [];
  for (const [tkey, row] of translations) {
    const epMap = perTranslationEpisodes.get(tkey);
    row.episodes_count = epMap.size || null;
    sourceRows.push(row);
    /* Лимит памяти БД: берём ПОСЛЕДНИЕ серии — их смотрят чаще всего. */
    const numbers = [...epMap.keys()].sort((a, b) => b - a);
    const kept = numbers.slice(0, MAX_EPISODE_URLS);
    stats.skippedUrls += numbers.length - kept.length;
    for (const n of kept) {
      urlRows.push({
        anime_id: animeId,
        provider: row.provider,
        translation_id: row.translation_id,
        episode: n,
        kind: row.kind,
        embed_url: epMap.get(n),
        checked_at: row.checked_at,
        status: 'ok',
      });
    }
  }

  stats.titles++;
  stats.sources += await upsert('episode_sources', 'anime_id,provider,translation_id', sourceRows);
  stats.urls += await upsert('episode_source_urls', 'anime_id,provider,translation_id,episode', urlRows);

  cp.done = [...(cp.done ?? []), slug];
  if (i % 50 === 0 || i === plan.length - 1) saveCheckpoint(cp);
  if (i % 100 === 0 || i === plan.length - 1) {
    log(`  ${i + 1}/${plan.length} тайтлов · озвучек ${stats.sources} · ссылок ${stats.urls} · RSS ${(process.memoryUsage().rss / 1048576) | 0} МБ`);
  }
}

saveCheckpoint(cp);
log(`\nготово: ${JSON.stringify(stats)}${DRY_RUN ? ' (dry-run — в БД ничего не записано)' : ''}`);
log(`память процесса на пике: RSS ${(process.memoryUsage().rss / 1048576) | 0} МБ, heapUsed ${(process.memoryUsage().heapUsed / 1048576) | 0} МБ`);
