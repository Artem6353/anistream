import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * РЕГРЕССИЯ-СТРАЖ инцидента 2026-10-13 (бутстрап прайма каталога/серий).
 *
 * Хронология граблей:
 *  1) `instrumentation.node.ts` — Next 16 такой файл НЕ распознаёт (детектор:
 *     /^instrumentation\.(ts|tsx|js|jsx)$/ + сверка базового имени), register()
 *     молча не вызывался, прайма не было;
 *  2) переименованный `instrumentation.ts` с динамическими импортами lib/catalog
 *     уронил webpack-сборку edge-чанка (node:fs → UnhandledSchemeError), из-за
 *     чего прод остался на старом деплое с падающим edge-middleware.
 *
 * Итоговое устройство: хука instrumentation в проекте НЕТ, прайм стартует
 * самостартом в module-scope lib/catalog.ts и lib/episode-data.ts под guard'ом
 * NEXT_RUNTIME === 'nodejs' (эти модули не попадают в edge-бандлы: proxy.ts
 * импортирует только edge-safe lib/genre-redirect).
 */

const ROOT = path.resolve(__dirname, '..');

describe('бутстрап прайма: без хука instrumentation, без node:fs в edge', () => {
  it('мёртвого instrumentation.node.ts нет', () => {
    expect(existsSync(path.join(ROOT, 'instrumentation.node.ts'))).toBe(false);
  });

  it('instrumentation.ts не возвращает node-only импорты в edge-сборку', () => {
    const file = path.join(ROOT, 'instrumentation.ts');
    if (!existsSync(file)) return; // хука нет — это текущая норма
    const src = readFileSync(file, 'utf8');
    expect(src).not.toContain('@/lib/catalog');
    expect(src).not.toContain('@/lib/episode-data');
  });

  it('lib/catalog: самостарт primeCatalogFromDb под guard NEXT_RUNTIME', () => {
    const src = readFileSync(path.join(ROOT, 'lib', 'catalog.ts'), 'utf8');
    expect(src).toContain("process.env.NEXT_RUNTIME === 'nodejs'");
    expect(src).toContain('void primeCatalogFromDb().catch(');
  });

  it('lib/episode-data: самостарт primeEpisodeData под guard NEXT_RUNTIME', () => {
    const src = readFileSync(path.join(ROOT, 'lib', 'episode-data.ts'), 'utf8');
    expect(src).toContain("process.env.NEXT_RUNTIME === 'nodejs'");
    expect(src).toContain('void primeEpisodeData().catch(');
  });

  it('детектор Next 16 не принял бы instrumentation.node.ts (справочно)', () => {
    const detection = /^instrumentation\.(ts|tsx|js|jsx)$/;
    expect(detection.test('instrumentation.node.ts')).toBe(false);
  });
});
