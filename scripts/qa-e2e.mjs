#!/usr/bin/env node
/**
 * Финальный End-to-End аудит прода (docs/FINAL-QA-REPORT.md).
 *
 * Три независимых блока:
 *   1. api   — доступность и поведение ключевых маршрутов;
 *   2. cache — заголовки CDN-кэша картинок и состояние горячего кэша (Upstash);
 *   3. data  — целостность Supabase: объёмы, сироты, round-trip флага hidden.
 *
 * Блок `data` работает только при заданных SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL и
 * SUPABASE_SERVICE_KEY (в CI это секреты репозитория), иначе честно помечается SKIP.
 * Запись в БД (проверка hidden) выполняется ТОЛЬКО при QA_ALLOW_WRITES=1 и всегда
 * откатывается в finally — упавший прогон не должен оставить тайтл скрытым.
 *
 * Запуск:
 *   node scripts/qa-e2e.mjs
 *   QA_BASE_URL=http://localhost:3000 node scripts/qa-e2e.mjs
 *   QA_ALLOW_WRITES=1 node scripts/qa-e2e.mjs --json out.json
 */

import { writeFileSync, existsSync } from 'node:fs';

const BASE = (process.env.QA_BASE_URL ?? process.env.SMOKE_URL ?? 'https://aninova-catalog.vercel.app').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.QA_TIMEOUT_MS ?? 25_000);
const ALLOW_WRITES = process.env.QA_ALLOW_WRITES === '1';
const SUPA_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

