/**
 * B1-B: аудит preview-интерфейса — переполнение, контраст, семантика,
 * клавиатура, reduced motion, вес ресурсов.
 *   ANINOVA3_PREVIEW=1 npx next start -p 3521
 *   A3_BASE=http://localhost:3521 node scripts/aninova3/audit.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.A3_BASE ?? 'http://localhost:3521';
const OUT = process.env.A3_OUT ?? 'docs/design/b1b';
const ROOT = '/preview/aninova-3';

const SCREENS = [
  ['home', ''],
  ['catalog', '/catalog'],
  ['anime', '/anime/one-piece'],
  ['watch', '/anime/one-piece/1'],
  ['comics', '/comics'],
  ['comic', '/comics/gorod-stekla'],
  ['read', '/comics/gorod-stekla/read'],
  ['profile', '/profile'],
  ['auth', '/auth'],
];

const WIDTHS = [360, 390, 430, 768, 1024, 1280, 1440, 1920, 3840];
const browser = await chromium.launch();
const overflow = [];
const contrast = [];
const semantics = [];
const keyboard = {};

const open = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.addInitScript(() => sessionStorage.setItem('a3:hint-seen', '1'));
  return page;
};

/** Контраст: обходим текстовые элементы, фон ищем вверх по предкам.
 *  Текст поверх изображений/градиентов пропускаем: там нужен ручной расчёт по скриму. */
const CONTRAST_FN = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(',').map((x) => Number.parseFloat(x));
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0.85) return c;
      node = node.parentElement;
    }
    return { r: 12, g: 12, b: 14, a: 1 };
  };
  const out = [];
  let min = 99;
  const nodes = Array.from(document.querySelectorAll('.a3 h1,.a3 h2,.a3 h3,.a3 p,.a3 a,.a3 span,.a3 dt,.a3 dd,.a3 button,.a3 label,.a3 summary,.a3 li,.a3 figcaption,.a3 code,.a3 th,.a3 td'));
  for (const el of nodes) {
    if (el.closest('.a3-sr') || el.classList.contains('a3-sr')) continue;
    if (el.closest('.a3-hero,.a3-anime__hero,[data-a3-overlay]')) continue;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number.parseFloat(s.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const fg = parse(s.color);
    if (!fg || fg.a < 0.95) continue;
    if (s.textShadow !== 'none' || s.webkitTextStrokeWidth !== '0px') continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const size = Number.parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 600;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const value = Number(ratio(fg, bg).toFixed(2));
    if (value < min) min = value;
    if (value < need) {
      out.push({
        text: (el.textContent ?? '').trim().slice(0, 60),
        cls: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
        size,
        ratio: value,
        need,
        fg: s.color,
        bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
      });
    }
  }
  return { out, min };
};

