import { expect, test } from '@playwright/test';

/**
 * B2-B: без ANINOVA3_PREVIEW страница серии и театр закрыты, production жив.
 *
 * Файл запускается проектом preview-off на сервере без флага
 * (см. playwright.config.ts). Проверяется и 404, и отсутствие оболочки A3,
 * и работоспособность текущего сайта.
 */

test('B2-B: /preview/aninova-3/anime/one-piece/1 закрыт без флага', async ({ page }) => {
  for (const path of [
    '/preview/aninova-3/anime/one-piece/1',
    '/preview/aninova-3/anime/one-piece/2',
    '/preview/aninova-3/anime/one-piece/1134',
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.locator('[data-a3-root]'), path).toHaveCount(0);
    await expect(page.locator('.a3-stage, .a3-header, .a3-bottomnav'), path).toHaveCount(0);
  }

  const home = await page.goto('/');
  expect(home?.status()).toBe(200);
});
