import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * РЕГРЕССИЯ-СТРАЖ инцидента 2026-10-13.
 *
 * proxy.ts — это edge-middleware (matcher ['/api/:path*', '/genre/:path*']).
 * Edge Runtime не имеет node:fs/node:path, а lib/catalog выполняет statSync/
 * readFileSync уже в module-scope (`export const TITLES = loadTitles()`).
 * Достаточно ОДНОГО транзитивного импорта каталога из middleware — и весь
 * matcher отвечает голым «Internal Server Error» (500): так сломались
 * /api/providers/[slug]/[episode], /api/health, /api/titles и все /genre/*.
 *
 * Тест статически обходит граф импортов от proxy.ts и запрещает достигать
 * модулей с node:*-зависимостями (и lib/catalog в частности).
 */

const ROOT = path.resolve(__dirname, '..');

function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // пакеты не обходим: нас интересует собственный граф
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, 'index.ts')]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) out.push(m[1]);
  return out;
}

function reachableFrom(entry: string): Map<string, string[]> {
  const start = path.join(ROOT, entry);
  const graph = new Map<string, string[]>();
  const queue = [start];
  const seen = new Set<string>();
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const specs = importsOf(file);
    graph.set(file, specs);
    for (const spec of specs) {
      const resolved = resolveImport(file, spec);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return graph;
}

describe('edge-middleware (proxy.ts) не тянет node-only модули', () => {
  const graph = reachableFrom('proxy.ts');
  const relative = [...graph.keys()].map((f) => path.relative(ROOT, f));

  it('lib/catalog недостижим из proxy.ts', () => {
    expect(relative).not.toContain(path.join('lib', 'catalog.ts'));
  });

  it('lib/genre-pages (каталог-зависимый) недостижим из proxy.ts', () => {
    expect(relative).not.toContain(path.join('lib', 'genre-pages.ts'));
  });

  it('ни один достигнутый модуль не импортирует node:*-встроенные', () => {
    const offenders: string[] = [];
    for (const [file, specs] of graph) {
      if (specs.some((s) => s.startsWith('node:') || s === 'fs' || s === 'path')) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('genreRedirectTarget берётся из edge-safe модуля lib/genre-redirect', () => {
    const proxyImports = graph.get(path.join(ROOT, 'proxy.ts')) ?? [];
    expect(proxyImports).toContain('@/lib/genre-redirect');
  });
});
