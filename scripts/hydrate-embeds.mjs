/* Hydrator v3 (ТЗ «23 блока», блок 11): наполняет кэш только там, где это действительно нужно.
   Режимы (HYDRATE_MODE):
     gaps (по умолчанию) — резолвим только серии без источников (availability=demo)
                           и ep1, если его нет в кэше; остальное работает через
                           cache/synth/guess — их не трогаем (мгновенно).
     live               — принудительно обновляем живыми резолвами все серии,
                          у которых нет прямого кэша (cache): медленно, но даёт
                          реальные kodik/cvh/aniboom источники вместо guess.
   Опции блока 11 (по умолчанию ВКЛЮЧЕНЫ):
     SKIP_UPCOMING=1         — пропуск status:'upcoming' (серии ещё не вышли);
     SKIP_NO_SHIKIMORI=1     — пропуск тайтлов без shikimori.id;
     HYDRATE_CONCURRENCY=24  — параллельность (было 12);
     HYDRATE_TIMEOUT_MS=15000— таймаут запроса на серию;
     негативный кэш .cache/hydrate-skipped.json — тайтлы, где резолвы не дали
       источников; сброс: --reset-skipped;
     приоритет: сначала тайтлы с favourites >= 1000;
     прогресс-лог каждые 100 серий + ETA; отчёт .cache/hydrate-report.json;
     ошибка одного тайтла не роняет процесс.
   Запуск: npm run hydrate   (нужен запущенный сервер) */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const MODE = process.env.HYDRATE_MODE ?? 'gaps';
const CONC = Number(process.env.HYDRATE_CONCURRENCY ?? process.env.CONCURRENCY ?? 24);
const TIMEOUT_MS = Number(process.env.HYDRATE_TIMEOUT_MS ?? 15000);
const SKIP_UPCOMING = (process.env.SKIP_UPCOMING ?? '1') !== '0';
const SKIP_NO_SHIKIMORI = (process.env.SKIP_NO_SHIKIMORI ?? '1') !== '0';
const SKIPPED_FILE = '.cache/hydrate-skipped.json';

if (process.argv.includes('--reset-skipped')) {
  mkdirSync('.cache', { recursive: true });
  writeFileSync(SKIPPED_FILE, '[]');
  console.log('негативный кэш сброшен:', SKIPPED_FILE);
}

try {
  await fetch(`${BASE}/api/schedule`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error('✗ Сервер не отвечает на ' + BASE);
  console.error('  Запустите в другом терминале: npm run dev (или npm run start) и повторите.');
  process.exit(1);
}

const xml = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text()).catch(() => '');
let slugs = [...new Set([...xml.matchAll(/\/anime\/([a-z0-9-]+)</g)].map((m) => m[1]))];

/* фильтры и приоритет по каталогу (блок 11) */
const titles = JSON.parse(readFileSync('lib/data/titles.json', 'utf8'));
const bySlug = new Map(titles.map((t) => [t.slug, t]));
let skippedUpcoming = 0;
let skippedNoShikimori = 0;
const skippedNeg = new Set(existsSync(SKIPPED_FILE) ? JSON.parse(readFileSync(SKIPPED_FILE, 'utf8')) : []);
let skippedNegative = 0;
{
  const kept = [];
  for (const slug of slugs) {
    const t = bySlug.get(slug);
    if (SKIP_UPCOMING && t?.status === 'upcoming') { skippedUpcoming++; continue; }
    if (SKIP_NO_SHIKIMORI && !t?.shikimori?.id) { skippedNoShikimori++; continue; }
    if (skippedNeg.has(slug)) { skippedNegative++; continue; }
    kept.push(slug);
  }
  slugs = kept;
}
console.log(
  `режим: ${MODE} · тайтлов: ${slugs.length} · параллельность: ${CONC} · таймаут: ${TIMEOUT_MS} мс` +
    ` · пропущено: upcoming ${skippedUpcoming}, без shikimori ${skippedNoShikimori}, негативный кэш ${skippedNegative}`,
);

