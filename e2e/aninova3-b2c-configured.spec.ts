import { expect, test, type Page } from '@playwright/test';

/**
 * B2-C: реальные сценарии входа и кабинета на изолированном mock Supabase.
 *
 * Запускается отдельно (playwright.auth.config.ts), потому что основной preview-билд
 * намеренно собирается без Supabase и проверяет честное состояние «не настроено».
 * Mock не является фикстурой приложения: сервер лежит в e2e и нужен только тесту.
 */
const ROOT = '/preview/aninova-3';
const AUTH = `${ROOT}/auth`;
const PROFILE = `${ROOT}/profile`;
const ALICE = 'alice@example.com';
const PASSWORD = 'password123';

async function login(page: Page, email = ALICE, next = PROFILE, expected = next) {
  await page.goto(`${AUTH}?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.locator('.auth-form input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.waitForURL(new RegExp(`${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), { timeout: 15_000 });
}

test.describe('B2-C: вход', () => {
  test('hero H1 и форма H2, переключение входа и регистрации', async ({ page }) => {
    await page.goto(AUTH);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('История');
    await expect(page.getByRole('heading', { level: 2, name: 'С возвращением' })).toBeVisible();
    await page.getByRole('tab', { name: 'Регистрация' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Создать аккаунт' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ник' })).toBeVisible();
    await page.getByRole('tab', { name: 'Вход' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'С возвращением' })).toBeVisible();
  });

  test('на телефоне форма входа помещается в первый экран', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(AUTH, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 2, name: 'С возвращением' })).toBeInViewport();
    const submit = page.locator('.auth-form button[type=submit]');
    await expect(submit).toBeVisible();
    const box = await submit.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(790);
    await expect(page.locator('.a3-auth-page__benefits')).toBeHidden();
  });

  test('пустая форма показывает ошибки полей', async ({ page }) => {
    await page.goto(AUTH, { waitUntil: 'networkidle' });
    await page.getByRole('textbox', { name: 'Email' }).blur();
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.locator('.ds-field__error')).toContainText(['Укажите email', 'Пароль слабоват']);
  });

  test('неверный пароль — понятная ошибка, форма остаётся', async ({ page }) => {
    await page.goto(AUTH);
    await page.getByRole('textbox', { name: 'Email' }).fill(ALICE);
    await page.locator('.auth-form input[type=password]').fill('wrong-pass1');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.locator('.auth-card__error')).toHaveText('Неверный email или пароль');
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(ALICE);
  });

  test('во время запроса кнопка занята и показывает spinner', async ({ page }) => {
    await page.route('**/auth/v1/token*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.continue();
    });
    await page.goto(AUTH);
    await page.getByRole('textbox', { name: 'Email' }).fill(ALICE);
    await page.locator('.auth-form input[type=password]').fill(PASSWORD);
    const submit = page.getByRole('button', { name: 'Войти', exact: true });
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(submit.locator('.ds-spinner')).toBeVisible();
    await page.waitForURL(/\/preview\/aninova-3\/profile$/);
  });

  test('регистрация: письмо подтверждения, без фиктивного входа', async ({ page }) => {
    const email = `new-${Date.now()}@example.com`;
    await page.goto(`${AUTH}?next=${encodeURIComponent(PROFILE)}`);
    await page.getByRole('tab', { name: 'Регистрация' }).click();
    await page.getByRole('textbox', { name: 'Ник' }).fill(`newuser${Date.now() % 10000}`);
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.locator('.auth-form input[type=password]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Проверьте почту' })).toBeVisible();
    await expect(page.locator('.auth-card')).toContainText(email);
    await expect(page).not.toHaveURL(new RegExp(`/profile$`));
  });

  test('повторный email: честная подсказка вместо второго аккаунта', async ({ page }) => {
    await page.goto(AUTH);
    await page.getByRole('tab', { name: 'Регистрация' }).click();
    await page.getByRole('textbox', { name: 'Ник' }).fill('alice2');
    await page.getByRole('textbox', { name: 'Email' }).fill(ALICE);
    await page.locator('.auth-form input[type=password]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(page.locator('.auth-card__error')).toContainText('уже зарегистрирован');
    await expect(page.getByRole('heading', { level: 2, name: 'С возвращением' })).toBeVisible();
  });

  test('Google OAuth: успешный возврат в preview-профиль', async ({ page }) => {
    await page.goto(`${AUTH}?next=${encodeURIComponent(PROFILE)}`);
    await page.getByRole('button', { name: 'Продолжить с Google' }).click();
    await page.waitForURL(/\/preview\/aninova-3\/profile$/, { timeout: 20_000 });
    await expect(page.locator('.dash__name')).toHaveText('alice');
  });

  test('Google OAuth: отказ провайдера остаётся в preview и предлагает повтор', async ({ page }) => {
    await page.route('**/auth/v1/authorize*', async (route) => {
      const url = new URL(route.request().url());
      const redirectTo = url.searchParams.get('redirect_to') ?? `${ROOT}/auth`;
      const back = new URL(redirectTo);
      back.searchParams.set('error', 'access_denied');
      back.searchParams.set('error_description', 'User denied access');
      await route.fulfill({ status: 302, headers: { location: back.toString() } });
    });
    await page.goto(`${AUTH}?next=${encodeURIComponent(PROFILE)}`);
    await page.getByRole('button', { name: 'Продолжить с Google' }).click();
    await expect(page.locator('.a3-auth-callback')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Не удалось завершить вход');
    await expect(page.locator('.a3-auth-callback')).toContainText('User denied access');
    const retry = page.getByRole('link', { name: 'Попробовать снова' });
    await expect(retry).toHaveAttribute('href', `${AUTH}?next=${encodeURIComponent(PROFILE)}`);
  });

  test('уже вошедшего пользователя auth возвращает в кабинет', async ({ page }) => {
    await login(page);
    await page.goto(`${AUTH}?next=${encodeURIComponent(PROFILE)}`);
    await page.waitForURL(/\/preview\/aninova-3\/profile$/);
    await expect(page.locator('.dash__name')).toHaveText('alice');
  });

  test('safe next: внутренний preview-каталог сохраняется', async ({ page }) => {
    await login(page, ALICE, `${ROOT}/catalog`);
    await expect(page).toHaveURL(new RegExp(`${ROOT}/catalog$`));
  });

  test('open redirect: внешний next заменяется на preview-профиль', async ({ page }) => {
    await login(page, ALICE, '//evil.example/profile', PROFILE);
    await expect(page).toHaveURL(new RegExp(`${ROOT}/profile$`));
    expect(new URL(page.url()).origin).toBe('http://127.0.0.1:3202');
    expect(page.url()).not.toContain('evil.example');
    await expect(page.locator('.dash__name')).toHaveText('alice');
  });
});

