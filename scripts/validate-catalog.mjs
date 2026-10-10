#!/usr/bin/env node
/**
 * Read-only guard for catalog-writing workflows.
 *
 * Validates invariants required by lib/catalog.ts and route generation before a
 * workflow commits titles.json. It never rewrites catalog data.
 *
 * Usage:
 *   node scripts/validate-catalog.mjs
 *   node scripts/validate-catalog.mjs --file /path/to/titles.json
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const file = fileIndex >= 0 && args[fileIndex + 1]
  ? path.resolve(args[fileIndex + 1])
  : path.resolve('lib/data/titles.json');

const fail = (message) => {
  console.error('CATALOG VALIDATION FAILED: ' + message);
  process.exit(1);
};

let titles;
try {
  titles = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  fail(`cannot read valid JSON from ${file}: ${error instanceof Error ? error.message : String(error)}`);
}

if (!Array.isArray(titles)) fail('root value must be a JSON array');
if (titles.length === 0) fail('catalog must not be empty');

const validTypes = new Set(['tv', 'movie', 'ona', 'ova', 'special']);
const validStatuses = new Set(['ongoing', 'finished', 'upcoming']);
const slugOwners = new Map();
const idOwners = new Map();
const errors = [];

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const addError = (index, slug, detail) => {
  errors.push(`#${index + 1}${slug ? ` (${slug})` : ''}: ${detail}`);
};

for (let index = 0; index < titles.length; index += 1) {
  const title = titles[index];
  if (!isRecord(title)) {
    addError(index, '', 'record must be a JSON object');
    continue;
  }

  const slug = typeof title.slug === 'string' ? title.slug.trim() : '';
  if (!slug) {
    addError(index, '', 'slug must be a non-empty string');
  } else {
    if (slug !== title.slug) addError(index, slug, 'slug must not contain leading/trailing whitespace');
    if (slugOwners.has(slug)) {
      addError(index, slug, `duplicate slug (also used at record #${slugOwners.get(slug) + 1})`);
    } else {
      slugOwners.set(slug, index);
    }
    if (slug.includes('/')) addError(index, slug, 'slug must not contain a slash');
  }

  if (!Number.isSafeInteger(title.anilistId) || title.anilistId < 1) {
    addError(index, slug, 'anilistId must be a positive safe integer');
  } else if (idOwners.has(title.anilistId)) {
    addError(index, slug, `duplicate anilistId ${title.anilistId} (also used at record #${idOwners.get(title.anilistId) + 1})`);
  } else {
    idOwners.set(title.anilistId, index);
  }

  for (const field of ['ru', 'romaji']) {
    if (typeof title[field] !== 'string' || !title[field].trim()) {
      addError(index, slug, `${field} must be a non-empty string`);
    }
  }

  if (!validTypes.has(title.type)) {
    addError(index, slug, `type must be one of: ${[...validTypes].join(', ')}`);
  }
  if (!validStatuses.has(title.status)) {
    addError(index, slug, `status must be one of: ${[...validStatuses].join(', ')}`);
  }
  if (!Number.isSafeInteger(title.year) || title.year < 0 || title.year > 2200) {
    addError(index, slug, 'year must be an integer between 0 and 2200');
  }
  if (!Number.isSafeInteger(title.episodes) || title.episodes < 0) {
    addError(index, slug, 'episodes must be a non-negative integer');
  }
  if (!isFiniteNumber(title.score) || title.score < 0 || title.score > 10) {
    addError(index, slug, 'score must be a finite number between 0 and 10');
  }
  if (!isFiniteNumber(title.favourites) || title.favourites < 0) {
    addError(index, slug, 'favourites must be a finite non-negative number');
  }
  if (!Array.isArray(title.genres) || !title.genres.every((genre) => typeof genre === 'string')) {
    addError(index, slug, 'genres must be an array of strings');
  }
  if (typeof title.poster !== 'string') {
    addError(index, slug, 'poster must be a string');
  }
  if (typeof title.description !== 'string') {
    addError(index, slug, 'description must be a string');
  }
}

if (errors.length) {
  console.error(`Catalog validation failed: ${errors.length} issue(s) across ${titles.length} record(s).`);
  for (const error of errors.slice(0, 100)) console.error(' - ' + error);
  if (errors.length > 100) console.error(` - ... and ${errors.length - 100} more issue(s)`);
  process.exit(1);
}

console.log(`Catalog validation passed: ${titles.length} records, unique slugs and AniList IDs.`);
console.log('Required catalog fields and route-critical values are valid; no files were modified.');
