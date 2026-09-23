/* Warmer: «у тайтла есть источники?» — по кэшу через /api/availability (быстро, без резолвов).
   Запуск: npm run warm   (нужен запущенный сервер; BASE=… при другом порте) */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const LIMIT = Number(process.env.LIMIT ?? 0);
const CONC = Number(process.env.CONCURRENCY ?? 12);

try {
  await fetch(`${BASE}/api/schedule`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error('✗ Сервер не отвечает на ' + BASE);
  console.error('  1) Откройте ВТОРОЙ терминал и выполните: npm run dev (или npm run start)');
  console.error('  2) Дождитесь готовности и повторите: npm run warm');
  process.exit(1);
}

let slugs;
const xml = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text()).catch(() => '');
slugs = [...new Set([...xml.matchAll(/\/anime\/([a-z0-9-]+)</g)].map((m) => m[1]))];
if (!slugs.length) {
  const j = await fetch(`${BASE}/api/search?q=&limit=1`).then((r) => r.json()).catch(() => null);
  slugs = (j?.items ?? []).map((i) => i.slug);
}
if (LIMIT) slugs = slugs.slice(0, LIMIT);

const rows = [];
let withSources = 0;
let done = 0;
const queue = [...slugs];

async function worker() {
  while (queue.length) {
    const slug = queue.shift();
    try {
      const j = await fetch(`${BASE}/api/availability/${slug}`).then((r) => (r.ok ? r.json() : null));
      const kinds = Object.values(j?.episodes ?? {});
      const ok = kinds.some((k) => k !== 'demo');
      if (ok) withSources++;
      rows.push({ slug, ok, kinds: kinds.reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {}) });
    } catch {
      rows.push({ slug, ok: false });
    }
    done++;
    if (done % 50 === 0) process.stdout.write(`\r${done}/${slugs.length} · с источниками: ${withSources}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log('');
mkdirSync('.cache', { recursive: true });
writeFileSync('.cache/warm-summary.json', JSON.stringify({ at: Date.now(), total: slugs.length, withSources, rows }, null, 1));
console.log(`warmer: ${withSources}/${slugs.length} тайтлов имеют провайдер-источники (см. .cache/warm-summary.json)`);
console.log('далее: npm run hydrate — наполнит кэш episode-specific источниками (параллельно, с дебаунс-записью)');
