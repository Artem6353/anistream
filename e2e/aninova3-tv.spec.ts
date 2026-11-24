import { expect, test } from '@playwright/test';

/**
 * B1-B: TV/remote UX на preview-маршрутах (флаг ANINOVA3_PREVIEW=1).
 * Проверяются стрелки, Enter, Escape/Back, удержание и восстановление фокуса,
 * поиск, меню и каталог. Физический ТВ/пульт не используется — только клавиатура.
 */

const HOME = '/preview/aninova-3';
const active = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? { tag: el.tagName, label: (el.textContent ?? '').trim().slice(0, 40), cls: el.className } : null;
  });

test.describe('AniNova 3.0 TV UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('a3:tv', '1');
      sessionStorage.setItem('a3:hint-seen', '1');
    });
  });

  test('стрелки ведут по шапке, Enter открывает каталог', async ({ page }) => {
    await page.goto(`${HOME}?tv=1`);
    await expect(page.locator('.a3')).toHaveAttribute('data-tv', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.a3-logo')).toBeFocused();
    for (let i = 0; i < 6; i++) {
      const a = await active(page);
      if (a?.label.includes('Каталог')) break;
      await page.keyboard.press('ArrowRight');
    }
    await expect(page.locator('.a3-nav__link', { hasText: 'Каталог' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/catalog/);
    await expect(page.locator('h1')).toContainText('Найти своё');
  });

  test('каталог: строки достижимы стрелками, Enter открывает тайтл, Escape возвращает фокус', async ({ page }) => {
    await page.goto(`${HOME}/catalog?tv=1`);
    const firstRow = page.locator('.a3-row').first();
    await expect(firstRow).toBeVisible();
    // Фокус на строке каталога, затем пульт ведёт по строкам вниз.
    await firstRow.focus();
    await page.keyboard.press('ArrowDown');
    const focusedRow = page.locator('.a3-row:focus');
    await expect(focusedRow).toHaveCount(1);
    const href = await focusedRow.getAttribute('href');
    await page.keyboard.press('Enter');
    await page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.locator('.a3-anime__title')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForURL(/\/catalog/);
    await expect(page.locator(`.a3-row[href="${href}"]`)).toBeFocused();
  });

  test('поиск: фокус в поле, результаты стрелками, Esc и возврат фокуса', async ({ page }) => {
    await page.goto(`${HOME}?tv=1`);
    const trigger = page.getByRole('button', { name: 'Поиск по каталогу' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const input = page.locator('.a3-search__input');
    await expect(input).toBeFocused();
    await page.keyboard.type('фри');
    await expect(page.locator('.a3-search__hit').first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.a3-search__hit').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.a3-search')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('мобильное меню удерживает фокус и возвращает его на кнопку', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME);
    const trigger = page.locator('.a3-menubtn');
    await trigger.click();
    await expect(page.locator('.a3-menu')).toBeVisible();
    await expect(page.locator('.a3-menu__item').first()).toBeFocused();
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('.a3-menu'));
    expect(inside).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.a3-menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('фокус заметен на тёмном фоне', async ({ page }) => {
    await page.goto(`${HOME}?tv=1`);
    /* Ждём включения TV-режима: без этого первый ArrowDown иногда приходит
       раньше инициализации навигатора (флейк B1-D, воспроизводился ~1/10). */
    await expect(page.locator('.a3')).toHaveAttribute('data-tv', 'true');
    await page.keyboard.press('ArrowDown');
    const outline = await page.locator('.a3-logo').evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor };
    });
    expect(outline.style).not.toBe('none');
    expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(3);
  });

  test('плеер: сцена получает фокус, стрелки не меняют маршрут', async ({ page }) => {
    await page.goto(`${HOME}/anime/one-piece/1?tv=1`);
    const stage = page.locator('.a3-stage');
    await expect(stage).toBeVisible();
    await stage.focus();
    const before = page.url();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    expect(page.url()).toBe(before);
    await expect(stage).toBeFocused();
  });

  test('чип жанра в каталоге активируется с пульта', async ({ page }) => {
    await page.goto(`${HOME}/catalog?tv=1`);
    const chip = page.locator('.a3-chip', { hasText: 'Комедия' }).first();
    await chip.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/genre=comedy/);
    await expect(page.locator('.a3-chip.is-on', { hasText: 'Комедия' })).toBeVisible();
  });
});