test.describe('B2-C: кабинет', () => {
  test('реальная сессия: имя, email, дата, статистика и табы', async ({ page }) => {
    await login(page);
    await expect(page.locator('.dash__name')).toHaveText('alice');
    await expect(page.locator('.a3-account')).toContainText(ALICE);
    await expect(page.locator('.dash__stats')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Обзор/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /Мои списки/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /История/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Настройки/ })).toBeVisible();
    await expect(page.locator('.a3-header__login')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('списки и история — реальные строки и preview-ссылки', async ({ page }) => {
    await login(page);
    await page.getByRole('tab', { name: /Мои списки/ }).click();
    const lists = page.locator('.dash__panel');
    await expect(lists).toContainText('Ван-Пис');
    await expect(lists).toContainText('Тетрадь смерти');
    const firstLink = lists.locator('a[href*="/anime/"]').first();
    await expect(firstLink).toHaveAttribute('href', new RegExp(`^${ROOT}/anime/`));
    await page.getByRole('tab', { name: /История/ }).click();
    await expect(lists).toContainText('серия 3');
    await expect(lists).toContainText('серия 1');
  });

  test('настройки: ник, био, только тёмная тема, выход', async ({ page }) => {
    await login(page);
    await page.getByRole('tab', { name: /Настройки/ }).click();
    const panel = page.locator('.dash__panel');
    await expect(panel.getByRole('textbox', { name: 'Ник' })).toHaveValue('alice');
    await expect(panel.getByRole('textbox', { name: 'Био' })).toHaveValue(/сёнены/);
    await expect(panel.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByRole('button', { name: 'Светлая' })).toHaveCount(0);
    await expect(panel).toContainText('В preview зафиксирована тёмная тема');
  });

  test('выход возвращает на preview-главную и закрывает кабинет', async ({ page }) => {
    await login(page);
    await page.getByRole('tab', { name: /Настройки/ }).click();
    await page.getByRole('button', { name: 'Выйти' }).click();
    await page.waitForURL(new RegExp(`${ROOT}/?$`));
    await page.goto(PROFILE);
    await page.waitForURL(/\/preview\/aninova-3\/auth\?/);
    await expect(page).toHaveURL(new RegExp(`reason=protected`));
  });

  test('гость на /preview/profile уходит на preview-auth с возвратом', async ({ page }) => {
    await page.goto(PROFILE);
    await page.waitForURL(/\/preview\/aninova-3\/auth\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('reason')).toBe('protected');
    expect(url.searchParams.get('next')).toBe(PROFILE);
    await expect(page.getByRole('heading', { level: 2, name: 'С возвращением' })).toBeVisible();
  });
});

test.describe('B2-C: публичный профиль', () => {
  test('публичные поля и приватность: нет списков и истории', async ({ page }) => {
    await page.goto(`${ROOT}/profile/bob`);
    await expect(page.locator('.pheader__name')).toContainText('bob');
    await expect(page.locator('.pheader__bio')).toContainText('законченные');
    await expect(page.locator('.pheader__counts')).toContainText('Подписчики: 1');
    await expect(page.locator('.a3-public-profile__privacy')).toContainText('Списки и история остаются личными');
    await expect(page.locator('.dash__tabs')).toHaveCount(0);
    await expect(page.getByText('Мои списки')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('shingeki-no-kyojin');
  });

  test('свой публичный профиль не предлагает подписаться на себя', async ({ page }) => {
    await login(page);
    await page.goto(`${ROOT}/profile/alice`);
    await expect(page.locator('.pheader__name')).toContainText('alice');
    await expect(page.getByRole('button', { name: 'Подписаться' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Написать сообщение/ })).toHaveCount(0);
  });

  test('гостю и участнику не уводит в production-сообщения', async ({ page }) => {
    await login(page);
    await page.goto(`${ROOT}/profile/bob`);
    await page.getByRole('button', { name: /Написать сообщение/ }).click();
    await expect(page).toHaveURL(`${ROOT}/profile/bob`);
    await expect(page.getByText('Сообщения появятся в одном из следующих этапов')).toBeVisible();
  });

  test('несуществующий пользователь — честный 404 preview', async ({ page }) => {
    const res = await page.goto(`${ROOT}/profile/no-such-user-xyz`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Такой страницы нет');
  });
});
