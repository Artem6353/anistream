/* One-time migration for legacy episode-cache TTLs.
 *
 * Defaults to a safe dry run. Pass --apply to write changes.
 * Only records with at least one direct provider source are extended.
 * Guessed/synthesized/demo-only records are intentionally left untouched.
 *
 * Config precedence: current process env > .env.local > .env > defaults.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const DAY_MS = 86_400_000;
const apply = process.argv.includes('--apply');
const explicitDryRun = process.argv.includes('--dry-run');

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[match[1]] = value;
  }
  return values;
}

const envFromFiles = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
};
const envValue = (key) => process.env[key] ?? envFromFiles[key];
const cacheFile = envValue('KODIK_CACHE_FILE') || '.cache/providers-resolve-cache.json';
const ttlCandidate = Number(envValue('KODIK_CACHE_TTL_MS') ?? DAY_MS);
const targetTtlMs = Number.isFinite(ttlCandidate) && ttlCandidate > 0 ? ttlCandidate : DAY_MS;

function isDirect(source) {
  return source &&
    typeof source === 'object' &&
    source.providerId !== 'demo' &&
    !source.guessed &&
    !source.synthesized &&
    !/:s\d+$/.test(String(source.id ?? ''));
}

if (!existsSync(cacheFile)) {
  console.error('Cache file not found: ' + cacheFile);
  console.error('Run this command from the AniStream repository root.');
  process.exit(1);
}

let store;
try {
  store = JSON.parse(readFileSync(cacheFile, 'utf8'));
} catch (error) {
  console.error('Could not parse cache JSON: ' + String(error));
  process.exit(1);
}

if (!store || typeof store !== 'object' || Array.isArray(store)) {
  console.error('Unexpected cache format; no changes made.');
  process.exit(1);
}

let directEntries = 0;
let eligibleEntries = 0;
let changedEntries = 0;
let unchangedEntries = 0;
let ignoredEntries = 0;
const samples = [];

for (const [key, entry] of Object.entries(store)) {
  if (!key.startsWith('ep:') || !entry || typeof entry !== 'object') {
    ignoredEntries++;
    continue;
  }

  const sources = Array.isArray(entry.sources?.sources) ? entry.sources.sources : [];
  const directSources = sources.filter(isDirect);
  if (!directSources.length) {
    ignoredEntries++;
    continue;
  }

  directEntries += directSources.length;
  eligibleEntries++;
  const currentTtl = Number(entry.ttlMs);
  const effectiveTtl = Number.isFinite(currentTtl) && currentTtl > 0 ? currentTtl : 0;
  if (effectiveTtl < targetTtlMs) {
    entry.ttlMs = targetTtlMs;
    changedEntries++;
    if (samples.length < 12) samples.push({ key, oldTtlMs: effectiveTtl || null, newTtlMs: targetTtlMs });
  } else {
    unchangedEntries++;
  }
}

console.log('Provider cache TTL migration');
console.log('File: ' + cacheFile);
console.log('Target TTL: ' + targetTtlMs + ' ms (' + (targetTtlMs / 3_600_000) + ' hours)');
console.log('Entries with direct sources: ' + eligibleEntries);
console.log('Direct sources: ' + directEntries);
console.log('Entries to extend: ' + changedEntries);
console.log('Already at/above target: ' + unchangedEntries);
console.log('Ignored (demo/guess/synth/non-episode): ' + ignoredEntries);
if (samples.length) console.log('Examples: ' + JSON.stringify(samples));

if (!apply || explicitDryRun) {
  console.log('DRY RUN: no files changed. Use npm run cache:migrate-ttl -- --apply to write changes.');
  process.exit(0);
}
if (!changedEntries) {
  console.log('Nothing to migrate.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = cacheFile + '.backup-' + stamp;
const temp = cacheFile + '.tmp-' + process.pid;

try {
  copyFileSync(cacheFile, backup);
  const serialized = JSON.stringify(store);
  mkdirSync(path.dirname(cacheFile), { recursive: true });
  writeFileSync(temp, serialized, 'utf8');
  renameSync(temp, cacheFile);
  console.log('Backup: ' + backup);
  console.log('Updated cache file. Existing source URLs were not changed.');
} catch (error) {
  console.error('Migration failed; original backup (if created) remains at ' + backup);
  console.error(String(error));
  process.exit(1);
}
