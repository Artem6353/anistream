/* Hydrator v2: наполняет кэш только там, где это действительно нужно.
   Режимы (HYDRATE_MODE):
     gaps (по умолчанию) — резолвим только серии без источников (availability=demo)
                           и ep1, если его нет в кэше; всё остальное уже работает
                           через cache/synth/guess — их не трогаем (мгновенно).
     live               — принудительно обновляем живыми резолвами все серии,
                          у которых нет прямого кэша (cache): медленно, но даёт
                          реальные kodik/cvh/aniboom источники вместо guess.
   Настройки: CONCURRENCY (по умолч. 12), BASE, EPISODES=all|1 (для live-режима).
   Запуск: npm run hydrate   (нужен запущенный сервер) */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const MODE = process.env.HYDRATE_MODE ?? 'gaps';
const CONC = Number(process.env.CONCURRENCY ?? 12);

try {
  await fetch(`${BASE}/api/schedule`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error('✗ Сервер не отвечает на ' + BASE);
  console.error('  Запустите в другом терминале: npm run dev (или npm run start) и повторите.');
  process.exit(1);
}

const xml = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text()).catch(() => '');
let slugs = [...new Set([...xml.matchAll(/\/anime\/([a-z0-9-]+)</g)].map((m) => m[1]))];
console.log(`режим: ${MODE} · тайтлов: ${slugs.length} · параллельность: ${CONC}`);

/* 1) быстрая карта доступности через /api/availability (чистое чтение кэша) */
const plan = []; // {slug, episodes:[...]}
{
  const queue = [...slugs];
  const workers = Array.from({ length: 16 }, async () => {
    while (queue.length) {
      const slug = queue.shift();
      try {
        const j = await fetch(`${BASE}/api/availability/${slug}`).then((r) => (r.ok ? r.json() : null));
        if (!j?.episodes) continue;
        const kinds = Object.entries(j.episodes); // [ep, kind]
        let eps;
        if (MODE === 'live') eps = kinds.filter(([, k]) => k !== 'cache').map(([ep]) => Number(ep));
        else eps = kinds.filter(([, k]) => k === 'demo').map(([ep]) => Number(ep));
        if (eps.length) plan.push({ slug, episodes: eps });
      } catch {}
    }
  });
  await Promise.all(workers);
}
const total = plan.reduce((a, p) => a + p.episodes.length, 0);
console.log(`требуют резолва: ${plan.length} тайтлов, ${total} серий${MODE === 'gaps' ? ' (только дыры)' : ' (live-обновление)'}`);
if (!total) {
  console.log('Кэш полон: дыр нет. Живое обновление: HYDRATE_MODE=live npm run hydrate');
  process.exit(0);
}

/* 2) резолвы с прогрессом и ETA */
const tasks = plan.flatMap((p) => p.episodes.map((ep) => [p.slug, ep]));
let done = 0;
let ok = 0;
let fail = 0;
const started = Date.now();
const q = [...tasks];
const workers = Array.from({ length: CONC }, async () => {
  while (q.length) {
    const [slug, ep] = q.shift();
    try {
      const j = await fetch(`${BASE}/api/providers/${slug}/${ep}`).then((r) => (r.ok ? r.json() : null));
      const real = (j?.sources ?? []).filter((s) => s.providerId !== 'demo');
      if (real.length) ok++;
      else fail++;
    } catch {
      fail++;
    }
    done++;
    if (done % 25 === 0 || done === total) {
      const sec = (Date.now() - started) / 1000;
      const eta = ((sec / done) * (total - done)).toFixed(0);
      process.stdout.write(`\r${done}/${total} · ок:${ok} пустых:${fail} · ETA ${eta} c   `);
    }
  }
});
await Promise.all(workers);
console.log('');
console.log(`hydrator готов: ок=${ok} пустых=${fail} за ${((Date.now() - started) / 1000).toFixed(0)} c`);
console.log('кэш само-расширяется и при обычных заходах на сайт (cache-first + write on miss).');