for (const width of WIDTHS) {
  for (const [id, p] of SCREENS) {
    if (width === 3840 && id !== 'home' && id !== 'catalog') continue;
    const page = await open(width, width >= 1024 ? 900 : 844);
    await page.goto(`${BASE}${ROOT}${p}${width === 3840 || width === 1920 ? '?tv=1' : ''}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, w: window.innerWidth }));
    if (metrics.sw > metrics.iw + 1) overflow.push({ width, screen: id, scrollWidth: metrics.sw, innerWidth: metrics.iw });
    if (width === 1440) {
      const { out: fails, min } = await page.evaluate(CONTRAST_FN);
      contrast.push({ screen: id, theme: 'dark', failures: fails, min });
      const sem = await page.evaluate(() => {
        const interactive = Array.from(document.querySelectorAll('.a3 a[href],.a3 button,.a3 input,.a3 select,.a3 textarea'));
        const unnamed = interactive
          .filter((el) => {
            const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim();
            const labelled = el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
            return !name && !labelled && !el.getAttribute('aria-labelledby');
          })
          .map((el) => el.outerHTML.slice(0, 120));
        const imgs = Array.from(document.querySelectorAll('.a3 img'));
        return {
          h1: document.querySelectorAll('.a3 h1').length,
          main: document.querySelectorAll('main').length,
          unnamed,
          imgsMissingAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
          imgs: imgs.length,
          divButtons: Array.from(document.querySelectorAll('.a3 div[role="button"]')).length,
          skip: !!document.querySelector('.a3-skip'),
        };
      });
      semantics.push({ screen: id, ...sem });
    }
    await page.close();
  }
}

// Клавиатура/фокус/меню/читалка
{
  const p = await open(1920, 1080);
  await p.goto(`${BASE}${ROOT}?tv=1`, { waitUntil: 'networkidle' });
  await p.locator('.a3-header__actions button[aria-label="Поиск по каталогу"]').focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(450);
  const searchFocus = await p.evaluate(() => document.activeElement?.classList.contains('a3-search__input'));
  await p.keyboard.type('фри');
  await p.waitForTimeout(800);
  const results = await p.locator('.a3-search__hit').count();
  await p.keyboard.press('Escape');
  const searchRestored = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Поиск по каталогу');

  await p.goto(`${BASE}${ROOT}/comics/gorod-stekla/read`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const before = await p.locator('.a3-reader__count').innerText();
  await p.keyboard.press('ArrowRight');
  const after = await p.locator('.a3-reader__count').innerText();

  keyboard.search = { focusInInput: searchFocus, results, restoredOnClose: searchRestored };
  keyboard.reader = { before, after, arrowsWork: before !== after };
  await p.close();
}

{
  const p = await open(390, 844);
  await p.goto(`${BASE}${ROOT}`, { waitUntil: 'networkidle' });
  await p.locator('.a3-menubtn').click();
  await p.waitForTimeout(200);
  const initial = await p.evaluate(() => document.activeElement?.className);
  for (let i = 0; i < 8; i++) await p.keyboard.press('Tab');
  const trapped = await p.evaluate(() => !!document.activeElement?.closest('.a3-menu'));
  await p.keyboard.press('Escape');
  const restored = await p.evaluate(() => document.activeElement?.classList.contains('a3-menubtn'));
  keyboard.menu = { initial, trapped, restored };
  await p.close();
}

// Reduced motion
let motion;
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await p.goto(`${BASE}${ROOT}`, { waitUntil: 'networkidle' });
  motion = await p.evaluate(() => ({
    mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    pulseAnimation: getComputedStyle(document.querySelector('.a3-pulse'), '::after').animationDuration,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transitions: getComputedStyle(document.querySelector('.a3-card')).transitionDuration,
  }));
  await p.close();
}

// Вес ресурсов на первом заходе (transferSize, локальная сеть)
const performance = [];
for (const [id, route] of [
  ['home', ''],
  ['catalog', '/catalog'],
  ['anime', '/anime/one-piece'],
]) {
  const p = await open(1440, 900);
  await p.goto(`${BASE}${ROOT}${route}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const data = await p.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const sum = (re) => res.filter((r) => re.test(r.name)).reduce((n, r) => n + (r.transferSize || 0), 0);
    return {
      js: sum(/\.js(\?|$)/),
      css: sum(/\.css(\?|$)/),
      img: sum(/\/img\/|\/v2\/|\.(avif|webp|jpe?g|png)(\?|$)/),
      total: res.reduce((n, r) => n + (r.transferSize || 0), 0),
      requests: res.length,
      dom: document.querySelectorAll('*').length,
    };
  });
  performance.push({ screen: id, ...data });
  await p.close();
}

const failures = contrast.reduce((n, c) => n + c.failures.length, 0);
const report = {
  base: BASE,
  at: new Date().toISOString(),
  widths: WIDTHS,
  overflow,
  contrast: {
    screens: contrast.length,
    failures,
    minRatio: contrast.length ? Math.min(...contrast.map((c) => c.min)) : null,
    details: contrast,
  },
  semantics,
  keyboard,
  motion,
  performance,
};
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'audit.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      overflow: overflow.length,
      contrastPages: contrast.length,
      contrastFailures: failures,
      semanticsIssues: semantics.reduce((n, s) => n + s.unnamed.length + s.imgsMissingAlt + (s.h1 !== 1 ? 1 : 0) + (s.main !== 1 ? 1 : 0), 0),
      keyboard,
      motion,
      performance,
    },
    null,
    2,
  ),
);
await browser.close();
