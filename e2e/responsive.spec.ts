import { expect, test } from '@playwright/test';

const devices = [
  { name: 'phone portrait', width: 390, height: 844, minColumns: 2, mobileNav: true },
  { name: 'tablet portrait', width: 820, height: 1180, minColumns: 3, mobileNav: true },
  { name: 'desktop', width: 1440, height: 900, minColumns: 5, mobileNav: false },
] as const;

for (const device of devices) {
  test(`responsive catalog: ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto('/catalog?sort=pop', { waitUntil: 'domcontentloaded' });

    const firstCard = page.locator('.poster-grid .card').first();
    await expect(firstCard).toBeVisible();

    const layout = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('.poster-grid');
      const nav = document.querySelector<HTMLElement>('.mobile-nav');
      if (!grid || !nav) throw new Error('Expected catalog grid and responsive navigation.');
      const columns = getComputedStyle(grid).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g) ?? [];
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        columns: columns.length,
        mobileNavDisplay: getComputedStyle(nav).display,
        posterWidth: grid.querySelector<HTMLElement>('.card')?.getBoundingClientRect().width ?? 0,
      };
    });

    expect(
      layout.documentWidth,
      `horizontal overflow at ${device.width}px viewport: document width is ${layout.documentWidth}px`,
    ).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.columns).toBeGreaterThanOrEqual(device.minColumns);
    expect(layout.posterWidth).toBeGreaterThan(0);
    expect(layout.mobileNavDisplay === 'flex').toBe(device.mobileNav);
  });
}

test('TV mode scales the catalogue and exposes the large-screen focus layout', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/catalog?sort=pop', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    document.documentElement.dataset.tv = 'true';
  });

  const result = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('.poster-grid');
    const nav = document.querySelector<HTMLElement>('.mobile-nav');
    const card = grid?.querySelector<HTMLElement>('.card');
    if (!grid || !nav || !card) throw new Error('TV layout elements are missing.');
    const columns = getComputedStyle(grid).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g) ?? [];
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      columns: columns.length,
      cardWidth: card.getBoundingClientRect().width,
      mobileNavDisplay: getComputedStyle(nav).display,
    };
  });

  expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.columns).toBeGreaterThanOrEqual(6);
  expect(result.cardWidth).toBeGreaterThanOrEqual(220);
  expect(result.mobileNavDisplay).toBe('none');
});
