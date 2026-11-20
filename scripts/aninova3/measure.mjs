/* Замер локальной production-сборки: LCP, transferSize по типам, DOM.
   Не заменяет Lighthouse/PSI: числа локальные, без сети и троттлинга. */
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.A3_BASE ?? 'http://localhost:3505';
const out = process.env.A3_OUT ?? 'docs/design/b1b/perf.json';
const routes = (process.env.A3_ROUTES ?? '/,/catalog').split(',').filter(Boolean);

const browser = await chromium.launch();
const results = [];
for (const route of routes) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__lcp = Math.max(window.__lcp, e.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const data = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const sum = (re) => res.filter((r) => re.test(r.name)).reduce((n, r) => n + (r.transferSize || 0), 0);
    return {
      lcp: Math.round(window.__lcp || 0),
      js: sum(/\.js(\?|$)/),
      css: sum(/\.css(\?|$)/),
      img: sum(/\/img\/|\/v2\/|\.(avif|webp|jpe?g|png)(\?|$)/),
      total: res.reduce((n, r) => n + (r.transferSize || 0), 0),
      requests: res.length,
      dom: document.querySelectorAll('*').length,
      lcpElement: (() => {
        const e = performance.getEntriesByType('largest-contentful-paint').at(-1);
        return e?.element ? `${e.element.tagName}.${e.element.className || ''}`.slice(0, 120) : null;
      })(),
    };
  });
  results.push({ route, ...data });
  await page.close();
}
await browser.close();
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
