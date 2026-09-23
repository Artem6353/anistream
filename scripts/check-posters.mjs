/* Чекер битых постеров (handoff A4.2):
   node scripts/check-posters.mjs [--sample N] [--concurrency 16] [--timeout 8000] [--banners]
   HEAD-запросы ко всем постерам (опционально и баннерам) из lib/data/titles.json.
   Битые (>=400, сетевая ошибка, таймаут) печатаются и пишутся в .cache/broken-posters.json.
   Если HEAD запрещён (403/405/501) — повторная проверка GET с Range: bytes=0-0. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const SAMPLE = Number(opt('sample', 0)); // 0 = все
const CONCURRENCY = Number(opt('concurrency', 16));
const TIMEOUT = Number(opt('timeout', 8000));
const WITH_BANNERS = argv.includes('--banners');

const titles = JSON.parse(readFileSync('lib/data/titles.json', 'utf8'));
const jobs = [];
for (const t of titles) {
  if (t.poster) jobs.push({ slug: t.slug, kind: 'poster', url: t.poster });
  if (WITH_BANNERS && t.banner) jobs.push({ slug: t.slug, kind: 'banner', url: t.banner });
}
const list = SAMPLE > 0 ? jobs.filter((_, i) => i % Math.ceil(jobs.length / SAMPLE) === 0).slice(0, SAMPLE) : jobs;
console.log(`проверяю ${list.length} URL (${jobs.length} всего${SAMPLE ? `, выборка ${SAMPLE}` : ''})…`);

const broken = [];
let done = 0;
const started = Date.now();

async function checkOne(job) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    let res = await fetch(job.url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
    if ([403, 405, 501].includes(res.status)) {
      // CDN может запрещать HEAD — пробуем GET первого байта
      res = await fetch(job.url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: ctrl.signal, redirect: 'follow' });
    }
    if (!res.ok && res.status !== 206) broken.push({ ...job, status: res.status });
  } catch (e) {
    broken.push({ ...job, status: 0, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e).slice(0, 80) });
  } finally {
    clearTimeout(timer);
    done++;
    if (done % 200 === 0 || done === list.length) {
      const rate = done / ((Date.now() - started) / 1000);
      process.stdout.write(`\r${done}/${list.length} (${rate.toFixed(0)}/с, битых: ${broken.length})   `);
    }
  }
}

async function main() {
  let idx = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
    while (idx < list.length) await checkOne(list[idx++]);
  });
  await Promise.all(workers);
  console.log();

  mkdirSync('.cache', { recursive: true });
  writeFileSync('.cache/broken-posters.json', JSON.stringify(broken, null, 2));
  const byStatus = {};
  for (const b of broken) byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  console.log(`итого: ${list.length - broken.length}/${list.length} OK, битых: ${broken.length}`);
  if (broken.length) {
    console.log('по статусам:', JSON.stringify(byStatus));
    for (const b of broken.slice(0, 30)) console.log(` - [${b.status}] ${b.slug} (${b.kind}): ${b.url}${b.error ? ' — ' + b.error : ''}`);
    if (broken.length > 30) console.log(` … и ещё ${broken.length - 30} (полный список в .cache/broken-posters.json)`);
    console.log('\nпочинка: заменить URL правкой titles.json или удалить тайтл: node scripts/curate-titles.mjs remove <slug>');
  } else {
    console.log('битых постеров нет ✓');
  }
}

main();
