import { expect, test, type Page } from '@playwright/test';

/**
 * B2-A: shell, главная, каталог, страница аниме и расписание.
 *
 * Проверяется фактический пользовательский сценарий на реальных данных каталога:
 * переходы, серверная выдача, подписи и состояния. Не только HTTP 200.
 */

const ROOT = '/preview/aninova-3';

const navLinks = (page: Page) => page.locator('nav[aria-label="Основная навигация"] .a3-nav__link');
const rows = (page: Page) => page.locator('.a3-results .a3-row');
const cards = (page: Page) => page.locator('.a3-results .a3-card');

test.describe('B2-A: оболочка и главная', () => {
  test('шапка содержит пять разделов и подсвечивает текущий', async ({ page }) => {
    await page.goto(`${ROOT}/`);
    await expect(navLinks(page)).toHaveCount(5);
    await expect(navLinks(page)).toHaveText(['Главная', 'Каталог', 'Расписание', 'Comics', 'Профиль']);
    await expect(navLinks(page).filter({ hasText: 'Главная' })).toHaveAttribute('aria-current', 'page');

    await navLinks(page).filter({ hasText: 'Расписание' }).click();
    await page.waitForURL(/\/schedule$/);
    await expect(navLinks(page).filter({ hasText: 'Расписание' })).toHaveAttribute('aria-current', 'page');
    await expect(navLinks(page).filter({ hasText: 'Главная' })).not.toHaveAttribute('aria-current', 'page');
  });

  test('главная: афиша, CTA и реальная лента эфира', async ({ page }) => {
    await page.goto(`${ROOT}/`);
    const hero = page.locator('.a3-hero__title');
    await expect(hero).toBeVisible();
    const title = (await hero.innerText()).trim();
    expect(title.length).toBeGreaterThan(1);

    /* CTA ведёт в существующий сценарий просмотра, а не в заглушку. */
    const cta = page.locator('.a3-hero__actions a', { hasText: 'Смотреть' });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute('href');
    expect(href).toMatch(/\/anime\/[a-z0-9-]+(\/\d+)?$/);

    /* «Сегодня в эфире» строится из расписания, а не из демо-данных. */
    const today = page.locator('section[data-a3-group="today"]');
    await expect(today).toBeVisible();
    const todayRows = today.locator('.a3-sched__row');
    const count = await todayRows.count();
    if (count > 0) {
      const time = await todayRows.first().locator('.a3-sched__time').innerText();
      expect(time).toMatch(/^\d{2}:\d{2}$/);
      await expect(todayRows.first().locator('.a3-sched__title')).toHaveAttribute('href', /\/anime\/[a-z0-9-]+$/);
    } else {
      await expect(today).toContainText('Сегодня эфиров нет');
    }
    await expect(today.getByRole('link', { name: 'Всё расписание →' })).toHaveAttribute('href', `${ROOT}/schedule`);
  });

  test('футер повторяет разделы и не уводит на production', async ({ page }) => {
    await page.goto(`${ROOT}/catalog`);
    const footer = page.locator('.a3-footer');
    await expect(footer).toContainText('Расписание');
    await expect(footer.getByRole('link', { name: 'Все аниме' })).toHaveAttribute('href', `${ROOT}/catalog`);
    await expect(footer.getByRole('link', { name: 'Главная' })).toHaveAttribute('href', ROOT);
    const hrefs = await footer.locator('a').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(4);
    expect(hrefs.every((href) => href.startsWith(ROOT))).toBe(true);
  });
});

