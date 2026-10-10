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
      const cards = Array.from(grid.querySelectorAll<HTMLElement>('.card'));
      const firstCardRect = cards[0]?.getBoundingClientRect();
      const columns = firstCardRect
        ? cards.filter((card) => Math.abs(card.getBoundingClientRect().top - firstCardRect.top) < 2).length
        : 0;
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        columns,
        mobileNavDisplay: getComputedStyle(nav).display,
        posterWidth: firstCardRect?.width ?? 0,
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
  await page.waitForFunction(() =>
    document.documentElement.dataset.tv === 'false' ||
    document.documentElement.dataset.tv === 'true',
  );
  await page.evaluate(() => {
    document.documentElement.dataset.tv = 'true';
  });

  const result = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('.poster-grid');
    const nav = document.querySelector<HTMLElement>('.mobile-nav');
    const cards = Array.from(grid?.querySelectorAll<HTMLElement>('.card') ?? []);
    const firstCardRect = cards[0]?.getBoundingClientRect();
    if (!grid || !nav || !firstCardRect) throw new Error('TV layout elements are missing.');
    const columns = cards.filter((card) =>
      Math.abs(card.getBoundingClientRect().top - firstCardRect.top) < 2,
    ).length;
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      columns,
      cardWidth: firstCardRect.width,
      mobileNavDisplay: getComputedStyle(nav).display,
    };
  });

  expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.columns).toBeGreaterThanOrEqual(6);
  expect(result.cardWidth).toBeGreaterThanOrEqual(220);
  expect(result.mobileNavDisplay).toBe('none');
});
