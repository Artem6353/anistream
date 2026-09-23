import { expect, test } from '@playwright/test';

/** E2E-сценарии (C5, 5 штук). Проверяют пользовательские пути на прод-сборке.
 *  goto — с waitUntil:'domcontentloaded': сторонние ресурсы (YouTube-трейлеры, CDN-постеры)
 *  не должны блокировать сценарии в CI/песочнице; готовность проверяем ассертами по элементам.
 *  Социалка — в локальном режиме (без Supabase): отзывы/списки живут в localStorage,
 *  капча не требуется (она включается только в supabase-режиме). */

test('1 · главная: герой и рельсы', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero__title').first()).toBeVisible();
  await expect(page.locator('.rail-section').first()).toBeVisible();
});

test('2 · каталог: фильтр жанром сужает выдачу', async ({ page }) => {
  await page.goto('/catalog', { waitUntil: 'domcontentloaded' });
  const before = await page.locator('.card').count();
  expect(before).toBeGreaterThan(0);
  await page.goto('/catalog?genre=action', { waitUntil: 'domcontentloaded' });
  const after = await page.locator('.card').count();
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThanOrEqual(before);
});

test('3 · плеер: бар серий и панель озвучек', async ({ page }) => {
  await page.goto('/anime/sousou-no-frieren/1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.epbar')).toBeVisible();
  await expect(page.locator('.player-side')).toBeVisible();
});

test('4 · каталог → тайтл → отзыв (локальный режим)', async ({ page }) => {
  await page.goto('/catalog', { waitUntil: 'domcontentloaded' });
  const firstCard = page.locator('.card .card__title a').first();
  const href = await firstCard.getAttribute('href');
  expect(href).toMatch(/^\/anime\/[^/]+$/);
  await firstCard.click();
  await page.waitForURL((u) => u.pathname === href);

  // страница тайтла: заголовок и секция отзывов
  await expect(page.locator('section.reviews')).toBeVisible();
  const marker = `e2e-отзыв-${Date.now()}`;
  await page.locator('.reviews__form input[placeholder="Ваше имя"]').fill('E2E-бот');
  await page.locator('textarea.reviews__text').fill(marker);
  await page.locator('.reviews__form button', { hasText: 'Отправить' }).click();

  // отзыв появился в списке (localStorage-режим: без капчи и перезагрузки)
  const item = page.locator('.review', { hasText: marker }).first();
  await expect(item).toBeVisible();
  await expect(item.locator('.review__head strong')).toHaveText('E2E-бот');

  // переживает перезагрузку страницы
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.review', { hasText: marker }).first()).toBeVisible();
});

test('5 · профиль → список → сохранение', async ({ page }) => {
  const slug = 'sousou-no-frieren';
  await page.goto(`/anime/${slug}`, { waitUntil: 'domcontentloaded' });

  // пустой список в профиле
  await page.goto('/profile/list', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.empty-state', { hasText: 'Списки пусты' })).toBeVisible();

  // добавляем тайтл в список «Смотрю» со страницы тайтла
  await page.goto(`/anime/${slug}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.listbtn > button').click();
  await page.locator('.listbtn__menu [role="menuitem"]', { hasText: 'Смотрю' }).click();
  await expect(page.locator('.listbtn > button')).toContainText('Смотрю');

  // сохранение: список в профиле переживает навигацию (localStorage)
  await page.goto('/profile/list', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.mylist section', { hasText: 'Смотрю' }).first()).toBeVisible();
  await expect(page.locator(`.mylist a[href="/anime/${slug}"]`).first()).toBeVisible();

  // удаление из списка возвращает пустое состояние
  await page.goto(`/anime/${slug}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.listbtn > button').click();
  await page.locator('.listbtn__menu [role="menuitem"]', { hasText: 'Убрать из списков' }).click();
  await page.goto('/profile/list', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.empty-state', { hasText: 'Списки пусты' })).toBeVisible();
});
