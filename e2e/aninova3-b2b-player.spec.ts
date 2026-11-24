import { expect, test, type Page } from '@playwright/test';

/**
 * B2-B: страница серии и театр плеера в preview.
 *
 * Часть проверок идёт на реальном файловом каталоге (one-piece): маршрут,
 * заголовок, соседние серии, пустые источники, отсутствие следующей серии.
 * Сетевые состояния плеера (список озвучек, переключение, загрузка, ошибка,
 * fallback, жалоба) проверяются детерминированными ответами /api/providers,
 * /api/availability и /api/report — только в тесте, без фикстур в каталоге.
 *
 * Реальное воспроизведение HLS/MP4 и реальные потоки провайдеров здесь НЕ
 * проверяются: в этой среде у one-piece нет источников, а тестовые ответы
 * подменяют API. Это ограничение зафиксировано в отчёте B2-B.
 */

const ROOT = '/preview/aninova-3';
const WATCH = `${ROOT}/anime/one-piece/1`;

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
  {
    id: 'kodik-sub',
    label: 'Субтитры',
    providerId: 'kodik',
    providerName: 'Kodik',
    kind: 'embed' as const,
    embedUrl: 'about:blank',
    voice: 'subtitles' as const,
  },
  {
    id: 'cvh-dub',
    label: 'AniBoom',
    providerId: 'cvh',
    providerName: 'CVH',
    kind: 'embed' as const,
    embedUrl: 'about:blank',
    voice: 'voice' as const,
  },
];

const FILE_SOURCE = {
  id: 'cvh-file',
  label: 'Тестовая озвучка',
  providerId: 'cvh',
  providerName: 'CVH',
  kind: 'file' as const,
  voice: 'voice' as const,
  files: [
    { quality: '720', url: '/__slow-b2b-720.mp4', type: 'mp4' as const },
    { quality: '1080', url: '/__slow-b2b-1080.mp4', type: 'mp4' as const },
  ],
};

async function mockSources(page: Page, sources: unknown[], status = 200) {
  await page.route('**/api/providers/**', (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(status === 200 ? { sources } : { error: 'test failure' }),
    }),
  );
  await page.route('**/api/availability/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: {} }) }),
  );
}

/** Видео-запрос «висит»: контролы остаются доступными, ошибка не появляется. */
async function hangMedia(page: Page) {
  await page.route('**/__slow-b2b-*.mp4', () => new Promise(() => {}));
}

