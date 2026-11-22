#!/usr/bin/env node
/**
 * Кросс-платформенный запуск генерации машинного отчёта B1-C.
 *
 * Отчёт считает тот же код, что и тесты (lib/aninova3/comics/*), поэтому
 * запускаем его через vitest: дублировать логику разрешения связей в отдельном
 * скрипте нельзя — отчёт разошёлся бы с приложением.
 *
 * Запуск: npm run report:b1c  →  docs/data/aninova3-b1c-links-report.json
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const res = spawnSync(process.execPath, [vitest, 'run', 'tests/aninova3-links-report.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, B1C_REPORT: '1' },
});

if (res.status !== 0) {
  console.error('[b1c] отчёт не построен: vitest завершился с кодом', res.status);
  process.exit(res.status ?? 1);
}
console.log('[b1c] отчёт: docs/data/aninova3-b1c-links-report.json');