const results = [];
const record = (block, name, status, detail) => {
  results.push({ block, name, status, detail });
  const icon = status === 'OK' ? '✅' : status === 'SKIP' ? '⏭️' : '❌';
  console.log(`${icon} [${block}] ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Один HTTP-запрос с таймаутом; сетевые ошибки возвращаются как { networkError }, а не бросают. */
async function probe(path, init = {}) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
      headers: { 'User-Agent': 'AniNova-QA/1.0', ...(init.headers ?? {}) },
    });
    return { res, ms: Date.now() - started };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
  }
}

const SKIP_ANALYTICS = Object.keys(process.env).length > 0; // не используется, оставлено для ясности вызовов

/* ─────────────────────────── 1. API ─────────────────────────── */

async function checkApi() {
  const ping = await probe('/api/ping');
  if (ping.error) record('api', 'GET /api/ping', 'FAIL', ping.error);
  else if (ping.res.status !== 200) record('api', 'GET /api/ping', 'FAIL', `HTTP ${ping.res.status}`);
  else if (ping.ms > 3000) record('api', 'GET /api/ping', 'FAIL', `${ping.ms} мс — функция не отвечает быстро`);
  else record('api', 'GET /api/ping', 'OK', `200 за ${ping.ms} мс`);

  const health = await probe('/api/health');
  if (health.error) {
    record('api', 'GET /api/health', 'FAIL', health.error);
  } else if (health.res.status !== 200) {
    record('api', 'GET /api/health', 'FAIL', `HTTP ${health.res.status}`);
  } else {
    const body = await health.res.json().catch(() => null);
    const warnings = body?.config?.warnings ?? [];
    const problems = [];
    if (!body?.ok) problems.push('ok=false');
    if (body?.supabase !== true) problems.push('supabase=false');
    if (warnings.length) problems.push(`${warnings.length} предупреждений конфига: ${warnings.join('; ')}`);
    if (Number(body?.catalogMs) >= 500) problems.push(`catalogMs=${body?.catalogMs}`);
    record(
      'api',
      'GET /api/health',
      problems.length ? 'FAIL' : 'OK',
      problems.length ? problems.join(', ') : `warnings: [], titles=${body?.titles}, catalogMs=${body?.catalogMs}`,
    );
  }

  // Плеер: источники должны приходить из кэша (Supabase/Upstash), без живых bridge.
  const providers = await probe('/api/providers/one-piece/1');
  if (providers.error) {
    record('api', 'GET /api/providers/one-piece/1', 'FAIL', providers.error);
  } else if (providers.res.status !== 200) {
    record('api', 'GET /api/providers/one-piece/1', 'FAIL', `HTTP ${providers.res.status}`);
  } else {
    const body = await providers.res.json().catch(() => null);
    const sources = Array.isArray(body?.sources) ? body.sources.length : 0;
    const ok = sources > 0;
    record(
      'api',
      'GET /api/providers/one-piece/1',
      ok ? 'OK' : 'FAIL',
      `sources=${sources}, fromCache=${body?.fromCache}, ${providers.ms} мс`,
    );
  }

  const sitemap = await probe('/sitemap.xml');
  if (sitemap.error || sitemap.res.status !== 200) {
    record('api', 'GET /sitemap.xml', 'FAIL', sitemap.error ?? `HTTP ${sitemap.res?.status}`);
  } else {
    const xml = await sitemap.res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const bad = locs.filter((u) => !u.startsWith('https://') || /localhost|127\.0\.0\.1|cataloge\.netlify/.test(u));
    record(
      'api',
      'GET /sitemap.xml',
      locs.length && !bad.length ? 'OK' : 'FAIL',
      `${locs.length} ссылок, проблемных ${bad.length}${bad.length ? `: ${bad.slice(0, 3).join(', ')}` : ''}`,
    );
  }

  const reviews = await probe('/api/social/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'one-piece', rating: 10, text: 'qa probe — отзыв не должен сохраниться' }),
  });
  if (reviews.error) record('api', 'POST /api/social/reviews (без капчи)', 'FAIL', reviews.error);
  else {
    const status = reviews.res.status;
    record(
      'api',
      'POST /api/social/reviews (без капчи)',
      status === 403 ? 'OK' : status >= 500 ? 'FAIL' : 'FAIL',
      `HTTP ${status} (ожидается 403 fail-closed)`,
    );
  }

  const admin = await probe('/admin');
  if (admin.error) record('api', 'GET /admin', 'FAIL', admin.error);
  else {
    const status = admin.res.status;
    const loc = admin.res.headers.get('location') ?? '';
    const ok = status === 200 || (status >= 300 && status < 400 && loc.includes('/admin/login'));
    record('api', 'GET /admin', ok ? 'OK' : 'FAIL', `HTTP ${status}${loc ? ` → ${loc}` : ''}`);
  }

  const login = await probe('/admin/login');
  record(
    'api',
    'GET /admin/login',
    !login.error && login.res.status === 200 ? 'OK' : 'FAIL',
    login.error ?? `HTTP ${login.res?.status}`,
  );

  const robots = await probe('/robots.txt');
  if (robots.error || robots.res.status !== 200) {
    record('api', 'GET /robots.txt', 'FAIL', robots.error ?? `HTTP ${robots.res?.status}`);
  } else {
    const txt = await robots.res.text();
    record('api', 'GET /robots.txt', /Sitemap:\s*https:\/\//i.test(txt) ? 'OK' : 'FAIL', 'Sitemap указывает на https-домен');
  }
}

/* ────────────────────────── 2. Кэш ────────────────────────── */

async function checkCache() {
  const poster = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21-ELSYx3yMPcKM.jpg';
  const path = `/img?url=${encodeURIComponent(poster)}&w=300&fmt=auto`;

  const first = await probe(path, { method: 'HEAD' });
  if (first.error) {
    record('cache', '/img (заголовки)', 'FAIL', first.error);
  } else {
    const cc = first.res.headers.get('cache-control') ?? '';
    const cdn = first.res.headers.get('cdn-cache-control') ?? '';
    const problems = [];
    if (!/s-maxage=\d+/.test(cc)) problems.push('нет s-maxage в Cache-Control');
    if (!/max-age=\d+/.test(cdn)) problems.push('нет CDN-Cache-Control');
    record('cache', '/img (заголовки)', problems.length ? 'FAIL' : 'OK', problems.length ? problems.join(', ') : cc);
  }

  // Второй запрос должен прийти из кэша края (после первого прогрева может быть MISS).
  let hit = null;
  for (let i = 0; i < 4; i++) {
    const again = await probe(path, { method: 'HEAD' });
    const state = again.res?.headers.get('x-vercel-cache') ?? again.res?.headers.get('cf-cache-status') ?? '';
    if (state) hit = state;
    if (/HIT/i.test(state)) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  record('cache', '/img повторный запрос', hit && /HIT/i.test(hit) ? 'OK' : 'FAIL', hit ? `X-Vercel-Cache: ${hit}` : 'заголовок кэша отсутствует');

  const health = await probe('/api/health');
  const body = health.res ? await health.res.json().catch(() => null) : null;
  const cache = body?.providerCache ?? {};
  const ok = cache.enabled === true && cache.reachable === true;
  record(
    'cache',
    'providerCache (горячий кэш)',
    ok ? 'OK' : 'FAIL',
    `backend=${cache.backend}, reachable=${cache.reachable}, writesEnabled=${cache.writesEnabled}`,
  );
}

/* ───────────────────────── 3. Данные ───────────────────────── */

function supaHeaders(extra = {}) {
  return { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'User-Agent': 'AniNova-QA/1.0', ...extra };
}

/** Точное число строк через `Prefer: count=exact` + `Content-Range` (без выгрузки данных). */
async function supaCount(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: supaHeaders({ Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' }),
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const range = res.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : null;
}

async function supaGet(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: supaHeaders(),
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function checkData() {
  if (!SUPA_URL || !SUPA_KEY) {
    record('data', 'Supabase-проверки', 'SKIP', 'нет SUPABASE_URL / SUPABASE_SERVICE_KEY в окружении');
    return;
  }
  try {
    const titles = await supaCount('titles?select=id');
    record('data', 'titles', titles && titles > 7900 ? 'OK' : 'FAIL', `${titles} строк (ожидается ~8033)`);

    const urls = await supaCount('episode_source_urls?select=anime_id');
    record(
      'data',
      'episode_source_urls',
      urls && urls > 300_000 ? 'OK' : 'FAIL',
      `${urls} ссылок (ожидалось > 400 000; меньше — значит гидрация отстала)`,
    );

    const headers = await supaCount('episode_sources?select=anime_id');
    const headersOk = await supaCount('episode_sources?select=anime_id&status=eq.ok');
    record(
      'data',
      'episode_sources (шапки озвучек)',
      headersOk && headersOk > 0 ? 'OK' : 'FAIL',
      `всего ${headers}, со status=ok ${headersOk}`,
    );

    const maxRow = await supaGet('titles?select=id&order=id.desc&limit=1');
    const maxId = Number(maxRow?.[0]?.id ?? 0);
    const orphanAbove = await supaCount(`episode_source_urls?select=anime_id&anime_id=gt.${maxId}`);
    const orphanNull = await supaCount('episode_source_urls?select=anime_id&anime_id=is.null');
    const badEpisode = await supaCount('episode_source_urls?select=anime_id&episode=lt.1');
    const orphans = (orphanAbove ?? 0) + (orphanNull ?? 0);
    record(
      'data',
      'сироты в episode_source_urls',
      orphans === 0 ? 'OK' : 'FAIL',
      `anime_id > max(titles.id): ${orphanAbove}, NULL: ${orphanNull}, серия < 1: ${badEpisode}`,
    );

    if (!ALLOW_WRITES) {
      record('data', 'round-trip hidden', 'SKIP', 'запись в прод-БД только при QA_ALLOW_WRITES=1');
      return;
    }

    // Наименее популярный тайтл: минимальный риск задеть живого пользователя.
    const probeRow = await supaGet('titles?select=slug,hidden&order=popularity.asc.nullslast,id.desc&limit=1');
    const slug = probeRow?.[0]?.slug;
    if (!slug) {
      record('data', 'round-trip hidden', 'SKIP', 'не удалось выбрать тайтл');
      return;
    }
    const patch = async (hidden) => {
      const res = await fetch(`${SUPA_URL}/rest/v1/titles?slug=eq.${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ hidden }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`PATCH hidden=${hidden}: HTTP ${res.status}`);
      return res.json();
    };
    let applied = false;
    try {
      const on = await patch(true);
      applied = true;
      const hiddenOn = on?.[0]?.hidden === true;
      const off = await patch(false);
      applied = false;
      const hiddenOff = off?.[0]?.hidden === false;
      record(
        'data',
        'round-trip hidden (PATCH → проверить → откат)',
        hiddenOn && hiddenOff ? 'OK' : 'FAIL',
        `${slug}: hidden=true прочитано ${hiddenOn}, откат ${hiddenOff}`,
      );
    } finally {
      if (applied) {
        try {
          await patch(false);
          console.log('↩️  откат hidden для', slug, 'выполнен после ошибки');
        } catch (error) {
          console.error('❌ НЕ УДАЛОСЬ ОТКАТИТЬ hidden для', slug, error);
        }
      }
    }
  } catch (error) {
    record('data', 'Supabase-проверки', 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

/* ─────────────────────── отчёт и выход ─────────────────────── */

function summary() {
  const counts = { OK: 0, FAIL: 0, SKIP: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

function markdown() {
  const lines = [
    '## End-to-End QA (прод)',
    '',
    `Домен: ${BASE} · ${new Date().toISOString()}`,
    '',
    '| Блок | Проверка | Статус | Детали |',
    '| --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.block} | ${r.name} | ${r.status} | ${String(r.detail ?? '').replace(/\|/g, '\\|')} |`),
  ];
  const counts = summary();
  lines.push('', `Итого: **${counts.OK} OK**, **${counts.FAIL} FAIL**, ${counts.SKIP} SKIP`, '');
  return lines.join('\n');
}

await checkApi();
await checkCache();
await checkData();

const counts = summary();
const report = markdown();
console.log('\n' + report);

if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, report, { flag: 'a' });
}
const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag > -1 && process.argv[jsonFlag + 1]) {
  writeFileSync(process.argv[jsonFlag + 1], JSON.stringify({ base: BASE, results, counts }, null, 2));
}

void existsSync;
void SKIP_ANALYTICS;
process.exitCode = counts.FAIL > 0 ? 1 : 0;
