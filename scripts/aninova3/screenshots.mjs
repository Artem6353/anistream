/**
 * B1-B: скриншоты preview-интерфейса A+C и состояний TV-фокуса.
 * Требует production-сборку и запущенный сервер:
 *   ANINOVA3_PREVIEW=1 npx next start -p 3521
 *   A3_BASE=http://localhost:3521 node scripts/aninova3/screenshots.mjs
 * Только локальные артефакты, без деплоя.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.A3_BASE ?? 'http://localhost:3521';
const OUT = process.env.A3_OUT ?? 'docs/design/b1b/screens';
const ROOT = '/preview/aninova-3';

const SCREENS = [
  { id: 'home', path: '' },
  { id: 'catalog', path: '/catalog' },
  { id: 'anime', path: '/anime/one-piece' },
  { id: 'watch', path: '/anime/one-piece/1' },
  { id: 'comics', path: '/comics' },
  { id: 'comic', path: '/comics/gorod-stekla' },
  { id: 'read', path: '/comics/gorod-stekla/read' },
  { id: 'profile', path: '/profile' },
  { id: 'auth', path: '/auth' },
];

const SIZES = [
  { id: '390', width: 390, height: 844, full: true },
  { id: '768', width: 768, height: 1024, full: true },
  { id: '1024', width: 1024, height: 768, full: true },
  { id: '1440', width: 1440, height: 900, full: true },
  { id: '1920', width: 1920, height: 1080, full: false, tv: true },
  { id: '3840', width: 3840, height: 2160, full: false, tv: true },
];

const browser = await chromium.launch();
await mkdir(path.join(OUT, 'states'), { recursive: true });

const open = async (w, h, tv) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.addInitScript(() => sessionStorage.setItem('a3:hint-seen', '1'));
  return page;
};

const shot = async (page, file, fullPage) => {
  await page.waitForTimeout(350);
  if (fullPage) {
    // Фиксированные панели в fullPage дублируются посреди снимка — на документе их скрываем.
    await page.addStyleTag({ content: '.a3-bottomnav,.a3-hint{display:none!important}' });
  }
  await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 78, fullPage });
};

const manifest = [];
for (const size of SIZES) {
  for (const screen of SCREENS) {
    const page = await open(size.width, size.height, size.tv);
    const url = `${BASE}${ROOT}${screen.path}${size.tv ? '?tv=1' : ''}`;
    const res = await page.goto(url, { waitUntil: 'networkidle' });
    const file = `${size.id}/${screen.id}.jpg`;
    await mkdir(path.join(OUT, size.id), { recursive: true });
    await shot(page, file, size.full);
    const metrics = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      title: document.title,
    }));
    manifest.push({ size: size.id, screen: screen.id, url, status: res?.status() ?? 0, ...metrics });
    console.log(size.id, screen.id, res?.status(), metrics.sw === metrics.iw ? 'ok' : `OVERFLOW ${metrics.sw}`);
    await page.close();
  }
}

// ── Состояния TV/фокуса ─────────────────────────────────────────
{
  const p = await open(1920, 1080, true);
  await p.goto(`${BASE}${ROOT}?tv=1`, { waitUntil: 'networkidle' });
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('ArrowRight');
  await shot(p, 'states/tv-home-focus-1920.jpg', false);

  await p.goto(`${BASE}${ROOT}/catalog?tv=1`, { waitUntil: 'networkidle' });
  for (let i = 0; i < 30; i++) {
    if (await p.locator('.a3-row:focus').count()) break;
    await p.keyboard.press('ArrowDown');
  }
  await shot(p, 'states/tv-catalog-row-1920.jpg', false);

  await p.goto(`${BASE}${ROOT}?tv=1`, { waitUntil: 'networkidle' });
  await p.locator('.a3-header__actions button[aria-label="Поиск по каталогу"]').focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  await p.keyboard.type('фри');
  await p.waitForTimeout(900);
  await shot(p, 'states/tv-search-1920.jpg', false);

  await p.goto(`${BASE}${ROOT}/anime/one-piece/1?tv=1`, { waitUntil: 'networkidle' });
  await p.locator('.a3-stage').focus();
  await shot(p, 'states/tv-player-1920.jpg', false);
  await p.close();
}

{
  const p = await open(390, 844, false);
  await p.goto(`${BASE}${ROOT}`, { waitUntil: 'networkidle' });
  await p.locator('.a3-menubtn').click();
  await shot(p, 'states/menu-390.jpg', false);
  await p.keyboard.press('Escape');
  await shot(p, 'states/mobile-nav-390.jpg', false);
  await p.close();
}

{
  const p = await open(3840, 2160, true);
  await p.goto(`${BASE}${ROOT}?tv=1`, { waitUntil: 'networkidle' });
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('ArrowRight');
  await shot(p, 'states/tv-home-focus-3840.jpg', false);
  await p.close();
}

await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), shots: manifest }, null, 2));
await browser.close();
console.log('готово:', manifest.length, 'экранов + состояния');
