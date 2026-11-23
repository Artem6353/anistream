import { expect, test } from '@playwright/test';

/**
 * B2-A: preview закрыт без флага ANINOVA3_PREVIEW.
 *
 * Файл запускается отдельным Playwright-проектом на сервере БЕЗ переменной
 * ANINOVA3_PREVIEW (см. playwright.config.ts: webServer[1] и projects['preview-off']).
 * Проверяется не только 404, но и отсутствие оболочки preview в ответе.
 */

const ROUTES = ['', '/catalog', '/anime/one-piece', '/schedule', '/comics'];

for (const route of ROUTES) {
  test(`preview закрыт без флага: ${route || '/'}`, async ({ page }) => {
    const res = await page.goto(`/preview/aninova-3${route}`);
    expect(res?.status()).toBe(404);
    /* Оболочка нового интерфейса не должна рендериться вообще. */
    await expect(page.locator('[data-a3-root]')).toHaveCount(0);
    await expect(page.locator('.a3-hero, .a3-header, .a3-bottomnav')).toHaveCount(0);
    /* Текущий сайт при этом работает: каталог не затронут флагом. */
    const catalog = await page.goto('/catalog');
    expect(catalog?.status()).toBe(200);
  });
}
