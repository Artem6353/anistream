import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * РЕГРЕССИЯ-СТРАЖ инцидента 2026-10-13 (вторая половина).
 *
 * Next 16 распознаёт хук instrumentation ТОЛЬКО по имени файла
 * /^instrumentation\.(ts|tsx|js|jsx)$/ (build/index.js:
 * instrumentationHookDetectionRegExp + проверка базового имени).
 * Файл `instrumentation.node.ts` (состояние на 1483d1a) под это правило НЕ
 * попадал: register() молча не вызывался на проде, прайм каталога из Supabase
 * не происходил, и каждый холодный процесс парсил lib/data/titles.json (28 МБ)
 * вместо готового in-memory кэша — лишний риск OOM/таймаута серверной функции.
 *
 * Одновременно instrumentation.ts обязан_guard'ить NEXT_RUNTIME: хук собирается
 * для обоих рантаймов, динамические импорты node-only модулей допустимы только
 * под проверкой 'nodejs'.
 */

const ROOT = path.resolve(__dirname, '..');

describe('instrumentation-хук детектируется Next и безопасен для edge', () => {
  it('файл instrumentation.ts существует в корне проекта', () => {
    expect(existsSync(path.join(ROOT, 'instrumentation.ts'))).toBe(true);
  });

  it('мёртвого instrumentation.node.ts больше нет', () => {
    expect(existsSync(path.join(ROOT, 'instrumentation.node.ts'))).toBe(false);
  });

  it('имя файла проходит детектор хука Next 16', () => {
    const detection = /^instrumentation\.(ts|tsx|js|jsx)$/;
    expect(detection.test('instrumentation.ts')).toBe(true);
    expect(detection.test('instrumentation.node.ts')).toBe(false);
  });

  it('register() закрыт проверкой NEXT_RUNTIME до динамических импортов', () => {
    const src = readFileSync(path.join(ROOT, 'instrumentation.ts'), 'utf8');
    expect(src).toContain("process.env.NEXT_RUNTIME !== 'nodejs'");
    const guardAt = src.indexOf("process.env.NEXT_RUNTIME !== 'nodejs'");
    const firstImportAt = src.indexOf("await import('@/lib/");
    expect(guardAt).toBeGreaterThan(-1);
    expect(firstImportAt).toBeGreaterThan(guardAt);
  });

  it('lib/catalog страхует: самостарт прайма в nodejs-рантайме', () => {
    const src = readFileSync(path.join(ROOT, 'lib', 'catalog.ts'), 'utf8');
    expect(src).toContain("process.env.NEXT_RUNTIME === 'nodejs'");
    expect(src).toContain('void primeCatalogFromDb().catch(');
  });
});
