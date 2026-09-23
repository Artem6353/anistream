/* A8.1: нагрузка на слой источников — CONC параллельных запросов.
   Режимы:
   1) Next API (по умолчанию): LOADTEST_URL=http://localhost:3100 CONC=100 node scripts/loadtest.mjs [slug] [ep]
      → GET /api/providers/[slug]/[ep] (весь реестр: cache/live/synth/demo).
   2) Bridge напрямую: BRIDGE_URL=http://127.0.0.1:8765 node scripts/loadtest.mjs [slug] [ep]
      → POST /resolve { provider, context } (python-bridge под нагрузкой).
   Вывод: p50/p95/p99/max + ошибки (HTTP-статусы отдельно от сетевых). */
import { readFileSync } from 'node:fs';

const conc = Number(process.env.CONC || 100);
const slug = process.argv[2] || 'one-piece';
const ep = Number(process.argv[3] || 1);
const bridgeUrl = process.env.BRIDGE_URL || '';
const base = process.env.LOADTEST_URL || 'http://localhost:3100';

// контекст bridge-резолва строим ОДИН раз (titles.json ~20 МБ — парс в каждом
// из CONC колбэков блокировал event loop клиента и искажал замер — урок A8.1)
let bridgeBody = null;
function target(i) {
  if (!bridgeUrl) return { url: `${base}/api/providers/${slug}/${ep}?t=${i}`, init: { signal: AbortSignal.timeout(30000) } };
  if (!bridgeBody) {
    const titles = JSON.parse(readFileSync('lib/data/titles.json', 'utf8'));
    const t = titles.find((x) => x.slug === slug) ?? titles[0];
    bridgeBody = JSON.stringify({
      provider: process.env.PROVIDER || 'kodik',
      context: { slug: t.slug, episode: ep, shikimoriId: t.shikimori?.id ?? null, originalTitle: t.romaji, title: t.ru, totalEpisodes: t.episodes },
    });
  }
  return {
    url: `${bridgeUrl}/resolve`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.BRIDGE_TOKEN ? { Authorization: `Bearer ${process.env.BRIDGE_TOKEN}` } : {}),
      },
      body: bridgeBody,
      signal: AbortSignal.timeout(60000),
    },
  };
}

const lat = [];
const httpErrors = [];
const netErrors = [];
const bodyErrors = [];
const t0all = Date.now();
await Promise.all(
  Array.from({ length: conc }, async (_, i) => {
    const { url, init } = target(i);
    const t0 = Date.now();
    try {
      const r = await fetch(url, init);
      lat.push(Date.now() - t0);
      if (!r.ok) httpErrors.push(r.status);
      else {
        const j = await r.json().catch(() => ({}));
        if (j?.error) bodyErrors.push(String(j.error).slice(0, 60));
      }
    } catch (e) {
      lat.push(Date.now() - t0);
      netErrors.push(String(e).slice(0, 60));
    }
  }),
);
lat.sort((a, b) => a - b);
const p = (q) => lat[Math.floor(lat.length * q)] ?? NaN;
console.log(`цель: ${bridgeUrl ? bridgeUrl + '/resolve (bridge)' : base + ' /api/providers (next)'}`);
console.log(`запросов: ${conc} за ${((Date.now() - t0all) / 1000).toFixed(1)} с`);
console.log(`latency ms: p50=${p(0.5)} p95=${p(0.95)} p99=${p(0.99)} max=${lat[lat.length - 1]}`);
console.log(`HTTP-ошибки: ${httpErrors.length}`, [...new Set(httpErrors)].slice(0, 5));
console.log(`сетевые ошибки (таймауты/соединение): ${netErrors.length}`, [...new Set(netErrors)].slice(0, 3));
console.log(`ответы с error в теле (upstream): ${bodyErrors.length}`, [...new Set(bodyErrors)].slice(0, 3));