/* 1) быстрая карта доступности через /api/availability (чистое чтение кэша) */
const plan = [];
{
  const queue = [...slugs];
  const workers = Array.from({ length: 16 }, async () => {
    while (queue.length) {
      const slug = queue.shift();
      if (!slug) break;
      try {
        const j = await fetch(`${BASE}/api/availability/${slug}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then((r) => (r.ok ? r.json() : null));
        if (!j?.episodes) continue;
        const kinds = Object.entries(j.episodes);
        let eps;
        if (MODE === 'live') eps = kinds.filter(([, k]) => k !== 'cache').map(([ep]) => Number(ep));
        else eps = kinds.filter(([, k]) => k === 'demo').map(([ep]) => Number(ep));
        if (eps.length) plan.push({ slug, episodes: eps });
      } catch {
        /* один тайтл не роняет процесс */
      }
    }
  });
  await Promise.all(workers);
}
// приоритет: favourites >= 1000 первыми (блок 11)
plan.sort((a, b) => {
  const fa = bySlug.get(a.slug)?.favourites ?? 0;
  const fb = bySlug.get(b.slug)?.favourites ?? 0;
  const pa = fa >= 1000 ? 0 : 1;
  const pb = fb >= 1000 ? 0 : 1;
  return pa - pb || fb - fa;
});
const total = plan.reduce((a, p) => a + p.episodes.length, 0);
console.log(`требуют резолва: ${plan.length} тайтлов, ${total} серий${MODE === 'gaps' ? ' (только дыры)' : ' (live-обновление)'}`);
if (!total) {
  console.log('Кэш полон: дыр нет. Живое обновление: HYDRATE_MODE=live npm run hydrate');
}

/* 2) резолвы с прогрессом каждые 100 и ETA */
const tasks = plan.flatMap((p) => p.episodes.map((ep) => [p.slug, ep]));
let done = 0;
let ok = 0;
let fail = 0;
const slugOk = new Map();
const started = Date.now();
const q = [...tasks];
if (total) {
  const workers = Array.from({ length: CONC }, async () => {
    while (q.length) {
      const task = q.shift();
      if (!task) break;
      const [slug, ep] = task;
      try {
        const j = await fetch(`${BASE}/api/providers/${slug}/${ep}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then((r) => (r.ok ? r.json() : null));
        const real = (j?.sources ?? []).filter((s) => s.providerId !== 'demo');
        if (real.length) {
          ok++;
          slugOk.set(slug, (slugOk.get(slug) ?? 0) + 1);
        } else fail++;
      } catch {
        fail++;
      }
      done++;
      if (done % 100 === 0 || done === total) {
        const sec = (Date.now() - started) / 1000;
        const eta = ((sec / done) * (total - done)).toFixed(0);
        process.stdout.write(`\r${done}/${total} · ок:${ok} пустых:${fail} · ETA ${eta} c   `);
      }
    }
  });
  await Promise.all(workers);
}
console.log('');

/* 3) негативный кэш: тайтлы, где ни одна серия не дала источников */
for (const p of plan) {
  if ((slugOk.get(p.slug) ?? 0) === 0) skippedNeg.add(p.slug);
}
mkdirSync('.cache', { recursive: true });
writeFileSync(SKIPPED_FILE, JSON.stringify([...skippedNeg]));
const report = {
  generatedAt: new Date().toISOString(),
  mode: MODE,
  titlesPlanned: plan.length,
  episodesTotal: total,
  ok,
  fail,
  skippedUpcoming,
  skippedNoShikimori,
  skippedNegative,
  negativeCacheSize: skippedNeg.size,
  seconds: Math.round((Date.now() - started) / 1000),
};
writeFileSync('.cache/hydrate-report.json', JSON.stringify(report, null, 2));
console.log(`hydrator готов: ок=${ok} пустых=${fail} за ${report.seconds} c · отчёт .cache/hydrate-report.json`);
console.log('кэш само-расширяется и при обычных заходах на сайт (cache-first + write on miss).');
