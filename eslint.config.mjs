import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * ESLint (аудит 30.09, P2-стиль): линтер в проекте отсутствовал, при этом в коде
 * оставались eslint-disable-комментарии. Конфиг — стандартный flat-config Next.js 16
 * (core-web-vitals + typescript). Игнорируются генерируемые/служебные каталоги,
 * Python-bridge'и, Deno-функция Supabase и данные каталога.
 */
const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      '.cache/**',
      'out/**',
      'build/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'public/sw.js',
      'supabase/**',
      'bridges/**',
      'lib/data/**',
      'data/**',
      'next-env.d.ts',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      /* Данные каталога и ответы bridge — внешние JSON: точечные any осознанны
         (см. lib/providers/bridge.ts, lib/schedule.ts) — предупреждение, не ошибка. */
      '@typescript-eslint/no-explicit-any': 'warn',
      /* Аудит 30.09: все срабатывания react-hooks v6 (set-state-in-effect ×22,
         purity ×6, refs ×1) разобраны — структурные фиксы (выводимые состояния,
         keyed-state, useNow) либо документированные точечные suppressions для
         осознанных паттернов (hydration-safe localStorage-гейты, RSC Date.now,
         async load-on-mount). Правила работают на ПОЛНОЙ строгости (error). */
    },
  },
];

export default eslintConfig;
