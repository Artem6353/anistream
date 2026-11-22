#!/usr/bin/env node
/**
 * B1-C: локальные скриншоты и замеры preview-маршрутов.
 *
 * Один и тот же код используется двумя способами:
 * 1. `e2e/aninova3-b1c-capture.spec.ts` (B1C_CAPTURE=1) — сервер поднимает
 *    Playwright через webServer, тест вызывает captureAll();
 * 2. ручной запуск владельцем: `PLAYWRIGHT_BROWSERS_PATH=.cache/pw-browsers
 *    node scripts/aninova3-b1c-capture.mjs` — скрипт сам поднимает next start.
 *
 * Пишет: docs/design/b1c/screens/*.png и docs/design/b1c/perf.json.
 * Внешних запросов, деплоя и изменений production не делает.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
export const ROOT_PATH = '/preview/aninova-3';
export const SHOTS = path.join(ROOT, 'docs', 'design', 'b1c', 'screens');
export const PERF_OUT = path.join(ROOT, 'docs', 'design', 'b1c', 'perf.json');

export const ROUTES = {
  animeWithSource: `${ROOT_PATH}/anime/naruto`,
  animeMultiSource: `${ROOT_PATH}/anime/one-piece`,
  animeManySources: `${ROOT_PATH}/anime/fujimoto-tatsuki-17-26`,
  animeRelatedOnly: `${ROOT_PATH}/anime/trinity-blood`,
  animeWithoutSource: `${ROOT_PATH}/anime/death-parade`,
  comicWithAdaptations: `${ROOT_PATH}/comics/naruto`,
  comicPendingTitle: `${ROOT_PATH}/comics/one-piece`,
  comicsCatalog: `${ROOT_PATH}/comics`,
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Счётчики страницы: DOM, запросы, байты JS/CSS, LCP, CLS. */
async function measure(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const sum = (list, pick) => list.reduce((n, r) => n + (pick(r) || 0), 0);
    const js = resources.filter((r) => /\.js(\?|$)/.test(r.name) || r.initiatorType === 'script');
    const css = resources.filter((r) => /\.css(\?|$)/.test(r.name) || r.initiatorType === 'link');
    const lcp = (window.__a3Lcp ?? []).concat(performance.getEntriesByType('largest-contentful-paint') || []);
    const lastLcp = lcp.length ? lcp[lcp.length - 1].startTime : null;
    const shifts = (window.__a3Cls ?? []).reduce((n, e) => n + (e.hadRecentInput ? 0 : e.value), 0);
    return {
      url: location.pathname,
      domNodes: document.querySelectorAll('*').length,
      htmlBytes: document.documentElement.outerHTML.length,
      resourceCount: resources.length,
      jsBytesTransferred: sum(js, (r) => r.transferSize || r.encodedBodySize),
      cssBytesTransferred: sum(css, (r) => r.transferSize || r.encodedBodySize),
      totalBytesTransferred: sum(resources, (r) => r.transferSize || r.encodedBodySize),
      ttfbMs: Math.round(nav?.responseStart ?? 0),
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      loadMs: Math.round(nav?.loadEventEnd ?? 0),
      lcpMs: lastLcp === null ? null : Math.round(lastLcp),
      cls: Number(shifts.toFixed(4)),
      sourceCards: document.querySelectorAll('.a3-source-card').length,
      adaptationCards: document.querySelectorAll('.a3-adaptation').length,
    };
  });
}

export const SHOT_LIST = [
  { name: 'anime-source-desktop-1440', url: ROUTES.animeWithSource, width: 1440, height: 1000, section: '.a3-source-section' },
  { name: 'anime-source-desktop-1440-full', url: ROUTES.animeWithSource, width: 1440, height: 1000, fullPage: true },
  { name: 'anime-source-tablet-768', url: ROUTES.animeWithSource, width: 768, height: 1100, section: '.a3-source-section' },
  { name: 'anime-source-mobile-390', url: ROUTES.animeWithSource, width: 390, height: 900, section: '.a3-source-section' },
  { name: 'anime-source-tv-1920', url: ROUTES.animeWithSource, width: 1920, height: 1080, tv: true, section: '.a3-source-section' },
  { name: 'anime-source-4k-3840', url: ROUTES.animeWithSource, width: 3840, height: 2160, section: '.a3-source-section' },
  { name: 'anime-without-source-1440', url: ROUTES.animeWithoutSource, width: 1440, height: 1000, section: '.a3-anime__body' },
  /* Реальные случаи полного снимка графа. */
  { name: 'anime-multi-source-desktop-1440', url: ROUTES.animeMultiSource, width: 1440, height: 1200, section: '.a3-source-section' },
  { name: 'anime-multi-source-mobile-390', url: ROUTES.animeMultiSource, width: 390, height: 1200, fullPage: true },
  { name: 'anime-many-sources-desktop-1440', url: ROUTES.animeManySources, width: 1440, height: 1400, section: '.a3-source-section' },
  { name: 'anime-many-sources-mobile-360', url: ROUTES.animeManySources, width: 360, height: 1400, fullPage: true },
  { name: 'anime-related-only-desktop-1440', url: ROUTES.animeRelatedOnly, width: 1440, height: 1000, section: '.a3-source-section' },
  { name: 'comics-pending-title-1440', url: ROUTES.comicPendingTitle, width: 1440, height: 1000 },
  { name: 'comics-adaptations-desktop-1440', url: ROUTES.comicWithAdaptations, width: 1440, height: 1000, section: '.a3-adaptations' },
  { name: 'comics-adaptation-mobile-390', url: ROUTES.comicWithAdaptations, width: 390, height: 900, fullPage: true },
  { name: 'comics-adaptation-tv-1920', url: ROUTES.comicWithAdaptations, width: 1920, height: 1080, tv: true, section: '.a3-adaptations' },
  { name: 'comics-catalog-1440', url: ROUTES.comicsCatalog, width: 1440, height: 1000 },
];

