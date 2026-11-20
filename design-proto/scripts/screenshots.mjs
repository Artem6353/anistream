/* Скриншоты и проверки прототипа B1-A.
   Запуск (dev-сервер должен быть поднят на :3517):
     node scripts/screenshots.mjs            # всё
     node scripts/screenshots.mjs --audit    # только проверки

   Пишет:
     docs/design/b1/screens/<концепция>/...jpg
     docs/design/b1/audit.json
*/
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const outRoot = path.join(root, 'docs', 'design', 'b1');
const screensDir = path.join(outRoot, 'screens');
const BASE = process.env.PROTO_BASE ?? 'http://localhost:3517';
const AUDIT_ONLY = process.argv.includes('--audit');
const STATES_ONLY = process.argv.includes('--states');

const concepts = [
  { id: 'minimal', letter: 'a', defaultTheme: 'dark' },
  { id: 'editorial', letter: 'b', defaultTheme: 'light' },
  { id: 'cinematic', letter: 'c', defaultTheme: 'dark' },
];

const screens = [
  { id: 'home', path: '' },
  { id: 'catalog', path: '/catalog' },
  { id: 'anime', path: '/anime/magicheskaya-bitva' },
  { id: 'watch', path: '/anime/magicheskaya-bitva/watch' },
  { id: 'comics', path: '/comics' },
  { id: 'comic', path: '/comics/steklyannyj-gorod' },
  { id: 'read', path: '/comics/steklyannyj-gorod/read' },
  { id: 'profile', path: '/profile' },
  { id: 'login', path: '/login' },
  { id: 'register', path: '/register' },
];

const viewports = {
  390: { width: 390, height: 844 },
  768: { width: 768, height: 1024 },
  1440: { width: 1440, height: 900 },
  1920: { width: 1920, height: 1080 },
};

const tabletScreens = new Set(['home', 'catalog', 'watch', 'read']);
const tvScreens = new Set(['home', 'watch']);

const audit = { generatedAt: new Date().toISOString(), base: BASE, overflow: [], contrast: [], keyboard: [], motion: {}, js: [], images: [] };

const url = (concept, screen, theme) => `${BASE}/${concept}${screen.path}?ui=0${theme ? `&theme=${theme}` : ''}`;

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('aninova-proto-theme', t);
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.waitForTimeout(80);
}

/* Контраст: для каждого листового текстового элемента ищем первый непрозрачный
   фон вверх по дереву. Текст поверх изображений/скримов (hero, art) пропускаем —
   там нужна ручная проверка по макету, а не расчёт по CSS. */
