import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* .mts (ESM): __dirname недоступен — выводим из import.meta.url
   (фикс предупреждения Vite о configLoader: 'native', аудит 30.09). */
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '@': path.resolve(root, '.') } },
});
