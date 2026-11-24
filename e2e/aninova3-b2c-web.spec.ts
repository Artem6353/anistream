import { expect, test, type Page } from '@playwright/test';

/**
 * B2-C: обычная сборка без Supabase и проверки двух долгов B2-B.
 *
 * Здесь нет тестовых ключей: приложение должно честно сказать, что вход не
 * настроен, а приватный кабинет — не пускать гостя. Настроенный вход проверяется
 * отдельным playwright.auth.config.ts с изолированным mock Supabase.
 */
const ROOT = '/preview/aninova-3';
const AUTH = `${ROOT}/auth`;
const PROFILE = `${ROOT}/profile`;

const EMBEDS = [
  {
    id: 'kodik-dub',
    label: 'Дубляж',
    providerId: 'kodik',
    providerName: 'Kodik',
    kind: 'embed' as const,
    embedUrl: 'about:blank',
    voice: 'voice' as const,
  },
];

async function mockSources(page: Page, sources: unknown[]) {
  await page.route('**/api/providers/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources }) }),
  );
  await page.route('**/api/availability/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: {} }) }),
  );
}

test.describe('B2-C: честное состояние без Supabase', () => {
  test('auth не имитирует вход и ведёт обратно в preview', async ({ page }) => {
    await page.goto(AUTH);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('История');
    await expect(page.getByRole('heading', { level: 2, name: 'Вход пока не настроен' })).toBeVisible();
    await expect(page.locator('.auth-form')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'На главную', exact: true })).toHaveAttribute('href', ROOT);
    await expect(page.locator('.a3-auth-page')).toContainText('NEXT_PUBLIC_SUPABASE_URL');
  });

  test('на телефоне auth открывается с заголовка, без прыжка к форме', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(AUTH);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const top = await page.getByRole('heading', { level: 1 }).evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(300);
  });

  test('гость не видит кабинет и возвращается после входа', async ({ page }) => {
    await page.goto(PROFILE);
    await page.waitForURL(/\/preview\/aninova-3\/auth\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('reason')).toBe('protected');
    expect(url.searchParams.get('next')).toBe(PROFILE);
    await expect(page.locator('.dash__name')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Вход пока не настроен' })).toBeVisible();
  });

  test('без ключей нет фиктивного пользователя и приватных данных', async ({ page }) => {
    const res = await page.goto(PROFILE);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/preview/aninova-3/auth\?`));
    await expect(page.locator('body')).not.toContainText('alice@example.com');
    await expect(page.locator('.dash__stats')).toHaveCount(0);
  });
});

test.describe('B2-C: долг B2-B — оригинальное название', () => {
  test('romaji нет в HTML, title, SEO, обложке, alt и aria', async ({ page }) => {
    await page.goto(`${ROOT}/anime/shingeki-no-kyojin`);
    await expect(page.locator('.a3-anime h1')).toContainText('Атака титанов');

    const title = await page.title();
    const html = await page.content();
    const meta = (await page.locator('meta').evaluateAll((nodes) =>
      nodes.map((n) => `${n.getAttribute('name') ?? n.getAttribute('property') ?? ''}:${n.getAttribute('content') ?? ''}`),
    )).join('\n');
    const alts = (await page.locator('img[alt]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('alt') ?? ''))).join('\n');
    const aria = (await page.locator('[aria-label]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label') ?? ''))).join('\n');

    const publicText = `${title}\n${html}\n${meta}\n${alts}\n${aria}`;
    expect(publicText).not.toContain('Shingeki no Kyojin');
    expect(publicText).not.toContain('Attack on Titan');
    await expect(page.locator('.a3-anime__orig')).toHaveCount(0);
    await expect(page.locator('[data-a3-romaji]')).toHaveCount(0);
  });

  test('инициалы постера — из русского названия, не из romaji', async ({ page }) => {
    await page.route('**/*', (route) =>
      route.request().resourceType() === 'image' ? route.abort() : route.continue(),
    );
    await page.goto(`${ROOT}/anime/shingeki-no-kyojin`);
    const poster = page.locator('.a3-anime__poster .poster-art').first();
    await expect(poster).toHaveAttribute('src', /^data:image\/svg/);
    const decoded = decodeURIComponent((await poster.getAttribute('src')) ?? '');
    expect(decoded).toMatch(/>АТ<\/text>/);
  });
});

test.describe('B2-C: долг B2-B — клавиша N', () => {
  const WATCH = `${ROOT}/anime/one-piece/1`;

  test('N внутри сцены/контролов ведёт на следующую серию', async ({ page }) => {
    await mockSources(page, EMBEDS);
    await page.goto(WATCH);
    await page.locator('.a3-stage').focus();
    await page.keyboard.press('n');
    await page.waitForURL(`${ROOT}/anime/one-piece/2`);
  });

  test('N вне сцены не перехватывается', async ({ page }) => {
    await mockSources(page, EMBEDS);
    await page.goto(WATCH);
    await page.locator('.a3-nav__link').first().focus();
    const before = page.url();
    await page.keyboard.press('n');
    await page.waitForTimeout(250);
    expect(page.url()).toBe(before);
  });

  test('N в поле поиска печатается, а не переключает серию', async ({ page }) => {
    await mockSources(page, EMBEDS);
    await page.goto(WATCH);
    await page.getByRole('button', { name: 'Поиск по каталогу' }).click();
    const input = page.getByRole('searchbox');
    await expect(input).toBeFocused();
    await page.keyboard.press('n');
    await expect(input).toHaveValue('n');
    expect(new URL(page.url()).pathname).toBe(WATCH);
  });

  test('N в диалоге жалобы не уводит со страницы', async ({ page }) => {
    await mockSources(page, EMBEDS);
    await page.route('**/api/report', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    );
    await page.goto(WATCH);
    await page.getByRole('button', { name: 'Пожаловаться', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Жалоба на источник' });
    await expect(dialog).toBeVisible();
    const before = page.url();
    await page.keyboard.press('n');
    await page.waitForTimeout(250);
    expect(page.url()).toBe(before);
    await expect(dialog).toBeVisible();
  });

  test('N без следующей серии не ломает страницу', async ({ page }) => {
    await mockSources(page, EMBEDS);
    await page.goto(`${ROOT}/anime/one-piece/1134`);
    await page.locator('.a3-stage').focus();
    const before = page.url();
    const errors: Error[] = [];
    page.on('pageerror', (e) => errors.push(e));
    await page.keyboard.press('n');
    await page.waitForTimeout(300);
    expect(page.url()).toBe(before);
    expect(errors).toEqual([]);
    await expect(page.locator('.a3-watchhead__nav a[rel="next"]')).toHaveCount(0);
  });
});

test.describe('B2-C: адаптивность auth и профиля', () => {
  test('нет горизонтальной прокрутки на 360…3840', async ({ page }) => {
    test.setTimeout(120_000);
    for (const width of [360, 390, 430, 768, 1024, 1280, 1440, 1920, 3840]) {
      await page.setViewportSize({ width, height: width >= 1024 ? 1080 : 844 });
      await page.goto(AUTH);
      const authOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(authOverflow, `auth at ${width}`).toBeLessThanOrEqual(1);
      await page.goto(PROFILE);
      await page.waitForURL(/\/preview\/aninova-3\/auth\?/);
      const profileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(profileOverflow, `profile at ${width}`).toBeLessThanOrEqual(1);
    }
  });
});
