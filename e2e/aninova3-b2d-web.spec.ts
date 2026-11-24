import { expect, test, type Page } from '@playwright/test';

const ROOT = '/preview/aninova-3';
const SETTINGS = `${ROOT}/profile/settings`;

async function noOverflow(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), { timeout: 5_000 })
    .toBe(true);
}

function previewCanonical(page: Page) {
  return page.locator('link[rel="canonical"]').getAttribute('href');
}

test.describe('B2-D: поиск по реальному каталогу', () => {
  test('русский запрос, реальный счёт и карточки ведут в preview', async ({ page }) => {
    await page.goto(`${ROOT}/search?q=${encodeURIComponent('Фрирен')}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Поиск по каталогу' })).toBeVisible();
    await expect(page.locator('#search-results-title')).toContainText(/результат/);
    await expect(page.locator('.a3-card__title').filter({ hasText: 'Фрирен' }).first()).toBeVisible();
    const href = await page.locator('.a3-card').first().getAttribute('href');
    expect(href).toBeTruthy();
    expect(href!.startsWith(`${ROOT}/anime/`)).toBe(true);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/preview\/aninova-3\/search$/);
  });

  test('внутреннее альтернативное название находит русскую карточку без ромадзи', async ({ page }) => {
    await page.goto(`${ROOT}/search?q=Sousou`);
    await expect(page.locator('.a3-card__title').filter({ hasText: 'Фрирен' }).first()).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('Sousou no Frieren');
    expect(html).not.toContain('Sousou no Frieren:');
    expect(await page.locator('.a3-card').count()).toBeGreaterThan(1);
  });

  test('пустой запрос и отсутствие результатов честные, страница не падает', async ({ page }) => {
    await page.goto(`${ROOT}/search`);
    await expect(page.getByRole('heading', { level: 2, name: 'Начните с названия или жанра' })).toBeVisible();
    await page.goto(`${ROOT}/search?q=zzzz-no-such-title`);
    await expect(page.getByRole('heading', { level: 2, name: /Ничего не найдено/ })).toBeVisible();
    await expect(page.locator('.a3-card')).toHaveCount(0);
  });

  test('пагинация сохраняет запрос и остаётся ограниченной', async ({ page }) => {
    await page.goto(`${ROOT}/search?q=${encodeURIComponent('аниме')}`);
    const next = page.getByRole('link', { name: 'Вперёд →' });
    if (await next.count()) {
      const href = await next.getAttribute('href');
      expect(href).toContain('q=');
      await next.click();
      await expect(page).toHaveURL(/q=/);
      expect(new URL(page.url()).searchParams.get('q')).toContain('аниме');
    }
  });

  test('оверлей: debounce, подсказки, клавиатура, ошибка API и возврат фокуса', async ({ page }) => {
    await page.goto(ROOT);
    const trigger = page.getByRole('button', { name: 'Поиск по каталогу' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Поиск по каталогу' });
    await expect(dialog).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('searchbox', { name: 'Поисковый запрос' })).toBeFocused();

    await page.getByRole('searchbox', { name: 'Поисковый запрос' }).fill('Фрирен');
    await expect(page.locator('.a3-search__hit').filter({ hasText: 'Фрирен' }).first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.a3-search__hit').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();

    await page.unroute('**/api/search**');
    await page.route('**/api/search**', (route) => route.fulfill({ status: 503, body: 'down' }));
    await trigger.click();
    await page.getByRole('searchbox', { name: 'Поисковый запрос' }).fill('Фрирен');
    await expect(page.getByRole('alert').filter({ hasText: 'Поиск недоступен' })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
  });

  test('поиск с клавиатуры открывается по / и закрывается Escape', async ({ page }) => {
    await page.goto(ROOT);
    await page.keyboard.press('/');
    const dialog = page.getByRole('dialog', { name: 'Поиск по каталогу' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Поисковый запрос' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('B2-D: рейтинг, жанры, сезоны, коллекции', () => {
  test('ТОП-250 показывает реальные оценки и preview-ссылки', async ({ page }) => {
    await page.goto(`${ROOT}/top`);
    await expect(page.getByRole('heading', { level: 1, name: 'ТОП-250 аниме' })).toBeVisible();
    await expect(page.locator('.a3-toplist__item').first()).toBeVisible();
    await expect(page.locator('.a3-toplist__item')).toHaveCount(250);
    const href = await page.locator('.a3-toplist__title a').first().getAttribute('href');
    expect(href!.startsWith(`${ROOT}/anime/`)).toBe(true);
    await expect(page.locator('.a3-toplist__score').first()).toContainText(/\d\.\d/);
  });

  test('жанры: реальные счётчики, фильтр, сортировки и 404 вне диапазона', async ({ page }) => {
    await page.goto(`${ROOT}/genres`);
    await expect(page.getByRole('heading', { level: 1, name: 'Жанры аниме' })).toBeVisible();
    const action = page.getByRole('link', { name: /Экшен/ }).first();
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute('href', `${ROOT}/genre/action`);
    await action.click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Экшен');
    await expect(page.locator('.a3-grid .a3-card').first()).toBeVisible();
    await page.getByRole('link', { name: 'По рейтингу' }).click();
    await expect(page).toHaveURL(/sort=score/);
    await page.locator('.a3-pagebtn').filter({ hasText: 'Вперёд' }).click();
    await expect(page).toHaveURL(/page=2/);
    const bad = await page.goto(`${ROOT}/genre/not-a-genre`);
    expect(bad?.status()).toBe(404);
    const over = await page.goto(`${ROOT}/genre/action?page=9999`);
    expect(over?.status()).toBe(404);
  });

  test('сезоны: реальная подборка, соседние сезоны и preview-ссылки', async ({ page }) => {
    await page.goto(`${ROOT}/season`);
    await expect(page.getByRole('heading', { level: 1, name: 'Сезоны аниме' })).toBeVisible();
    const first = page.locator('.a3-season-card').first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Аниме');
    await expect(page.locator('.a3-season-editorial p').first()).toBeVisible();
    await expect(page.locator('.a3-grid .a3-card').first()).toBeVisible();
    const adjacent = page.locator('.a3-season-nav a').first();
    await expect(adjacent).toBeVisible();
    await adjacent.click();
    await expect(page).toHaveURL(/\/preview\/aninova-3\/season\//);
  });

  test('подборки: реальные карточки и 404 для неизвестного slug', async ({ page }) => {
    await page.goto(`${ROOT}/collections`);
    await expect(page.getByRole('heading', { level: 1, name: 'Подборки аниме' })).toBeVisible();
    const first = page.locator('.a3-collection-card h2 a').first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.a3-grid .a3-card').first()).toBeVisible();
    const bad = await page.goto(`${ROOT}/collections/no-such-collection`);
    expect(bad?.status()).toBe(404);
  });

  test('в утилитах нет публичных romaji/original и все ссылки внутренние', async ({ page }) => {
    for (const path of [`${ROOT}/top`, `${ROOT}/genre/action`, `${ROOT}/season`, `${ROOT}/collections`]) {
      await page.goto(path);
      const html = await page.content();
      expect(html).not.toContain('Shingeki no Kyojin');
      expect(html).not.toContain('Sousou no Frieren');
      const external = await page.locator('a[href^="/"]').evaluateAll((as) => as
        .map((a) => a.getAttribute('href') ?? '')
        .filter((href) => href && !href.startsWith('/preview/aninova-3') && !href.startsWith('#') && !href.startsWith('/api/')));
      expect(external).toEqual([]);
    }
  });
});

test.describe('B2-D: правовые страницы', () => {
  const pages = [
    ['privacy', 'Политика конфиденциальности'],
    ['terms', 'Пользовательское соглашение'],
    ['disclaimer', 'Отказ от ответственности'],
    ['dmca', 'DMCA: как подать жалобу'],
  ] as const;

  for (const [slug, title] of pages) {
    test(`${slug}: текст сохранён, noindex и preview canonical`, async ({ page }) => {
      await page.goto(`${ROOT}/${slug}`);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      const canonical = await previewCanonical(page);
      expect(canonical).toBeTruthy();
      expect(new URL(canonical!, page.url()).pathname).toBe(`${ROOT}/${slug}`);
      await expect(page.locator('.a3-legal')).toBeVisible();
    });
  }

  test('ссылки документов ведут в preview, без production canonical', async ({ page }) => {
    await page.goto(`${ROOT}/privacy`);
    const legal = page.locator('.a3-legal a, footer a').filter({ hasText: /Конфиденциальность|Соглашение|Отказ|DMCA/ });
    expect(await legal.count()).toBeGreaterThan(0);
    for (const href of await legal.evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))) {
      expect(href.startsWith(`${ROOT}/`)).toBe(true);
    }
    const canonical = await previewCanonical(page);
    expect(canonical).not.toContain('anistream');
  });
});

test.describe('B2-D: настройки на существующей библиотеке', () => {
  test('автопереход, провайдер, reduce motion и ТВ переживают reload', async ({ page }) => {
    await page.goto(SETTINGS);
    const autoplay = page.getByRole('checkbox', { name: /Автопереход/ });
    const reduce = page.getByRole('checkbox', { name: /Меньше анимаций/ });
    const tv = page.getByRole('checkbox', { name: /ТВ-режим и D-pad/ });
    await expect(autoplay).toBeChecked();
    await autoplay.uncheck();
    await reduce.check();
    await tv.check();
    await page.getByRole('combobox', { name: /Провайдер плеера/ }).selectOption('kodik');
    await expect(page.locator('.a3')).toHaveAttribute('data-tv', 'true');
    await expect(page.getByRole('button', { name: 'ТВ', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(autoplay).not.toBeChecked();
    await expect(reduce).toBeChecked();
    await expect(tv).toBeChecked();
    await expect(page.getByRole('combobox', { name: /Провайдер плеера/ })).toHaveValue('kodik');
    await expect(page.locator('.a3')).toHaveAttribute('data-tv', 'true');
  });

  test('очистка истории требует подтверждения и не трогает закладки', async ({ page }) => {
    await page.goto(SETTINGS);
    await page.evaluate(() => {
      localStorage.setItem('anistream:history', JSON.stringify([{ slug: 'one-piece', episode: 3, position: 10, duration: 24, updated_at: new Date().toISOString() }]));
      localStorage.setItem('anistream:bookmarks', JSON.stringify(['one-piece']));
    });
    await page.reload();
    await expect(page.getByText(/записей истории:/)).toContainText('1');
    await page.getByRole('button', { name: 'Очистить историю' }).click();
    await expect(page.locator('.a3-confirm')).toContainText('Очистить всю историю');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anistream:history') || '[]').length)).toBe(1);
    await page.getByRole('button', { name: 'Отмена' }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anistream:history') || '[]').length)).toBe(1);
    await page.getByRole('button', { name: 'Очистить историю' }).click();
    await page.getByRole('button', { name: 'Да, очистить историю' }).click();
    await expect(page.locator('.a3-settings-feedback')).toContainText('История просмотров очищена');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anistream:history') || '[]').length)).toBe(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anistream:bookmarks') || '[]'))).toEqual(['one-piece']);
  });

  test('удаление локальных данных подтверждается и сбрасывает настройки', async ({ page }) => {
    await page.goto(SETTINGS);
    await page.evaluate(() => {
      localStorage.setItem('anistream:bookmarks', JSON.stringify(['one-piece']));
      localStorage.setItem('anistream:history', JSON.stringify([]));
      localStorage.setItem('anistream:settings', JSON.stringify({ autoplayNext: false, tvMode: true }));
      localStorage.setItem('a3:tv', '1');
    });
    await page.reload();
    await expect(page.locator('.a3')).toHaveAttribute('data-tv', 'true');
    await page.getByRole('button', { name: 'Удалить локальные данные' }).click();
    await expect(page.locator('.a3-confirm')).toContainText('Удалить закладки');
    await page.getByRole('button', { name: 'Отмена' }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anistream:bookmarks') || '[]'))).toEqual(['one-piece']);
    await page.getByRole('button', { name: 'Удалить локальные данные' }).click();
    await page.getByRole('button', { name: 'Да, удалить всё' }).click();
    await expect(page.locator('.a3-settings-feedback')).toContainText('Локальные данные удалены');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anistream:bookmarks') || '[]'))).toEqual([]);
    await expect(page.locator('.a3')).toHaveAttribute('data-tv', 'false');
    await expect(page.getByRole('checkbox', { name: /Автопереход/ })).toBeChecked();
  });

  test('акцент не показан активным, темы нет, ссылки кабинета preview', async ({ page }) => {
    await page.goto(SETTINGS);
    await expect(page.locator('.a3-settings-page [aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByText('Тема и акцент в preview зафиксированы тёмными')).toBeVisible();
    await expect(page.getByRole('link', { name: /Открыть личный кабинет/ })).toHaveAttribute('href', `${ROOT}/profile`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('B2-D: навигация и доступность', () => {
  test('меню, футер и шапка ведут только в preview и не раздувают bottom nav', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROOT);
    const footer = page.locator('footer');
    for (const href of await footer.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))) {
      expect(href.startsWith(`${ROOT}`)).toBe(true);
    }
    await expect(page.locator('.a3-bottomnav a')).toHaveCount(5);
    const menu = page.getByRole('button', { name: 'Меню разделов' });
    await menu.click();
    const dialog = page.getByRole('dialog', { name: 'Меню разделов' });
    await expect(dialog).toBeVisible();
    for (const label of ['Поиск по каталогу', 'ТОП-250', 'Жанры', 'Сезоны', 'Подборки', 'Настройки', 'Сообщения', 'Конфиденциальность', 'DMCA']) {
      const link = dialog.getByRole('link', { name: label, exact: true });
      await expect(link).toBeVisible();
      expect((await link.getAttribute('href'))!.startsWith(`${ROOT}`)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(menu).toBeFocused();
  });

  test('видимый фокус, skip-link, aria-current и семантика', async ({ page }) => {
    await page.goto(SETTINGS);
    await page.keyboard.press('Tab');
    const active = page.locator(':focus');
    await expect(active).toHaveClass(/a3-skip/);
    const outline = await active.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
    });
    expect(outline.outlineStyle !== 'none' || outline.boxShadow !== 'none').toBe(true);
    await expect(page.getByRole('main')).toHaveAttribute('id', 'a3-content');
    await expect(page.locator('nav[aria-label="Хлебные крошки"]')).toBeVisible();
    await expect(page).toHaveTitle(/Настройки/);
  });

  test('reduce motion отключает длительные переходы', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${ROOT}/search?q=${encodeURIComponent('Фрирен')}`);
    const duration = await page.locator('.a3-card').first().evaluate((el) => getComputedStyle(el).transitionDuration);
    const seconds = duration.endsWith('ms') ? Number.parseFloat(duration) / 1000 : Number.parseFloat(duration);
    expect(seconds).toBeLessThanOrEqual(0.001);
    const scroll = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    expect(scroll).toBe('auto');
  });
});

