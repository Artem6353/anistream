import { expect, test, type Page } from '@playwright/test';

/**
 * B1-C: связи «аниме ↔ первоисточник» на preview-маршрутах.
 *
 * Проверяются оба направления, честные состояния публикации, TV-навигация по
 * новым карточкам и отсутствие горизонтального переполнения на 360–3840.
 * Реальные данные: Naruto связан relation-ребром, но права/русские главы не
 * подтверждены — кнопки чтения быть НЕ должно.
 */

const ROOT = '/preview/aninova-3';
const ANIME = `${ROOT}/anime/naruto`;
const COMIC = `${ROOT}/comics/naruto`;

const active = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el
      ? { tag: el.tagName, key: el.getAttribute('data-a3-key'), label: (el.textContent ?? '').trim().slice(0, 60) }
      : null;
  });

test.describe('B1-C: страница аниме → первоисточник', () => {
  test('блок первоисточника показывает подтверждённую мангу', async ({ page }) => {
    await page.goto(ANIME);

    const section = page.locator('.a3-source-section');
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Первоисточник' })).toBeVisible();

    const card = section.locator('.a3-source-card').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/is-primary/);
    await expect(card).toContainText('Основной первоисточник');
    await expect(card).toContainText('Наруто');
    await expect(card).toContainText('Манга');
    await expect(card).toContainText('Завершён');
    /* 700 глав известно, но русских глав нет — цифра не выдаётся за доступное. */
    await expect(card).toContainText('Русских глав нет');
  });

  test('без подтверждённых прав нет активной кнопки чтения и фиктивных глав', async ({ page }) => {
    await page.goto(ANIME);
    const section = page.locator('.a3-source-section');
    await expect(section.getByRole('link', { name: 'Читать мангу' })).toHaveCount(0);
    await expect(section.getByRole('link', { name: /читать/i })).toHaveCount(0);
    /* Читалка напрямую тоже не открывается. */
    const res = await page.goto(`${ROOT}/comics/naruto/read?chapter=1`);
    expect(res?.status()).toBe(404);
  });

  test('переход «О первоисточнике» ведёт на страницу Comics с обратной связью', async ({ page }) => {
    await page.goto(ANIME);
    await page.locator('.a3-source-card').first().getByRole('link', { name: /О первоисточнике/ }).click();
    await page.waitForURL(/\/preview\/aninova-3\/comics\/naruto$/);

    await expect(page.getByRole('heading', { level: 1, name: 'Наруто' })).toBeVisible();
    const adapt = page.locator('.a3-adaptations');
    await expect(adapt).toBeVisible();
    await expect(adapt).toContainText('Аниме-адаптации');
    await expect(adapt.locator('.a3-adaptation')).toHaveCount(1);
    await expect(adapt.locator('.a3-adaptation')).toContainText('Наруто');
    await expect(page.locator('.a3-publication-state')).toContainText('Публикация недоступна');
  });

  test('страница аниме без первоисточника не показывает пустую секцию', async ({ page }) => {
    await page.goto(`${ROOT}/anime/one-piece`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.a3-source-section')).toHaveCount(0);
    await expect(page.getByText('манга не найдена', { exact: false })).toHaveCount(0);
  });
});

test.describe('B1-C: страница Comics → аниме-адаптации', () => {
  test('карточка адаптации ведёт на страницу аниме', async ({ page }) => {
    await page.goto(COMIC);
    const adapt = page.locator('.a3-adaptation').first();
    await expect(adapt).toBeVisible();
    await expect(adapt).toContainText('Аниме-адаптация');
    await adapt.click();
    await page.waitForURL(/\/preview\/aninova-3\/anime\/naruto$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Наруто' })).toBeVisible();
  });

  test('демо-каталог остаётся отдельным и помеченным', async ({ page }) => {
    await page.goto(`${ROOT}/comics`);
    await expect(page.locator('.a3-demo-note')).toContainText('Демонстрационный каталог');
    await expect(page.locator('.a3-comicrow')).toHaveCount(8);
    await expect(page.locator('.a3-comicrow').first()).toContainText('RU');
  });
});

test.describe('B1-C: TV-навигация по новым блокам', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('a3:tv', '1');
      sessionStorage.setItem('a3:hint-seen', '1');
    });
  });

  test('пульт доходит до карточки первоисточника и открывает её', async ({ page }) => {
    await page.goto(ANIME);
    await expect(page.locator('.a3')).toHaveAttribute('data-tv', 'true');

    /* Встаём на видимую серию и идём вниз: секция первоисточника — следующий
       логичный блок после серий/досье и до «Похожего». Скрытые серии из
       закрытого <details> не должны перехватывать фокус (регрессия B1-C). */
    await page.locator('.a3-ep:visible').last().focus();
    let inSource = false;
    for (let i = 0; i < 6 && !inSource; i++) {
      await page.keyboard.press('ArrowDown');
      inSource = await page.evaluate(() => !!document.activeElement?.closest('.a3-source-section'));
    }
    expect(inSource).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/preview\/aninova-3\/comics\/naruto$/);
  });

  test('скрытые серии не перехватывают фокус пульта', async ({ page }) => {
    await page.goto(ANIME);
    const hiddenEps = page.locator('.a3-more .a3-ep');
    expect(await hiddenEps.count()).toBeGreaterThan(0);
    await page.locator('.a3-ep:visible').last().focus();
    await page.keyboard.press('ArrowDown');
    const landedInClosedDetails = await page.evaluate(() => !!document.activeElement?.closest('details:not([open])'));
    expect(landedInClosedDetails).toBe(false);
    const landedTooFar = await page.evaluate(
      () => !document.activeElement?.closest('.a3-source-section') && !document.activeElement?.closest('.a3-more'),
    );
    expect(landedTooFar).toBe(false);
  });

  test('Escape возвращает на аниме и восстанавливает фокус на адаптации', async ({ page }) => {
    await page.goto(COMIC);
    const card = page.locator('.a3-adaptation').first();
    await card.focus();
    await expect(card).toBeFocused();
    const key = await card.getAttribute('data-a3-key');
    expect(key).toBe('anime:20');

    await page.keyboard.press('Enter');
    await page.waitForURL(/\/preview\/aninova-3\/anime\/naruto$/);

    await page.keyboard.press('Escape');
    await page.waitForURL(/\/preview\/aninova-3\/comics\/naruto$/);
    await page.waitForTimeout(250);
    const restored = await active(page);
    expect(restored?.key).toBe('anime:20');
  });
});

test.describe('B1-C: адаптивность новых блоков', () => {
  for (const width of [360, 390, 430, 768, 1024, 1280, 1440, 1920, 3840]) {
    test(`нет горизонтального переполнения на ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const url of [ANIME, COMIC, `${ROOT}/comics`]) {
        await page.goto(url);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${url} @ ${width}`).toBeLessThanOrEqual(1);
      }
    });
  }
});
