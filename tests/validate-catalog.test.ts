import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

const validator = path.resolve(process.cwd(), 'scripts/validate-catalog.mjs');
let tempDir = '';

const validTitle = (overrides: Record<string, unknown> = {}) => ({
  anilistId: 101,
  slug: 'sample-anime',
  ru: 'Тестовое аниме',
  romaji: 'Sample Anime',
  type: 'tv',
  status: 'finished',
  year: 2024,
  episodes: 12,
  score: 8.1,
  favourites: 123,
  genres: ['Action', 'Drama'],
  poster: 'https://images.example.test/poster.jpg',
  description: 'A sample title for tests.',
  ...overrides,
});

function runValidator(value: unknown) {
  const file = path.join(tempDir, 'titles.json');
  writeFileSync(file, JSON.stringify(value), 'utf8');
  return {
    file,
    result: spawnSync(process.execPath, [validator, '--file', file], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }),
  };
}

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'aninova-catalog-validator-'));
});

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('catalog integrity validator', () => {
  it('accepts valid records and does not modify the input file', () => {
    const { file, result } = runValidator([
      validTitle(),
      validTitle({ anilistId: 102, slug: 'sample-movie', type: 'movie', episodes: 1 }),
    ]);
    const before = readFileSync(file, 'utf8');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('2 records');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('rejects duplicate slugs and AniList IDs', () => {
    const { result } = runValidator([
      validTitle(),
      validTitle({ ru: 'Дубликат', romaji: 'Duplicate' }),
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('duplicate slug');
    expect(result.stderr).toContain('duplicate anilistId');
  });

  it('rejects missing required fields and invalid enum values', () => {
    const { result } = runValidator([
      validTitle({ ru: ' ', type: 'special-unknown', status: 'airing', poster: null }),
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ru must be a non-empty string');
    expect(result.stderr).toContain('type must be one of');
    expect(result.stderr).toContain('status must be one of');
    expect(result.stderr).toContain('poster must be a string');
  });

  it('rejects an empty or non-array catalog', () => {
    const empty = runValidator([]);
    expect(empty.result.status).not.toBe(0);
    expect(empty.result.stderr).toContain('catalog must not be empty');

    const objectRoot = runValidator({ slug: 'not-a-catalog' });
    expect(objectRoot.result.status).not.toBe(0);
    expect(objectRoot.result.stderr).toContain('root value must be a JSON array');
  });
});
