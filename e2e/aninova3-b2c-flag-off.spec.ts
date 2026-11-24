import { expect, test } from '@playwright/test';

/** B2-C: без ANINOVA3_PREVIEW новый раздел закрыт, production-маршруты не задеты. */
const ROOT = '/preview/aninova-3';

test.describe('B2-C: preview-флаг выключен', () => {
  test('закрыты auth, profile и public profile', async ({ page }) => {
    for (const path of [`${ROOT}/auth`, `${ROOT}/profile`, `${ROOT}/profile/alice`]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/404|Такой страницы нет/);
    }
  });

  test('production /auth и защита /profile остаются прежними', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Вход пока не настроен');
    await expect(page.locator('.a3-auth-page')).toHaveCount(0);

    await page.goto('/profile');
    await page.waitForURL(/\/auth\?/);
    expect(new URL(page.url()).pathname).toBe('/auth');
    expect(new URL(page.url()).searchParams.get('next')).toBe('/profile');
    await expect(page.locator('.a3-auth-page')).toHaveCount(0);
  });
});
