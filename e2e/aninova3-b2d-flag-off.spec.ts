import { expect, test } from '@playwright/test';

const ROOT = '/preview/aninova-3';

const PREVIEW_PATHS = [
  `${ROOT}/search`,
  `${ROOT}/search?q=${encodeURIComponent('Фрирен')}`,
  `${ROOT}/top`,
  `${ROOT}/genres`,
  `${ROOT}/genre/action`,
  `${ROOT}/season`,
  `${ROOT}/season/zima-2027`,
  `${ROOT}/collections`,
  `${ROOT}/collections/novichku`,
  `${ROOT}/profile/settings`,
  `${ROOT}/privacy`,
  `${ROOT}/terms`,
  `${ROOT}/disclaimer`,
  `${ROOT}/dmca`,
  `${ROOT}/messages`,
  `${ROOT}/messages/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
];

test.describe('B2-D: preview-флаг выключен', () => {
  test('все новые preview-маршруты закрыты 404', async ({ page }) => {
    for (const path of PREVIEW_PATHS) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { level: 1 }), path).toContainText(/404|Такой страницы нет/);
    }
  });

  test('production-маршруты и данные не изменились', async ({ page }) => {
    const pages = [
      ['/search', 'Поиск'],
      ['/top', 'ТОП'],
      ['/genres', 'Жанры'],
      ['/genre/action', 'Экшен'],
      ['/season', 'Сезон'],
      ['/collections', 'Подборк'],
      ['/privacy', 'Политика конфиденциальности'],
      ['/terms', 'Пользовательское соглашение'],
      ['/disclaimer', 'Отказ от ответственности'],
      ['/dmca', 'DMCA'],
    ] as const;
    for (const [path, heading] of pages) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }).first(), path).toContainText(heading);
      await expect(page.locator('.a3'), path).toHaveCount(0);
    }
    await page.goto('/profile/settings');
    await expect(page.locator('.a3-settings-page')).toHaveCount(0);
  });

  test('API поиска сохраняет production-контракт и preview-проекцию', async ({ request }) => {
    const prod = await request.get('/api/search?q=Sousou&limit=1');
    expect(prod.status()).toBe(200);
    const prodJson = await prod.json();
    expect(prodJson.items[0].romaji).toContain('Sousou');
    expect(prodJson.items[0].href.startsWith('/anime/')).toBe(true);

    const preview = await request.get('/api/search?q=Sousou&limit=1&preview=1');
    expect(preview.status()).toBe(200);
    const previewJson = await preview.json();
    expect(previewJson.items[0].romaji).toBeUndefined();
    expect(previewJson.items[0].ru).not.toMatch(/[A-Za-z]/);
    expect(previewJson.items[0].href.startsWith(`${ROOT}/anime/`)).toBe(true);
  });
});