async function capture(browser, base, shot) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  if (shot.tv) {
    await context.addInitScript(() => {
      localStorage.setItem('a3:tv', '1');
      sessionStorage.setItem('a3:hint-seen', '1');
    });
  }
  const page = await context.newPage();
  await page.goto(`${base}${shot.url}`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SHOTS, `${shot.name}.png`),
    ...(shot.fullPage ? { fullPage: true } : {}),
  });
  if (shot.section) {
    const section = page.locator(shot.section).first();
    if (await section.count()) {
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await section.screenshot({ path: path.join(SHOTS, `${shot.name}--block.png`) });
    }
  }
  await context.close();
}

/** Медиана по числовым полям + сырые LCP-прогоны: одиночный LCP шумит. */
function aggregate(runs) {
  const out = { ...runs[0], runs: runs.length };
  for (const key of Object.keys(runs[0] ?? {})) {
    if (typeof runs[0][key] !== 'number') continue;
    const values = runs.map((r) => r[key]).sort((a, b) => a - b);
    out[key] = values[Math.floor(values.length / 2)];
  }
  out.lcpRuns = runs.map((r) => r.lcpMs);
  return out;
}

/** Скриншоты + замеры при уже поднятом сервере. */
export async function captureAll(base) {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const shot of SHOT_LIST) await capture(browser, base, shot);

    const perf = {
      generatedAt: new Date().toISOString(),
      base,
      note:
        'Локальные значения (Chromium без троттлинга, холодный кэш на каждый маршрут, медиана из 3 прогонов), не production-метрики',
      routes: {},
    };
    for (const [key, url] of Object.entries(ROUTES)) {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        /* Свежий контекст = холодный кэш: иначе transferSize кэшированных чанков равен 0
           и сравнение маршрутов становится бессмысленным. */
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.addInitScript(() => {
          window.__a3Cls = [];
          window.__a3Lcp = [];
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) window.__a3Cls.push(entry);
          }).observe({ type: 'layout-shift', buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) window.__a3Lcp.push(entry);
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        });
        const page = await context.newPage();
        await page.goto(`${base}${url}`, { waitUntil: 'load' });
        await page.waitForTimeout(700);
        runs.push(await measure(page));
        await context.close();
      }
      perf.routes[key] = aggregate(runs);
    }
    writeFileSync(PERF_OUT, `${JSON.stringify(perf, null, 2)}\n`, 'utf8');
    return { shots: SHOT_LIST.length, perf };
  } finally {
    await browser.close();
  }
}

async function waitForServer(url, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return true;
    } catch {
      /* сервер ещё поднимается */
    }
    await wait(700);
  }
  throw new Error(`сервер не ответил на ${url}`);
}

async function manual() {
  const port = Number(process.env.SHOT_PORT ?? 3103);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)],
    { cwd: ROOT, env: { ...process.env, ANINOVA3_PREVIEW: '1', CATALOG_SOURCE: 'file' }, stdio: ['ignore', 'ignore', 'ignore'] },
  );
  try {
    await waitForServer(`${base}${ROOT_PATH}`);
    const { shots, perf } = await captureAll(base);
    console.log(`[b1c] скриншотов: ${shots}, замеры: ${path.relative(ROOT, PERF_OUT)}`);
    for (const [key, m] of Object.entries(perf.routes)) {
      console.log(
        `[b1c] ${key}: DOM ${m.domNodes}, requests ${m.resourceCount}, js ${(m.jsBytesTransferred / 1024).toFixed(1)} КБ, ` +
          `css ${(m.cssBytesTransferred / 1024).toFixed(1)} КБ, LCP ${m.lcpMs} мс, CLS ${m.cls}`,
      );
    }
  } finally {
    child.kill();
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/aninova3-b1c-capture.mjs')) {
  manual().catch((err) => {
    console.error('[b1c] capture failed:', err.message);
    process.exitCode = 1;
  });
}