async function measureContrast(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(',').map((v) => Number(v.trim()));
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (fg, bg) => {
      const l1 = lum(fg);
      const l2 = lum(bg);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const skipAncestor = (el) => {
      let n = el;
      while (n && n !== document.body) {
        const cls = typeof n.className === 'string' ? n.className : '';
        if (/hero|auth-art|c-screen|stage|billboard|ambient/.test(cls)) return true;
        const st = getComputedStyle(n);
        if (st.backgroundImage !== 'none' && !/gradient/.test(st.backgroundImage)) return true;
        n = n.parentElement;
      }
      return false;
    };
    const bgOf = (el) => {
      let n = el;
      while (n) {
        const st = getComputedStyle(n);
        const c = parse(st.backgroundColor);
        if (c && c.a > 0.85) return c;
        n = n.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };

    const rows = [];
    let minRatio = 99;
    let minSample = null;
    const nodes = document.querySelectorAll('h1,h2,h3,p,dd,dt,label,li,a,button,span,time,em,b,small,figcaption');
    for (const el of nodes) {
      const text = (el.textContent ?? '').trim();
      if (!text || el.children.length > 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
      if (skipAncestor(el)) continue;
      const fg = parse(st.color);
      if (!fg || fg.a < 0.6) continue;
      const bg = bgOf(el);
      const size = parseFloat(st.fontSize);
      const weight = Number(st.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const value = ratio(fg, bg);
      if (value < minRatio) {
        minRatio = value;
        minSample = { text: text.slice(0, 32), cls: typeof el.className === 'string' ? el.className.slice(0, 40) : '', ratio: Math.round(value * 100) / 100 };
      }
      if (value < need) {
        rows.push({
          text: text.slice(0, 48),
          cls: typeof el.className === 'string' ? el.className.slice(0, 48) : '',
          size: Math.round(size * 10) / 10,
          ratio: Math.round(value * 100) / 100,
          need,
          fg: `rgb(${fg.r},${fg.g},${fg.b})`,
          bg: `rgb(${bg.r},${bg.g},${bg.b})`,
        });
      }
    }
    return {
      total: nodes.length,
      minRatio: Math.round(minRatio * 100) / 100,
      minSample,
      worst: rows.sort((a, b) => a.ratio - b.ratio).slice(0, 6),
    };
  });
}

const browser = await chromium.launch();

if (!AUDIT_ONLY && !STATES_ONLY) {
  console.log('→ screenshots');
  for (const c of concepts) {
    const dir = path.join(screensDir, c.id);
    await mkdir(dir, { recursive: true });
    for (const s of screens) {
      const shot = async (w, suffix, fullPage) => {
        const page = await browser.newPage({ viewport: viewports[w], deviceScaleFactor: 1 });
        await page.goto(url(c.id, s), { waitUntil: 'networkidle' });
        await page.waitForTimeout(120);
        await page.screenshot({
          path: path.join(dir, `${s.id}-${suffix}.jpg`),
          type: 'jpeg',
          quality: 72,
          fullPage,
        });
        await page.close();
      };
      await shot(1440, '1440', true);
      await shot(390, '390', false);
      if (tabletScreens.has(s.id)) await shot(768, '768', false);
      if (tvScreens.has(s.id)) await shot(1920, '1920', false);
      process.stdout.write(`  ${c.id}/${s.id}\r`);
    }
    // темы: главная и каталог в противоположной теме
    const other = c.defaultTheme === 'dark' ? 'light' : 'dark';
    for (const s of [screens[0], screens[1]]) {
      const page = await browser.newPage({ viewport: viewports[1440], deviceScaleFactor: 1 });
      await page.goto(url(c.id, s), { waitUntil: 'networkidle' });
      await setTheme(page, other);
      await page.screenshot({ path: path.join(dir, `${s.id}-1440-${other}.jpg`), type: 'jpeg', quality: 72, fullPage: false });
      await page.close();
    }
  }
  console.log('\n  готово');
}

if (!AUDIT_ONLY) {
  console.log('→ state screenshots');
  for (const c of concepts) {
    const dir = path.join(screensDir, c.id);
    const shot = async (page, name, fullPage = false) => {
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 74, fullPage });
    };

    // 1) поиск в открытом состоянии
    const sp = await browser.newPage({ viewport: viewports[1440] });
    await sp.goto(`${BASE}/${c.id}?ui=0`, { waitUntil: 'networkidle' });
    const searchTrigger =
      c.id === 'minimal' ? sp.getByRole('button', { name: 'Поиск по каталогу' }) : sp.getByRole('button', { name: 'Поиск' });
    await searchTrigger.first().click();
    await sp.locator('input[type="search"]').first().fill('тит');
    await shot(sp, 'state-search-1440.jpg');
    await sp.close();

    // 2) мобильное меню (у Cinematic нижняя навигация — снимаем поиск на мобильном)
    const mp = await browser.newPage({ viewport: viewports[390] });
    await mp.goto(`${BASE}/${c.id}?ui=0`, { waitUntil: 'networkidle' });
    if (c.id === 'cinematic') {
      await mp.getByRole('button', { name: 'Поиск' }).first().click();
      await mp.locator('input[type="search"]').first().fill('фри');
      await shot(mp, 'state-search-390.jpg');
    } else {
      const opener =
        c.id === 'minimal' ? mp.getByRole('button', { name: 'Открыть меню' }) : mp.getByRole('button', { name: 'Меню' });
      await opener.first().click();
      await shot(mp, 'state-menu-390.jpg');
    }
    await mp.close();

    // 3) вкладка профиля + сохранённая карточка
    const pp = await browser.newPage({ viewport: viewports[1440] });
    await pp.goto(`${BASE}/${c.id}/profile?ui=0`, { waitUntil: 'networkidle' });
    const second = c.id === 'minimal' ? 'Закладки' : 'Полка';
    await pp.getByRole('tab', { name: second }).click();
    await shot(pp, 'state-profile-tab-1440.jpg');
    await pp.close();

    const ap = await browser.newPage({ viewport: viewports[1440] });
    await ap.goto(`${BASE}/${c.id}/anime/${c.id === 'editorial' ? 'frieren' : 'magicheskaya-bitva'}?ui=0`, { waitUntil: 'networkidle' });
    await ap.getByRole('button', { name: 'В закладки' }).first().click();
    await shot(ap, 'state-saved-1440.jpg');
    await ap.close();
  }

  // 4) индекс прототипа
  const ip = await browser.newPage({ viewport: viewports[1440] });
  await ip.goto(`${BASE}/?ui=0`, { waitUntil: 'networkidle' });
  await ip.screenshot({ path: path.join(outRoot, 'index-1440.jpg'), type: 'jpeg', quality: 74, fullPage: true });
  await ip.close();
  console.log('  готово');
}

