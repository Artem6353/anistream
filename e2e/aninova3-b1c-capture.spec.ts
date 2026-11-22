import { expect, test } from '@playwright/test';

/**
 * B1-C.6: съёмка экранов и локальные замеры preview.
 *
 * Обычный прогон e2e этот файл пропускает. Запуск только с B1C_CAPTURE=1:
 *   B1C_CAPTURE=1 PLAYWRIGHT_BROWSERS_PATH=.cache/pw-browsers \
 *     E2E_BASE=http://localhost:3104 npx playwright test e2e/aninova3-b1c-capture.spec.ts
 *
 * Пишет docs/design/b1c/screens/*.png и docs/design/b1c/perf.json.
 */
test.skip(!process.env.B1C_CAPTURE, 'съёмка экранов выполняется только с B1C_CAPTURE=1');

test('скриншоты и замеры preview-маршрутов B1-C', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const { captureAll } = await import('../scripts/aninova3-b1c-capture.mjs');
  const result = (await captureAll(baseURL ?? 'http://localhost:3100')) as {
    shots: number;
    perf: { routes: Record<string, { sourceCards: number; adaptationCards: number }> };
  };
  const { shots, perf } = result;

  expect(shots).toBeGreaterThan(0);
  /* Аниме с первоисточником действительно отрисовало карточку, а без — ни одной. */
  expect(perf.routes.animeWithSource.sourceCards).toBeGreaterThan(0);
  expect(perf.routes.animeWithoutSource.sourceCards).toBe(0);
  expect(perf.routes.comicWithAdaptations.adaptationCards).toBeGreaterThan(0);
});