test.describe('B2-D: адаптивность', () => {
  test('все обязательные ширины без горизонтального переполнения', async ({ page }) => {
    test.setTimeout(180_000);
    const routes = [`${ROOT}/search?q=${encodeURIComponent('Фрирен')}`, SETTINGS, `${ROOT}/top`, `${ROOT}/genres`, `${ROOT}/season`, `${ROOT}/collections`, `${ROOT}/privacy`];
    for (const width of [360, 390, 430, 768, 1024, 1280, 1440, 1920, 3840]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        await page.goto(route);
        await noOverflow(page);
      }
    }
  });

  test('ключевые цели не меньше 44px на телефоне', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROOT);
    for (const selector of ['.a3-header .a3-iconbtn', '.a3-bottomnav__item']) {
      const boxes = await page.locator(selector).evaluateAll((els) =>
        els
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => [r.width, r.height]),
      );
      expect(boxes.length).toBeGreaterThan(0);
      for (const [w, h] of boxes) {
        expect(w).toBeGreaterThanOrEqual(44);
        expect(h).toBeGreaterThanOrEqual(44);
      }
    }
    await page.goto(`${ROOT}/genres`);
    const chips = await page.locator('.a3-genre-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(chips.length).toBeGreaterThan(0);
    expect(Math.min(...chips)).toBeGreaterThanOrEqual(44);
  });

  test('ТВ-режим на 1920 включает крупные цели и data-tv', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(ROOT);
    await page.getByRole('button', { name: 'ТВ', exact: true }).click();
    await expect(page.locator('.a3')).toHaveAttribute('data-tv', 'true');
    await expect(page.locator('.a3-bottomnav')).toBeHidden();
    const box = await page.locator('.a3-header .a3-iconbtn').first().boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
