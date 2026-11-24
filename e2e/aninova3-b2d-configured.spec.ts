import { expect, test, type Page } from '@playwright/test';

const ROOT = '/preview/aninova-3';
const AUTH = `${ROOT}/auth`;
const PROFILE = `${ROOT}/profile`;
const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';
const CAROL = 'carol@example.com';
const PASSWORD = 'password123';
const THREAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function login(page: Page, email = ALICE, next = PROFILE) {
  await page.goto(`${AUTH}?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.locator('.auth-form input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.waitForURL((url) => url.pathname === next, { timeout: 15_000 });
}

test.beforeEach(async ({ request }) => {
  const res = await request.post('http://127.0.0.1:54321/__test/reset');
  expect(res.ok()).toBe(true);
});

test.describe('B2-D: сообщения на реальном RLS-потоке', () => {
  test('гость уходит на preview-вход с безопасным next', async ({ page }) => {
    await page.goto(`${ROOT}/messages`);
    await page.waitForURL(new RegExp(`${AUTH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?`));
    const url = new URL(page.url());
    expect(url.pathname).toBe(AUTH);
    expect(url.searchParams.get('reason')).toBe('protected');
    expect(url.searchParams.get('next')).toBe(`${ROOT}/messages`);
    await expect(page.getByRole('heading', { level: 2, name: 'С возвращением' })).toBeVisible();
  });

  test('список: реальный собеседник, последнее сообщение, unread и preview-ссылка', async ({ page }) => {
    await login(page, ALICE, `${ROOT}/messages`);
    const item = page.locator('.a3-dm-list__item');
    await expect(item).toHaveCount(1);
    await expect(item.locator('.a3-dm-list__name')).toHaveText('bob');
    await expect(item.locator('.a3-dm-list__preview')).toContainText('Проверяем список и отправку');
    await expect(item.locator('.a3-dm-unread')).toHaveText('1');
    const href = await item.getAttribute('href');
    expect(href).toBe(`${ROOT}/messages/${THREAD}`);
  });

  test('тред: сообщения, отметка прочитанного и возврат в список без unread', async ({ page }) => {
    await login(page, ALICE, `${ROOT}/messages`);
    await page.locator('.a3-dm-list__item').click();
    await expect(page).toHaveURL(`${ROOT}/messages/${THREAD}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Чат с bob');
    await expect(page.locator('.a3-dm__msg')).toHaveCount(2);
    await expect(page.locator('.a3-dm__box')).toContainText('тестовый диалог B2-D');
    await expect(page.locator('.a3-dm__box')).toContainText('Проверяем список и отправку');
    await page.getByRole('link', { name: '← Все диалоги' }).click();
    await expect(page.locator('.a3-dm-unread')).toHaveCount(0);
  });

  test('отправка сообщения появляется в треде и в последнем сообщении списка', async ({ page }) => {
    await login(page, ALICE, `${ROOT}/messages/${THREAD}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Чат с bob');
    const text = `Проверка отправки ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Текст сообщения' }).fill(text);
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByRole('log')).toContainText(text);
    await page.getByRole('link', { name: '← Все диалоги' }).click();
    await expect(page.locator('.a3-dm-list__preview')).toContainText(text.slice(0, 28));
  });

  test('пустой список Carol — честное состояние без фиктивных диалогов', async ({ page }) => {
    await login(page, CAROL, `${ROOT}/messages`);
    await expect(page.getByRole('heading', { level: 2, name: 'Диалогов пока нет' })).toBeVisible();
    await expect(page.locator('.a3-dm-list__item')).toHaveCount(0);
  });

  test('чужой диалог не раскрывается: Carol не участник треда Alice/Bob', async ({ page }) => {
    await login(page, CAROL, `${ROOT}/messages/${THREAD}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Диалог недоступен' })).toBeVisible();
    await expect(page.locator('.a3-dm__msg')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Текст сообщения' })).toHaveCount(0);
    await expect(page.locator('.a3-dm')).not.toContainText('тестовый диалог B2-D');
  });

  test('ошибка загрузки показывает alert и retry, не пустой успешный список', async ({ page }) => {
    await page.route('**/rest/v1/dm_threads*', (route) => route.fulfill({ status: 503, body: 'down' }));
    await login(page, ALICE, `${ROOT}/messages`);
    await expect(page.locator('.a3-messages [role="alert"]')).toContainText('Сообщения недоступны');
    await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
  });

  test('таймер поллинга очищается при уходе из треда', async ({ page }) => {
    await page.addInitScript(() => {
      const set = window.setInterval.bind(window);
      const clear = window.clearInterval.bind(window);
      const timers = new Set<number>();
      (window as unknown as { __dmTimers: Set<number> }).__dmTimers = timers;
      window.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
        const id = set(fn, ms, ...args);
        if (ms === 5000) timers.add(id);
        return id;
      }) as typeof window.setInterval;
      window.clearInterval = ((id?: number) => {
        if (typeof id === 'number') timers.delete(id);
        return clear(id);
      }) as typeof window.clearInterval;
    });
    await login(page, ALICE, `${ROOT}/messages/${THREAD}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Чат с bob');
    expect(await page.evaluate(() => (window as unknown as { __dmTimers: Set<number> }).__dmTimers.size)).toBe(1);
    await page.getByRole('link', { name: '← Все диалоги' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Сообщения' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __dmTimers: Set<number> }).__dmTimers.size)).toBe(0);
  });
});

test.describe('B2-D: Follow и DM в preview', () => {
  test('гость Follow ведёт на preview-вход с next на публичный профиль', async ({ page }) => {
    await page.goto(`${ROOT}/profile/bob`);
    const follow = page.getByRole('button', { name: 'Подписаться' });
    await expect(follow).toBeVisible();
    await follow.click();
    await page.waitForURL(new RegExp(`/preview/aninova-3/auth\\?`));
    const url = new URL(page.url());
    expect(url.pathname).toBe(AUTH);
    expect(url.searchParams.get('next')).toBe(`${ROOT}/profile/bob`);
  });

  test('гость DM ведёт на preview-вход, без production AuthModal', async ({ page }) => {
    await page.goto(`${ROOT}/profile/bob`);
    const dm = page.getByRole('button', { name: /Написать сообщение bob/ });
    await expect(dm).toBeVisible();
    await dm.click();
    await page.waitForURL(new RegExp(`/preview/aninova-3/auth\\?`));
    const url = new URL(page.url());
    expect(url.pathname).toBe(AUTH);
    expect(url.searchParams.get('next')).toBe(`${ROOT}/profile/bob`);
    await expect(page.locator('.auth-modal, .modal')).toHaveCount(0);
  });

  test('вошедший Follow подписывается и отписывается через реальный API', async ({ page }) => {
    await login(page, ALICE, `${ROOT}/profile/bob`);
    const follow = page.getByRole('button', { name: 'Подписаться' });
    await expect(follow).toBeVisible();
    await follow.click();
    await expect(page.getByRole('button', { name: 'Отписаться' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Отписаться' }).click();
    await expect(page.getByRole('button', { name: 'Подписаться' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('вошедший DM открывает реальный preview-тред, не production', async ({ page }) => {
    await login(page, ALICE, `${ROOT}/profile/bob`);
    await page.getByRole('button', { name: /Написать сообщение bob/ }).click();
    await page.waitForURL(new RegExp(`${ROOT}/messages/[0-9a-f-]+$`));
    expect(new URL(page.url()).pathname.startsWith(`${ROOT}/messages/`)).toBe(true);
    expect(new URL(page.url()).pathname.startsWith('/messages/')).toBe(false);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Чат с bob');
    await expect(page.locator('.a3-dm')).toContainText('тестовый диалог B2-D');
  });
});

test.describe('B2-D: изоляция локальных настроек', () => {
  test('настройки Alice не попадают в аккаунт Bob', async ({ page }) => {
    await login(page, ALICE, `${ROOT}/profile/settings`);
    const autoplay = page.getByRole('checkbox', { name: /Автопереход/ });
    await expect(autoplay).toBeChecked();
    await autoplay.uncheck();
    await page.reload();
    await expect(autoplay).not.toBeChecked();
    await page.request.post('/api/auth/signout');
    await page.evaluate(() => localStorage.removeItem('anistream:supa_token'));
    await login(page, BOB, `${ROOT}/profile/settings`);
    await expect(page.getByRole('checkbox', { name: /Автопереход/ })).toBeChecked();
  });
});
