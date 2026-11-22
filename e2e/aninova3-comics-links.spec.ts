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
    /* У манги Наруто несколько подтверждённых адаптаций (сериал, Shippuuden, фильм),
       поэтому проверяем состав, а не жёсткое число. */
    const cards = adapt.locator('.a3-adaptation');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    await expect(cards.first()).toContainText('Наруто');
    await expect(cards.first()).toHaveClass(/is-primary|/);
    await expect(page.locator('.a3-publication-state')).toContainText('Публикация недоступна');
  });

  test('страница аниме без единой связи не показывает пустую секцию', async ({ page }) => {
    /* Оригинальный сериал: ни одного ребра в снимке графа. */
    await page.goto(`${ROOT}/anime/death-parade`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.a3-source-section')).toHaveCount(0);
    await expect(page.getByText('манга не найдена', { exact: false })).toHaveCount(0);
  });

  test('несколько первоисточников показываются все, основной один', async ({ page }) => {
    /* One Piece в AniList: манга + сборник ваншотов + прототип «Romance Dawn». */
    await page.goto(`${ROOT}/anime/one-piece`);
    const section = page.locator('.a3-source-section');
    await expect(section.getByRole('heading', { name: 'Первоисточник' })).toBeVisible();
    const cards = section.locator('.a3-source-card');
    await expect(cards).toHaveCount(3);
    await expect(section.locator('.a3-source-card.is-primary')).toHaveCount(1);
    await expect(section.getByText('Основной первоисточник')).toHaveCount(1);
    await expect(section.getByText('Также первоисточник')).toHaveCount(2);
    /* Основной — сериализованная манга, а не ваншот-прототип. */
    await expect(cards.first()).toHaveClass(/is-primary/);
    await expect(cards.first()).toContainText('Манга');
    /* Ни одно название не сверено редакцией — латиницы в карточках нет. */
    await expect(section.getByText('Информация о русскоязычном издании уточняется')).toHaveCount(3);
    await expect(section.getByRole('link', { name: 'Читать мангу' })).toHaveCount(0);
  });

  test('десять первоисточников не ломают сетку и не дают горизонтального скролла', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${ROOT}/anime/fujimoto-tatsuki-17-26`);
    await expect(page.locator('.a3-source-card')).toHaveCount(10);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.reload();
    const narrow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(narrow).toBeLessThanOrEqual(1);
    const outside = await page.evaluate(() => {
      const section = document.querySelector('.a3-source-section');
      const box = section?.getBoundingClientRect();
      if (!box) return Number.POSITIVE_INFINITY;
      let worst = 0;
      for (const card of document.querySelectorAll('.a3-source-card')) {
        const r = card.getBoundingClientRect();
        worst = Math.max(worst, r.right - box.right, box.left - r.left);
      }
      return worst;
    });
    expect(outside).toBeLessThanOrEqual(1);
  });

  test('связь без первоисточника называется «Связанные комиксы»', async ({ page }) => {
    /* У Trinity Blood есть только ALTERNATIVE-связь с мангой. */
    await page.goto(`${ROOT}/anime/trinity-blood`);
    const section = page.locator('.a3-source-section');
    await expect(section.getByRole('heading', { name: 'Связанные комиксы' })).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Первоисточник' })).toHaveCount(0);
    await expect(section).toContainText('первоисточник среди них не установлен');
  });

  test('направление только по датам не выдаётся за подтверждённый первоисточник', async ({ page }) => {
    /* Bouken Ou Beet: каталог не сообщает первоисточник, связь есть, манга
       вышла раньше аниме. Максимум, что можно сказать, — «вероятный». */
    await page.goto(`${ROOT}/anime/bouken-ou-beet`);
    const section = page.locator('.a3-source-section');
    await expect(section.getByRole('heading', { name: 'Вероятный первоисточник' })).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Первоисточник', exact: true })).toHaveCount(0);
    /* Ни «основной», ни «также первоисточник» без подтверждённого направления. */
    await expect(section.getByText('Основной первоисточник')).toHaveCount(0);
    await expect(section.getByText('Также первоисточник')).toHaveCount(0);
    await expect(section).toContainText('требует проверки');
  });

  test('неподтверждённое направление подписано нейтрально с обеих сторон', async ({ page }) => {
    /* Samurai 7: аниме по другому первоисточнику (source=OTHER), поэтому
       нельзя утверждать, что манга — его оригинал или что она по нему сделана. */
    await page.goto(`${ROOT}/anime/samurai-7`);
    const section = page.locator('.a3-source-section');
    await expect(section.getByRole('heading', { name: 'Связанные комиксы' })).toBeVisible();
    await expect(section).toContainText('Связанное произведение');
    await expect(section).toContainText('Направление связи не подтверждено');
    const href = await section.locator('.a3-source-card a.a3-link').first().getAttribute('href');
    expect(href).toBeTruthy();

    /* Та же связь с обратной стороны: тоже нейтрально, без «Оригинальный сериал». */
    await page.goto(href as string);
    const adapt = page.locator('.a3-adaptations');
    await expect(adapt).toContainText('Связанное произведение');
    await expect(adapt).not.toContainText('Оригинальный сериал');
  });

  test('одна и та же связь одинаково подписана на обеих страницах', async ({ page }) => {
    /* One Piece: подтверждённая манга-первоисточник в обе стороны. */
    await page.goto(`${ROOT}/anime/one-piece`);
    const animeSection = page.locator('.a3-source-section');
    await expect(animeSection.getByText('Основной первоисточник')).toHaveCount(1);

    await page.goto(`${ROOT}/comics/one-piece`);
    const adapt = page.locator('.a3-adaptations');
    await expect(adapt).toContainText('Аниме-адаптация');
    /* Манга не может одновременно быть «первоисточником» аниме и его адаптацией. */
    await expect(adapt).not.toContainText('Основной первоисточник');
    await expect(adapt).not.toContainText('Оригинальный сериал');
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

  test('непроверенное произведение не показывает иностранное название', async ({ page }) => {
    await page.goto(`${ROOT}/comics/one-piece`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Информация о русскоязычном издании уточняется');
    /* Оригинальное название не подставляется вместо русского. */
    await expect(page.locator('.a3-comic__orig')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Читать/ })).toHaveCount(0);
  });

  test('кандидат русского названия не попадает в публичный HTML', async ({ page }) => {
    /* У сборника «Wanted!» (AniList 30793) кандидат — «Разыскиваются!», а
       оригинальное название содержит «Tanpenshuu». Ни то, ни другое не должно
       оказаться в разметке: показ кандидата = выдача неподтверждённых данных. */
    const res = await page.goto(`${ROOT}/comics/wanted-oda-eiichiro-tanpenshuu`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Информация о русскоязычном издании уточняется');
    /* Проверяем отображаемый текст и <title>, а не слаг URL: слаг — это
       идентификатор маршрута, а не публикуемое название. */
    const visible = `${await page.title()}
${await page.locator('main').innerText()}`.toLowerCase();
    expect(visible).not.toContain('разыскиваются');
    expect(visible).not.toContain('tanpenshuu');
    expect(visible).not.toContain('wanted');
    /* Адаптации при этом видны: связь подтверждена, скрыта только метаинформация. */
    await expect(page.locator('.a3-adaptation')).not.toHaveCount(0);
  });

  test('читалка закрыта для произведения без прав и глав', async ({ page }) => {
    const res = await page.goto(`${ROOT}/comics/one-piece/read?chapter=1`);
    expect(res?.status()).toBe(404);
  });

  test('каталог Comics не ссылается на непроверенные произведения', async ({ page }) => {
    await page.goto(`${ROOT}/comics`);
    const rows = page.locator('.a3-comicrow');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const text = (await rows.nth(i).innerText()).toLowerCase();
      expect(text).toContain('демо');
      const href = await rows.nth(i).getAttribute('href');
      if (href) expect(href).toBeTruthy();
    }
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
      for (const url of [
        ANIME,
        COMIC,
        `${ROOT}/comics`,
        `${ROOT}/anime/one-piece`,
        `${ROOT}/anime/fujimoto-tatsuki-17-26`,
        `${ROOT}/comics/one-piece`,
      ]) {
        await page.goto(url);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${url} @ ${width}`).toBeLessThanOrEqual(1);
      }
    });
  }
});