test.describe('B2-A: каталог', () => {
  test('поиск, фильтр, сортировка и пагинация работают сервером', async ({ page }) => {
    await page.goto(`${ROOT}/catalog`);
    const total = await rows(page).count();
    expect(total).toBeGreaterThan(10);

    /* Поиск: значение уходит в SSR, в выдаче остаётся запрос. */
    await page.fill('#a3-cat-q', 'наруто');
    await page.locator('.a3-searchbar button[type="submit"]').click();
    await page.waitForURL(/[?&]q=/);
    expect(page.url()).toContain('q=');
    await expect(rows(page).first()).toBeVisible();
    const foundTexts = await rows(page).allInnerTexts();
    expect(foundTexts.join(' ').toLowerCase()).toContain('наруто');

    /* Сортировка по алфавиту сохраняет поиск (ключ существующей логики — `az`). */
    await page.locator('.a3-sortchips a', { hasText: 'По алфавиту' }).click();
    await page.waitForURL(/sort=az/);
    expect(page.url()).toContain('q=');
    const titles = await rows(page).locator('.a3-row__title').allInnerTexts();
    const sorted = [...titles].sort((a, b) => a.localeCompare(b, 'ru'));
    expect(titles).toEqual(sorted);

    /* Фильтр по типу фильма — своя выдача. */
    await page.goto(`${ROOT}/catalog?type=movie`);
    await expect(page.locator('.a3-row__meta').first()).toContainText('Фильм');

    /* Пагинация: вторая страница отличается, возврат работает. */
    await page.goto(`${ROOT}/catalog`);
    const firstPage = await rows(page).locator('.a3-row__title').allInnerTexts();
    await page.locator('.a3-pagination a', { hasText: 'Вперёд' }).click();
    await page.waitForURL(/page=2/);
    const secondPage = await rows(page).locator('.a3-row__title').allInnerTexts();
    expect(secondPage[0]).not.toBe(firstPage[0]);
    await page.locator('.a3-pagination a', { hasText: 'Назад' }).click();
    /* «Назад» ведёт на page=1 — это тот же каталог, что и без параметра. */
    await page.waitForURL((url) => (url.searchParams.get('page') ?? '1') === '1');
    expect(await rows(page).locator('.a3-row__title').allInnerTexts()).toEqual(firstPage);
  });

  test('фильтры в адресе, сетка и пустое состояние', async ({ page }) => {
    /* Сетка сохраняется в адресе, а «Сначала новые» — это сортировка по году
       по убыванию (существующая логика sortTitles, не новая). */
    await page.goto(`${ROOT}/catalog?sort=new&view=grid`);
    await expect(cards(page).first()).toBeVisible();
    const metas = await cards(page).locator('.a3-card__meta').allInnerTexts();
    const parsed = metas.map((t) => Number.parseInt(t, 10)).filter((n) => Number.isFinite(n));
    expect(parsed.length).toBeGreaterThan(0);
    expect([...parsed].sort((a, b) => b - a)).toEqual(parsed);

    await page.goto(`${ROOT}/catalog?q=ууууууууу`);
    await expect(page.locator('.a3-empty')).toContainText('ничего нет');
    await page.locator('.a3-empty a', { hasText: 'Сбросить' }).click();
    await page.waitForURL(`${ROOT}/catalog`);
  });
});

test.describe('B2-A: страница аниме и переход к серии', () => {
  test('метаданные, серии и источники показываются из реальных данных', async ({ page }) => {
    await page.goto(`${ROOT}/catalog`);
    const firstTitle = await rows(page).locator('.a3-row__title').first().innerText();
    await rows(page).first().click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstTitle);

    /* Хлебные крошки возвращают в каталог. */
    await expect(page.locator('.a3-breadcrumbs a', { hasText: 'Каталог' })).toHaveAttribute('href', `${ROOT}/catalog`);
    /* Досье строится из каталога: тип, статус и год присутствуют. */
    const facts = page.locator('.a3-facts');
    await expect(facts).toContainText('Тип');
    await expect(facts).toContainText('Статус');
    await expect(facts).toContainText('Год');
    /* Источники не выдумываются: блок объясняет, где проверяется поток. */
    await expect(page.locator('section[aria-labelledby="a3-sources"]')).toContainText('на странице серии');
  });

  test('клик по серии открывает существующий сценарий просмотра', async ({ page }) => {
    await page.goto(`${ROOT}/anime/one-piece`);
    const episodes = page.locator('.a3-eplist .a3-ep');
    await expect(episodes.first()).toBeVisible();
    const episodeHref = await episodes.first().getAttribute('href');
    expect(episodeHref).toMatch(/\/anime\/one-piece\/\d+$/);

    await episodes.first().click();
    await page.waitForURL(/\/anime\/one-piece\/\d+$/);
    /* Это существующий плеер в кинозале, а не фиктивная заглушка. */
    await expect(page.locator('.a3-watchhead')).toBeVisible();
    await expect(page.locator('.a3-watchhead__title')).toContainText('серия');
  });

  test('анонс без вышедших серий не обещает просмотр', async ({ page }) => {
    await page.goto(`${ROOT}/catalog?status=upcoming`);
    const upcoming = rows(page).first();
    await expect(upcoming).toBeVisible();
    const title = await upcoming.locator('.a3-row__title').innerText();
    await upcoming.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    const body = page.locator('.a3-anime__body');
    if (await body.getByText('Серии ещё не вышли').count()) {
      /* Кнопка «Скоро» ведёт на ту же страницу, а не в плеер. */
      const soon = page.locator('.a3-anime__actions a', { hasText: 'Скоро' });
      await expect(soon).toHaveAttribute('href', new RegExp(`/anime/[a-z0-9-]+$`));
    } else {
      await expect(page.locator('.a3-eplist .a3-ep').first()).toBeVisible();
    }
  });
});