test.describe('B2-B: страница серии', () => {
  test('реальная серия: заголовок, крошки, окно серий, похожее', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    const res = await page.goto(WATCH);
    expect(res?.status()).toBe(200);

    await expect(page.locator('h1')).toContainText('Ван-Пис');
    await expect(page.locator('h1')).toContainText('серия 1');
    const crumbs = page.getByRole('navigation', { name: 'Хлебные крошки' });
    await expect(crumbs.getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'href',
      `${ROOT}/catalog`,
    );
    await expect(crumbs.getByRole('link', { name: /Ван-Пис/ })).toHaveAttribute(
      'href',
      `${ROOT}/anime/one-piece`,
    );
    await expect(page.locator('.a3-watchhead__nav').getByRole('link', { name: /Серия 2/ })).toHaveAttribute(
      'href',
      `${ROOT}/anime/one-piece/2`,
    );
    /* Серия 1 — край окна: 1…8, а не 15 (радиус 7 обрезан началом). */
    await expect(page.locator('.a3-watch-eps__item')).toHaveCount(8);
    await expect(page.locator('.a3-watch-eps__item.is-active')).toHaveText('1');
    await expect(page.getByRole('heading', { name: 'Похожее' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('.sources-skeleton')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('.a3-stage')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('404: нет тайтла, нет серии, неверный номер', async ({ page }) => {
    for (const path of [
      `${ROOT}/anime/no-such-title-b2b/1`,
      `${ROOT}/anime/one-piece/1135`,
      `${ROOT}/anime/one-piece/abc`,
      `${ROOT}/anime/one-piece/0`,
    ]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.locator('.a3-stage'), path).toHaveCount(0);
    }
  });

  test('предыдущая/следующая серия и возврат к аниме', async ({ page }) => {
    await page.goto(`${ROOT}/anime/one-piece/2`);
    const nav = page.locator('.a3-watchhead__nav');
    await expect(nav.getByRole('link', { name: /Серия 1/ })).toHaveAttribute(
      'href',
      `${ROOT}/anime/one-piece/1`,
    );
    await nav.getByRole('link', { name: /Серия 3/ }).click();
    await page.waitForURL(`${ROOT}/anime/one-piece/3`);
    await expect(page.locator('h1')).toContainText('серия 3');

    await page.locator('.a3-watchhead__nav').getByRole('link', { name: /Серия 2/ }).click();
    await page.waitForURL(`${ROOT}/anime/one-piece/2`);
    const backToAnime = page
      .locator('.a3-watchhead__nav')
      .getByRole('link', { name: 'К аниме', exact: true });
    await expect(backToAnime).toHaveAccessibleDescription('Вернуться на страницу аниме');
    await backToAnime.click();
    await page.waitForURL(`${ROOT}/anime/one-piece`);
    await expect(page.locator('h1')).toContainText('Ван-Пис');
  });

  test('последняя известная серия: нет следующей, честный «1134+»', async ({ page }) => {
    await page.goto(`${ROOT}/anime/one-piece/1134`);
    await expect(page.locator('h1')).toContainText('серия 1134');
    await expect(page.locator('.a3-watchhead__nav a[rel="next"]')).toHaveCount(0);
    await expect(page.locator('.a3-watchhead__nav').getByRole('link', { name: /Серия 1135/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Серии/ })).toContainText('1134+');
    await expect(page.locator('.a3-watch-eps__item.is-active')).toHaveText('1134');
  });

  test('уменьшенная анимация: постер и переходы отключены', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(WATCH);
    const styles = await page.evaluate(() => {
      const img = document.querySelector('.a3-stage__poster img');
      const chip = document.querySelector('.a3-watch-eps__item');
      return {
        poster: img ? getComputedStyle(img).transform : null,
        chip: chip ? getComputedStyle(chip).transitionProperty : null,
        chipDuration: chip ? getComputedStyle(chip).transitionDuration : null,
      };
    });
    expect(styles.poster === 'none' || styles.poster === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
    expect(styles.chip).toBe('none');
    expect(Number.parseFloat(styles.chipDuration ?? '1')).toBeLessThan(0.001);
  });

  test('пустые источники не превращаются в вечную загрузку', async ({ page }) => {
    await page.goto(WATCH);
    await expect(page.locator('.sources-skeleton')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole('tab', { name: /Озвучки/ })).toContainText('0');
    await expect(page.getByText('Источников пока нет')).toBeVisible();
    await expect(page.locator('.source-row')).toHaveCount(0);
    await expect(page.locator('.player__status--error')).toHaveCount(0);
  });
});

test.describe('B2-B: состояния плеера на детерминированных ответах API', () => {
  test('список озвучек, переключение и запоминание выбора', async ({ page }) => {
    await mockSources(page, EMBEDS);
    await page.goto(WATCH);

    await expect(page.getByRole('tab', { name: /Озвучки/ })).toContainText('3');
    await expect(page.locator('.sources-group__head')).toHaveText(['Kodik', 'CVH (AnimeGo)']);
    await expect(page.locator('.source-row')).toHaveCount(3);
    await expect(page.locator('.source-row.is-active')).toHaveText('Дубляж');
    await expect(page.locator('iframe.player__iframe')).toHaveAttribute(
      'title',
      /\(Дубляж\)/,
    );

    await page.locator('.source-row', { hasText: 'Субтитры' }).click();
    await expect(page.locator('.source-row.is-active')).toHaveText('Субтитры');
    await expect(page.locator('iframe.player__iframe')).toHaveAttribute('title', /\(Субтитры\)/);
    expect(await page.evaluate(() => localStorage.getItem('anistream:lastsrc:one-piece'))).toBe(
      'kodik-sub',
    );

    await page.reload();
    await expect(page.locator('.source-row.is-active')).toHaveText('Субтитры');
    await expect(page.locator('iframe.player__iframe')).toHaveAttribute('title', /\(Субтитры\)/);
  });

  test('серии в боковой панели ведут внутрь preview', async ({ page }) => {
    await mockSources(page, EMBEDS);
    await page.goto(WATCH);
    await page.getByRole('tab', { name: /Серии/ }).click();
    await expect(page.locator('.episodes-panel .episode-row')).toHaveCount(60);
    await page.locator('.episodes-panel .episode-row').nth(2).click();
    await page.waitForURL(`${ROOT}/anime/one-piece/3`);
    await expect(page.locator('h1')).toContainText('серия 3');
  });

  test('загрузка источников: скелетон, затем список', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/providers/**', async (route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sources: EMBEDS }),
      });
    });
    await page.route('**/api/availability/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: {} }) }),
    );

    await page.goto(WATCH);
    const skeleton = page.locator('.sources-skeleton');
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveAttribute('aria-busy', 'true');
    release();
    await expect(page.locator('.source-row')).toHaveCount(3);
    await expect(skeleton).toHaveCount(0);
  });

  test('ошибка API источников видна и не висит скелетоном', async ({ page }) => {
    await mockSources(page, [], 500);
    await page.goto(WATCH);
    await expect(page.locator('.player__status--error').first()).toContainText(
      'Источники недоступны: API источников вернул HTTP 500',
    );
    await expect(page.locator('.sources-skeleton')).toHaveCount(0);
    await expect(page.locator('.source-row')).toHaveCount(0);
  });

  test('неудачный файл: ошибка и переход на следующий источник', async ({ page }) => {
    const broken = [
      { ...FILE_SOURCE, id: 'broken-1', label: 'Битый 1', files: [{ quality: '720', url: 'data:video/mp4;base64,AAAA', type: 'mp4' }] },
      { ...FILE_SOURCE, id: 'broken-2', label: 'Битый 2', files: [{ quality: '720', url: 'data:video/mp4;base64,BBBB', type: 'mp4' }] },
    ];
    await mockSources(page, broken);
    await page.goto(WATCH);
    await expect(page.locator('.player__status--error').first()).toContainText(
      'Браузер не смог воспроизвести этот файл',
      { timeout: 20_000 },
    );
    await expect(page.locator('.source-row.is-active')).toHaveText('Битый 2', { timeout: 20_000 });
    await expect(page).toHaveURL(WATCH);
  });

  test('продолжение с сохранённой позиции: баннер и кнопка', async ({ page }) => {
    await hangMedia(page);
    await mockSources(page, [FILE_SOURCE]);
    await page.addInitScript(() => {
      localStorage.setItem(
        'anistream:history',
        JSON.stringify([
          { slug: 'one-piece', episode: 1, position: 120, duration: 1440, updatedAt: Date.now() },
        ]),
      );
    });
    await page.goto(WATCH);
    const video = page.locator('.player__video');
    await expect(video).toBeVisible();
    /* metadata у «зависшего» файла не придёт: подставляем длительность и
       событие, чтобы проверить именно UI-путь resume в PlayerShell. */
    await video.evaluate((el) => {
      const v = el as HTMLVideoElement;
      Object.defineProperty(v, 'duration', { configurable: true, get: () => 1440 });
      v.dispatchEvent(new Event('loadedmetadata'));
    });
    await expect(page.locator('.player__resume')).toBeVisible();
    await expect(page.locator('.player__resume-text')).toContainText('Продолжить с 2:00');
    await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeVisible();
  });

  test('окончание серии уводит на следующую серию внутри preview', async ({ page }) => {
    await hangMedia(page);
    await mockSources(page, [FILE_SOURCE]);
    await page.goto(WATCH);
    const video = page.locator('.player__video');
    await expect(video).toBeVisible();
    await video.evaluate((el) => el.dispatchEvent(new Event('ended')));
    await page.waitForURL(`${ROOT}/anime/one-piece/2`);
    await expect(page.locator('h1')).toContainText('серия 2');
  });

  test('контролы: имена, размеры, полоса перемотки и качество', async ({ page }) => {
    await hangMedia(page);
    await mockSources(page, [FILE_SOURCE]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(WATCH);
    await expect(page.locator('.player .icon-btn').first()).toBeVisible();

    const names = await page.locator('.player .icon-btn').evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label')),
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'Смотреть',
        'Назад на 10 секунд',
        'Вперёд на 10 секунд',
        'Выключить звук',
        'Настройки плеера',
        'Картинка в картинке',
        'Полный экран',
      ]),
    );
    const boxes = await page.locator('.player .icon-btn').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }),
    );
    for (const box of boxes) {
      expect(box.w).toBeGreaterThanOrEqual(44);
      expect(box.h).toBeGreaterThanOrEqual(44);
    }

    const seek = page.getByRole('slider', { name: 'Позиция воспроизведения' });
    await expect(seek).toHaveAttribute('aria-valuemin', '0');
    expect(await seek.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.player .icon-btn[aria-label="Настройки плеера"]').evaluate((el) =>
      (el as HTMLElement).click(),
    );
    await expect(page.getByRole('menu', { name: 'Настройки плеера' })).toBeVisible();
    await expect(page.getByRole('menu', { name: 'Настройки плеера' }).getByRole('button', { name: '720p' })).toHaveClass(/is-active/);
    await page.getByRole('menu', { name: 'Настройки плеера' }).getByRole('button', { name: '1080p' }).click();
    await expect(page.getByRole('menu', { name: 'Настройки плеера' }).getByRole('button', { name: '1080p' })).toHaveClass(/is-active/);
  });

  test('жалоба на источник: ошибка, успех и закрытие по Escape', async ({ page }) => {
    await mockSources(page, EMBEDS);
    let mode: 'fail' | 'ok' = 'fail';
    let reportBody: Record<string, unknown> | null = null;
    await page.route('**/api/report', async (route) => {
      reportBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: mode === 'fail' ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(mode === 'fail' ? { error: 'Сервис недоступен' } : { ok: true }),
      });
    });

    await page.goto(WATCH);
    await page.getByRole('button', { name: 'Пожаловаться', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Жалоба на источник' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.player__report textarea')).toBeFocused();
    await dialog.getByRole('button', { name: 'Не воспроизводится' }).click();
    await dialog.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect(dialog.getByText('Ошибка: Сервис недоступен')).toBeVisible();

    mode = 'ok';
    await dialog.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Отправлено ✓');
    expect(reportBody).toMatchObject({
      slug: 'one-piece',
      episode: 1,
      source: 'Дубляж',
      problem: 'Не воспроизводится',
    });
    await expect(dialog).toHaveCount(0, { timeout: 5000 });

    await page.getByRole('button', { name: 'Пожаловаться', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Жалоба на источник' })).toBeVisible();
    const reportUrl = page.url();
    await page.keyboard.press('n');
    await expect(page.getByRole('dialog', { name: 'Жалоба на источник' })).toBeVisible();
    expect(page.url()).toBe(reportUrl);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Жалоба на источник' })).toHaveCount(0);
  });

  test('TV: цели 52 px, фокус с пульта, стрелки сцены и N', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('a3:tv', '1');
      sessionStorage.setItem('a3:hint-seen', '1');
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${WATCH}?tv=1`);
    await expect(page.locator('.a3')).toHaveAttribute('data-tv', 'true');

    const sizes = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      };
      return {
        player: box('.player .icon-btn'),
        epbar: box('.epbar__item'),
        episodes: box('.a3-watch-eps__item'),
      };
    });
    expect(sizes.player).toEqual({ w: 52, h: 52 });
    expect(sizes.epbar?.h).toBe(52);
    expect(sizes.episodes?.h).toBe(52);

    await page.keyboard.press('ArrowDown');
    for (let i = 0; i < 6; i++) {
      const inside = await page.evaluate(() => !!document.activeElement?.closest('.a3-stage'));
      if (inside) break;
      await page.keyboard.press('ArrowDown');
    }
    expect(await page.evaluate(() => !!document.activeElement?.closest('.a3-stage'))).toBe(true);
    const before = page.url();
    /* Enter на кнопке плеера не должен уводить со страницы. */
    await page.locator('.player .icon-btn').first().focus();
    await page.keyboard.press('Enter');
    expect(page.url()).toBe(before);

    await page.locator('.a3-stage').focus();
    await expect(page.locator('.a3-stage')).toBeFocused();
    expect(await page.locator('.a3-stage').evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('4px');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    expect(page.url()).toBe(before);

    /* Вниз со сцены уводит фокус на контрол, а не запирает его. */
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.player .icon-btn').first()).toBeFocused();

    await page.keyboard.press('n');
    await page.waitForURL(`${ROOT}/anime/one-piece/2`);
    await page.keyboard.press('Escape');
    await page.waitForURL(new RegExp(`${ROOT}/anime/one-piece/1(\\?|$)`));
  });
});

test.describe('B2-B: адаптивность и сенсорные цели', () => {
  test('нет горизонтальной прокрутки на 360…3840', async ({ page }) => {
    test.setTimeout(120_000);
    for (const width of [360, 390, 430, 768, 1024, 1280, 1440, 1920, 3840]) {
      await page.setViewportSize({ width, height: width >= 1024 ? 1080 : 844 });
      await page.goto(WATCH);
      await expect(page.locator('.a3-stage')).toBeVisible();
      await page.waitForTimeout(500);
      const metrics = await page.evaluate(() => {
        window.scrollTo(0, 0);
        const doc = document.documentElement;
        const stage = document.querySelector('.a3-stage')!.getBoundingClientRect();
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          stageLeft: stage.left,
          stageRight: stage.right,
        };
      });
      expect(metrics.scrollWidth, `width ${width}`).toBeLessThanOrEqual(metrics.clientWidth + 1);
      expect(metrics.stageLeft, `width ${width}`).toBeGreaterThanOrEqual(-1);
      expect(metrics.stageRight, `width ${width}`).toBeLessThanOrEqual(width + 1);
    }
  });

  test('390 px: основные сенсорные цели не меньше 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(WATCH);
    await expect(page.locator('.sources-skeleton')).toHaveCount(0, { timeout: 20_000 });
    const small = await page.evaluate(() => {
      const selectors = [
        '.a3-breadcrumbs a',
        '.a3-watchhead__nav .a3-btn',
        '.a3-watch-eps__item',
        '.a3-watchcard__link',
        '.a3-watchbody .a3-link',
        '.player-side .profile-tabs button',
        '.player .icon-btn',
        '.player__seek',
      ];
      const bad: { sel: string; h: number; w: number }[] = [];
      for (const sel of selectors) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          const r = el.getBoundingClientRect();
          if (r.width > 2 && r.height > 2 && (r.height < 44 || r.width < 44)) {
            bad.push({ sel, h: Math.round(r.height), w: Math.round(r.width) });
          }
        }
      }
      return bad;
    });
    expect(small).toEqual([]);
  });
});
