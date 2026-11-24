import { defineConfig } from '@playwright/test';

/** E2E-конфиг (C5). Локально: E2E_BASE=http://localhost:3100 npx playwright test
 *  (порт webServer выводится из E2E_BASE; уже поднятый сервер переиспользуется).
 *  В CI (.github/workflows/e2e.yml): сборка + `npx playwright test` на :3000. */
const base = process.env.E2E_BASE ?? 'http://localhost:3000';
const port = Number(new URL(base).port || 3000);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // один прод-сервер на 1 ГБ RAM — последовательно
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: base,
    trace: 'retain-on-failure',
    /* Ограниченные песочницы (gVisor/containers без user-ns): chromium может
       требовать доп. флаги — задаются env PW_LAUNCH_ARGS="--no-sandbox --single-process".
       В обычном CI (ubuntu-latest, --with-deps) переменная не задаётся. */
    launchOptions: { args: (process.env.PW_LAUNCH_ARGS ?? '').split(/\s+/).filter(Boolean) },
  },
  /* B2-A: два сервера одной сборки — с флагом preview и без него. Второй нужен,
     чтобы регрессия «без флага раздел закрыт» проверялась тем же прогоном, а не
     отдельным ручным шагом. */
  projects: [
    { name: 'preview', testIgnore: /b2[abc]-flag-off|b2c-configured/ },
    {
      name: 'preview-off',
      testMatch: /b2[abc]-flag-off/,
      use: { baseURL: `http://localhost:${port + 1}` },
    },
  ],
  webServer: [
    {
      command: `npm run start -- -p ${port}`,
      port,
      reuseExistingServer: true,
      timeout: 180_000,
      env: { ANINOVA3_PREVIEW: '1', CATALOG_SOURCE: 'file' },
    },
    {
      command: `npm run start -- -p ${port + 1}`,
      port: port + 1,
      reuseExistingServer: true,
      timeout: 180_000,
      env: { ANINOVA3_PREVIEW: '', CATALOG_SOURCE: 'file' },
    },
  ],
});