test.describe('B2-A: расписание', () => {
  test('дни переключаются, время в МСК, переход на аниме работает', async ({ page }) => {
    await page.goto(`${ROOT}/schedule`);
    const days = page.locator('.a3-week__day');
    await expect(days).toHaveCount(7);
    await expect(page.locator('.a3-week__day.is-on')).toHaveCount(1);
    await expect(page.locator('.a3-week__day.is-today')).toHaveCount(1);

    /* Выбираем день, в котором есть эфиры, и проверяем реальную смену списка. */
    const counts = await days.locator('.a3-week__count').allInnerTexts();
    const target = counts.findIndex((c) => Number.parseInt(c, 10) > 0);
    expect(target).toBeGreaterThanOrEqual(0);
    await days.nth(target).click();
    await page.waitForURL(target === 0 ? /\/schedule$/ : new RegExp(`day=${target}`));
    await expect(days.nth(target)).toHaveAttribute('aria-current', 'true');

    const scheduleRows = page.locator('.a3-sched__row');
    await expect(scheduleRows.first()).toBeVisible();
    const time = await scheduleRows.first().locator('.a3-sched__time').innerText();
    expect(time).toMatch(/^\d{2}:\d{2}$/);
    const dt = await scheduleRows.first().locator('.a3-sched__time').getAttribute('datetime');
    expect(dt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    /* Время именно МСК: сдвиг от UTC — три часа. */
    const mskHour = Number(time.slice(0, 2));
    const utcHour = new Date(dt as string).getUTCHours();
    expect((utcHour + 3) % 24).toBe(mskHour);

    /* Прошедшие и будущие показы различимы подписью, а не только цветом. */
    const badges = await page.locator('.a3-sched__badge').allInnerTexts();
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) expect(['вышла', 'сейчас', 'ожидается']).toContain(badge.trim());

    const titleLink = scheduleRows.first().locator('.a3-sched__title');
    const animeHref = await titleLink.getAttribute('href');
    expect(animeHref).toMatch(/\/anime\/[a-z0-9-]+$/);
    const animeName = (await titleLink.innerText()).trim();
    await titleLink.click();
    await page.waitForURL(/\/anime\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(animeName);
  });

  test('некорректный день не ломает страницу', async ({ page }) => {
    await page.goto(`${ROOT}/schedule?day=42`);
    await expect(page.locator('.a3-week__day')).toHaveCount(7);
    await expect(page.locator('.a3-week__day.is-today')).toHaveCount(1);
  });

  test('пустой день показывает нормальное пустое состояние', async ({ page }) => {
    await page.goto(`${ROOT}/schedule`);
    const counts = await page.locator('.a3-week__count').allInnerTexts();
    const empty = counts.findIndex((c) => Number.parseInt(c, 10) === 0);
    await page.goto(`${ROOT}/schedule${empty >= 0 ? `?day=${empty}` : '?day=0'}`);
    const body = page.locator('.a3-sched-day');
    if (empty >= 0) {
      await expect(body).toContainText('эфиров нет');
    } else {
      await expect(body.locator('.a3-sched__row').first()).toBeVisible();
    }
  });
});

test.describe('B2-A: состояния', () => {
  test('неизвестная страница отдаёт 404 с навигацией', async ({ page }) => {
    const res = await page.goto(`${ROOT}/anime/etogo-tajtla-net-2026`);
    expect(res?.status()).toBe(404);
    await expect(page.locator('.a3')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Такой страницы нет');
    await expect(page.locator('.a3-errorpage a', { hasText: 'В каталог' })).toHaveAttribute('href', `${ROOT}/catalog`);
  });
});