if (!STATES_ONLY) {
console.log('→ audit');
for (const c of concepts) {
  for (const theme of ['dark', 'light']) {
    for (const s of screens) {
      const page = await browser.newPage({ viewport: viewports[1440] });
      await page.goto(url(c.id, s), { waitUntil: 'load' });
      await setTheme(page, theme);
      const js = await page.evaluate(() => {
        const scripts = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script');
        const imgs = [...document.images];
        return {
          scriptKb: Math.round(scripts.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024),
          scriptCount: scripts.length,
          images: imgs.length,
          withSrcset: imgs.filter((i) => i.srcset).length,
          lazy: imgs.filter((i) => i.loading === 'lazy').length,
          noAlt: imgs.filter((i) => i.alt === null || i.alt === undefined).length,
        };
      });
      audit.js.push({ concept: c.id, theme, screen: s.id, ...js });
      if (s.id === 'home' && theme === c.defaultTheme) audit.images.push({ concept: c.id, ...js });
      {
        const ctr = await measureContrast(page);
        audit.contrast.push({
          concept: c.id,
          theme,
          screen: s.id,
          total: ctr.total,
          minRatio: ctr.minRatio,
          minSample: ctr.minSample,
          failures: ctr.worst,
        });
      }
      await page.close();
    }
  }

  // overflow на четырёх ширинах
  for (const [w, vp] of Object.entries(viewports)) {
    for (const s of screens) {
      const page = await browser.newPage({ viewport: vp });
      await page.goto(url(c.id, s), { waitUntil: 'load' });
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
        body: document.body.scrollWidth,
      }));
      if (m.scrollWidth > m.innerWidth + 1 || m.body > m.innerWidth + 1) {
        audit.overflow.push({ concept: c.id, screen: s.id, width: Number(w), ...m });
      }
      await page.close();
    }
  }

  // клавиатура: поиск, меню, читалка
  const page = await browser.newPage({ viewport: viewports[1440] });
  await page.goto(url(c.id, screens[0]), { waitUntil: 'load' });
  const searchName = c.id === 'minimal' ? 'Поиск по каталогу' : 'Поиск';
  const searchBtn = page.getByRole('button', { name: searchName }).first();
  await searchBtn.focus();
  const focusVisible = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const st = getComputedStyle(el);
    return { tag: el.tagName, outline: st.outlineStyle, width: st.outlineWidth };
  });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const searchOpen = await page.evaluate(() => {
    const input = document.querySelector('input[type="search"]');
    return { exists: !!input, focused: input ? input === document.activeElement : false };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const searchClosed = await page.evaluate(() => !document.querySelector('input[type="search"]'));
  audit.keyboard.push({ concept: c.id, focusVisible, searchOpen, searchClosed });
  await page.close();

  const rpage = await browser.newPage({ viewport: viewports[390] });
  await rpage.goto(url(c.id, { id: 'read', path: '/comics/steklyannyj-gorod/read' }), { waitUntil: 'load' });
  // ждём гидратацию читалки: обработчик клавиш появляется только на клиенте
  await rpage.waitForTimeout(900);
  const before = await rpage.locator('.rd-count').innerText();
  await rpage.keyboard.press('ArrowRight');
  await rpage.waitForTimeout(200);
  const after = await rpage.locator('.rd-count').innerText();
  audit.keyboard.push({ concept: c.id, reader: { before, after, arrowsWork: before !== after } });
  await rpage.close();
}

// reduced motion
const rm = await browser.newContext({ reducedMotion: 'reduce', viewport: viewports[1440] });
const rmp = await rm.newPage();
await rmp.goto(`${BASE}/minimal?ui=0`, { waitUntil: 'load' });
audit.motion = await rmp.evaluate(() => {
  const pulse = document.querySelector('.pulse--live');
  const after = pulse ? getComputedStyle(pulse, '::after') : null;
  return {
    mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    pulseAnimation: after ? after.animationDuration : null,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
  };
});
await rm.close();
await browser.close();

if (!STATES_ONLY) {
  await mkdir(outRoot, { recursive: true });
  await writeFile(path.join(outRoot, 'audit.json'), JSON.stringify(audit, null, 2), 'utf8');
}

}
const contrastFailures = audit.contrast.flatMap((c) => c.failures.map((f) => ({ ...f, concept: c.concept, screen: c.screen })));
if (!STATES_ONLY) console.log(JSON.stringify({
  overflow: audit.overflow.length,
  contrastPagesWithFailures: audit.contrast.filter((c) => c.failures.length).length,
  contrastWorst: contrastFailures.sort((a, b) => a.ratio - b.ratio).slice(0, 8),
  keyboard: audit.keyboard,
  motion: audit.motion,
  js: audit.js.filter((j) => j.screen === 'home'),
  images: audit.images,
}, null, 2));
