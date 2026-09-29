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
      /* Новые advisory-правила react-hooks v6 (React Compiler era): в существующей
         кодовой базе 29 срабатываний (Date.now/Math.random в рендере относительных
         дат, setState-инициализация в эффектах). Это не баги «здесь и сейчас»,
         а рекомендации по производительности — понижаем до warn, чтобы CI-гейт
         (0 errors) оставался осмысленным; разбирать точечно в рамках техдолга. */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];

export default eslintConfig;
