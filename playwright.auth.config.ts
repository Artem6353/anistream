import { defineConfig } from '@playwright/test';

/** B2-C: отдельный прогон с изолированным mock Supabase. Не входит в обычный
 *  playwright.config.ts: основной CI-билд не должен получать тестовые ключи. */
const base = process.env.B2C_BASE ?? 'http://127.0.0.1:3202';

export default defineConfig({
  testDir: 'e2e',
  testMatch: /b2[cd]-configured/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: base, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node e2e/mock-supabase.mjs',
      port: 54321,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `npm run start -- -p ${new URL(base).port}`,
      port: Number(new URL(base).port),
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        ANINOVA3_PREVIEW: '1',
        CATALOG_SOURCE: 'file',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        ANINOVA3_E2E_SUPABASE_ORIGIN: 'http://127.0.0.1:54321',
      },
    },
  ],
});
