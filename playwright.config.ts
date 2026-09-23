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
  use: { baseURL: base, trace: 'retain-on-failure' },
  webServer: {
    command: `npm run start -- -p ${port}`,
    port,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
