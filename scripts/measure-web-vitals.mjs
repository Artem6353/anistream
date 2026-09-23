/* 4.3: реальный замер LCP/CLS/FCP на прод-сборке через Chromium CDP PerformanceObserver
   (те же API, из которых CrUX/Lighthouse берут полевые метрики). Lighthouse CLI в песочнице
   (1 CPU / 1 ГБ) падал по памяти/зависал — метод замера честно указан в REPORT.md §8.

   Запуск: BASE=http://127.0.0.1:3100 node scripts/measure-web-vitals.mjs
   Результат: таблица (cold = первая загрузка контекста, warm = reload с кэшем)
   + JSON в .cache/web-vitals.json */
import { chromium } from 'playwright-core';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3100';

const PAGES = [
  { name: 'Главная', path: '/' },
  { name: 'Каталог', path: '/catalog' },
  { name: 'Тайтл', path: '/anime/sousou-no-frieren' },
  { name: 'Плеер', path: '/anime/sousou-no-frieren/1' },
];

const INIT = `
window.__vitals = { lcp: 0, cls: 0, fcp: 0 };
new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__vitals.lcp = Math.max(window.__vitals.lcp, e.renderTime || e.loadTime || e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__vitals.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
`;

async function measure(browser, path, warm) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  if (warm) {
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
  }
  await page.waitForTimeout(3500); // дождаться поздних LCP (карусель/ленивые изображения)
  const v = await page.evaluate(() => window.__vitals);
  await ctx.close();
  return { lcpMs: Math.round(v.lcp), cls: Number(v.cls.toFixed(4)), fcpMs: Math.round(v.fcp) };
}

// headless shell (его же использует playwright test) — полный chrome в песочнице крашится
const only = process.argv[2];
const pages = only ? PAGES.filter((x) => x.name.toLowerCase().includes(only.toLowerCase()) || x.path === only) : PAGES;
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const out = [];
try {
  for (const p of pages) {
    let cold = null, warm = null;
    for (let attempt = 1; attempt <= 2 && (!cold || !warm); attempt++) {
      try { if (!cold) cold = await measure(browser, p.path, false); } catch (e) { console.log(`  cold attempt ${attempt}: ${e.message.split('\n')[0]}`); }
      try { if (!warm) warm = await measure(browser, p.path, true); } catch (e) { console.log(`  warm attempt ${attempt}: ${e.message.split('\n')[0]}`); }
    }
    if (!cold || !warm) { console.log(`${p.page}: ЗАМЕР НЕ УДАЛСЯ (renderer crash — нехватка памяти песочницы)`); continue; }
    out.push({ page: p.name, path: p.path, cold, warm });
    console.log(`${p.name} (${p.path}): cold LCP=${cold.lcpMs}ms CLS=${cold.cls} FCP=${cold.fcpMs}ms · warm LCP=${warm.lcpMs}ms CLS=${warm.cls} FCP=${warm.fcpMs}ms`);
  }
} finally {
  await browser.close().catch(() => {});
}
mkdirSync('.cache', { recursive: true });
// мержим с предыдущими результатами (замер по одной странице экономит память песочницы)
const prev = existsSync('.cache/web-vitals.json') ? JSON.parse(readFileSync('.cache/web-vitals.json', 'utf8')).results ?? [] : [];
const merged = [...prev.filter((x) => !out.some((y) => y.path === x.path)), ...out];
writeFileSync('.cache/web-vitals.json', JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, method: 'chromium CDP PerformanceObserver (playwright-core headless shell), desktop 1280x800', results: merged }, null, 2));
console.log('\nзаписано в .cache/web-vitals.json');
