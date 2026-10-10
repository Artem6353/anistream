#!/usr/bin/env node
/**
 * Safely migrate fresh, direct episode sources from the tracked file cache to
 * the Upstash backend selected by lib/providers/cache-kv.ts.
 *
 * Default: READ-ONLY dry run. Nothing is sent to Redis unless --apply is passed.
 *
 * Examples:
 *   node scripts/migrate-provider-cache-to-upstash.mjs
 *   node scripts/migrate-provider-cache-to-upstash.mjs --apply
 *   node scripts/migrate-provider-cache-to-upstash.mjs --apply --batch-size 100 --max-commands 8000
 *   node scripts/migrate-provider-cache-to-upstash.mjs --apply --restart
 *
 * Progress is stored locally under .cache; it contains no credentials or source URLs.
 * Each batch is idempotent. If a batch fails part-way through, rerun with --apply.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DAY_MS = 86_400_000;
const INDEX_TTL_SECONDS = 30 * 86_400;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const DEFAULT_COMMAND_BUDGET = 8_000;
const MAX_COMMAND_BUDGET = 10_000;
const DEFAULT_CACHE_FILE = '.cache/providers-resolve-cache.json';
const DEFAULT_PROGRESS_FILE = '.cache/provider-cache-upstash-migration-progress.json';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message) => {
  console.error('UPSTASH CACHE MIGRATION FAILED: ' + message);
  process.exitCode = 1;
};

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

function getEnv(key) {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) return process.env[key] ?? '';
  const values = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
  return values[key] ?? '';
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error('Option ' + name + ' requires a value.');
  }
  return args[index + 1];
}

function positiveInteger(value, name, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(name + ' must be an integer from 1 to ' + maximum + '.');
  }
  return parsed;
}

export function isDirectSource(source) {
  return Boolean(
    isRecord(source) &&
    typeof source.providerId === 'string' &&
    source.providerId.length > 0 &&
    source.providerId !== 'demo' &&
    !source.guessed &&
    !source.synthesized &&
    !/:s\d+$/.test(String(source.id ?? '')),
  );
}

export function sourceIdentity(source) {
  if (!isRecord(source)) return '';
  const providerId = String(source.providerId || 'unknown');
  let identity = '';
  if (typeof source.embedUrl === 'string' && source.embedUrl.trim()) {
    identity = source.embedUrl.trim();
    if (identity.startsWith('//')) identity = 'https:' + identity;
  } else if (Array.isArray(source.files)) {
    const item = source.files.find((file) => isRecord(file) && typeof file.url === 'string' && file.url.trim());
    if (item) identity = item.url.trim();
  }
  if (!identity) identity = String(source.id ?? '').trim();
  return identity ? providerId + ':' + identity : '';
}

function uniqueDirectSources(values) {
  const out = [];
  const seen = new Set();
  for (const source of Array.isArray(values) ? values : []) {
    if (!isDirectSource(source)) continue;
    const identity = sourceIdentity(source);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    out.push(source);
  }
  return out;
}

export function collectMigratableEntries(store, now = Date.now(), defaultTtlMs = DAY_MS) {
  const entries = [];
  const stats = {
    cacheKeys: 0,
    episodeKeys: 0,
    malformedEpisodeKeys: 0,
    expiredEntries: 0,
    entriesWithoutDirectSources: 0,
    directSources: 0,
  };

  for (const [key, rawEntry] of Object.entries(store)) {
    stats.cacheKeys += 1;
    if (!key.startsWith('ep:')) continue;
    stats.episodeKeys += 1;
    const match = /^ep:(.+):([1-9]\d*)$/.exec(key);
    if (!match || !isRecord(rawEntry)) {
      stats.malformedEpisodeKeys += 1;
      continue;
    }
    const episode = Number(match[2]);
    const at = Number(rawEntry.at);
    const ttlMs = rawEntry.ttlMs == null ? defaultTtlMs : Number(rawEntry.ttlMs);
    const expiresAt = at + ttlMs;
    if (
      !Number.isSafeInteger(episode) ||
      !Number.isFinite(at) ||
      !Number.isFinite(ttlMs) ||
      ttlMs <= 0 ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now
    ) {
      stats.expiredEntries += 1;
      continue;
    }

    const episodeSources = isRecord(rawEntry.sources) ? rawEntry.sources : {};
    const sources = uniqueDirectSources(episodeSources.sources);
    if (!sources.length) {
      stats.entriesWithoutDirectSources += 1;
      continue;
    }

    const normalizedSources = {
      ...episodeSources,
      sources,
      sourcesUsed: [...new Set(sources.map((source) => String(source.providerId || 'unknown')))].sort(),
      fromCache: false,
    };
    entries.push({
      key,
      slug: match[1],
      episode,
      at,
      ttlMs,
      expiresAt,
      sources: normalizedSources,
      directSourceCount: sources.length,
    });
    stats.directSources += sources.length;
  }

  entries.sort((a, b) => a.key.localeCompare(b.key));
  stats.eligibleEntries = entries.length;
  stats.uniqueTitles = new Set(entries.map((entry) => entry.slug)).size;
  return { entries, stats };
}

export const upstashEpisodeKey = (cacheKey) => 'ep:' + cacheKey;
export const upstashIndexKey = (slug) => 'epidx:' + slug;

function storedRecord(raw, label) {
  if (raw == null || raw === '') return null;
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    throw new Error('An existing Upstash ' + label + ' value is invalid JSON; no writes were started.');
  }
  if (!isRecord(record)) {
    throw new Error('An existing Upstash ' + label + ' value has an invalid shape; no writes were started.');
  }
  return record;
}

function isFreshRecord(record, now) {
  if (!isRecord(record)) return false;
  const at = Number(record.at);
  const ttlMs = record.ttlMs == null ? DAY_MS : Number(record.ttlMs);
  return Number.isFinite(at) && Number.isFinite(ttlMs) && ttlMs > 0 &&
    Number.isFinite(at + ttlMs) && at + ttlMs > now;
}

function sourceChecks(...values) {
  const checks = {};
  for (const value of values) {
    if (!isRecord(value)) continue;
    for (const [provider, timestamp] of Object.entries(value)) {
      if (!Number.isFinite(timestamp)) continue;
      checks[provider] = Math.max(checks[provider] ?? 0, timestamp);
    }
  }
  return Object.keys(checks).length ? checks : undefined;
}

export function mergeEpisodeRecord(incoming, existing, now = Date.now()) {
  const incomingExpiry = incoming.expiresAt ?? (incoming.at + incoming.ttlMs);
  if (!Number.isFinite(incomingExpiry) || incomingExpiry <= now) {
    throw new Error('Incoming cache entry must be fresh before migration.');
  }

  const keepExisting = isFreshRecord(existing, now) && isRecord(existing.sources);
  const oldSources = keepExisting ? uniqueDirectSources(existing.sources.sources) : [];
  const incomingSources = uniqueDirectSources(incoming.sources.sources);
  const seen = new Set(oldSources.map(sourceIdentity));
  const mergedSources = [...oldSources];
  let addedSources = 0;
  for (const source of incomingSources) {
    const identity = sourceIdentity(source);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    mergedSources.push(source);
    addedSources += 1;
  }

  const existingExpiry = keepExisting ? Number(existing.at) + Number(existing.ttlMs ?? DAY_MS) : 0;
  const expiresAt = Math.max(incomingExpiry, existingExpiry);
  const ttlMs = Math.max(1, expiresAt - now);
  const previousMeta = keepExisting ? existing.sources : {};
  const incomingMeta = incoming.sources;
  const sourceMeta = { ...previousMeta, ...incomingMeta };
  const checks = sourceChecks(previousMeta.providerChecks, incomingMeta.providerChecks);

  const episodeSources = {
    ...sourceMeta,
    sources: mergedSources,
    sourcesUsed: [...new Set(mergedSources.map((source) => String(source.providerId || 'unknown')))].sort(),
    fromCache: false,
  };
  const skip = incomingMeta.skip ?? previousMeta.skip;
  if (skip !== undefined) episodeSources.skip = skip;
  else delete episodeSources.skip;
  if (checks) episodeSources.providerChecks = checks;
  else delete episodeSources.providerChecks;

  const existingExpiryValid = keepExisting ? existingExpiry : 0;
  const shouldWrite = !keepExisting || addedSources > 0 || incomingExpiry > existingExpiryValid;
  return {
    record: { at: now, ttlMs, sources: episodeSources },
    addedSources,
    existingFresh: keepExisting,
    shouldWrite,
    expiresAt,
  };
}

export function mergeEpisodeIndex(raw, incomingEpisodes) {
  let existing = [];
  if (raw != null && raw !== '') {
    try {
      existing = JSON.parse(raw);
    } catch {
      throw new Error('An existing Upstash episode index is invalid JSON; no writes were started.');
    }
    if (!Array.isArray(existing)) {
      throw new Error('An existing Upstash episode index is not an array; no writes were started.');
    }
  }

  const normalizedExisting = existing.filter((episode) => Number.isSafeInteger(episode) && episode > 0);
  const merged = [...new Set([...normalizedExisting, ...incomingEpisodes])]
    .filter((episode) => Number.isSafeInteger(episode) && episode > 0)
    .sort((a, b) => a - b)
    .slice(-2000);
  return {
    episodes: merged,
    changed: JSON.stringify(merged) !== JSON.stringify(normalizedExisting.slice().sort((a, b) => a - b).slice(-2000)),
  };
}

async function pipeline(baseUrl, token, commands, label) {
  if (!commands.length) return [];
  let response;
  try {
    response = await fetch(baseUrl + '/pipeline', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('Upstash ' + label + ' request failed at the network layer; credentials were not printed.');
  }
  if (!response.ok) {
    throw new Error('Upstash ' + label + ' request failed with HTTP ' + response.status + '.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Upstash ' + label + ' response was not valid JSON.');
  }
  if (!Array.isArray(result) || result.length !== commands.length) {
    throw new Error('Upstash ' + label + ' returned an unexpected pipeline response.');
  }
  const failedIndex = result.findIndex((item) => !isRecord(item) || Object.prototype.hasOwnProperty.call(item, 'error'));
  if (failedIndex >= 0) {
    throw new Error('Upstash ' + label + ' command ' + (failedIndex + 1) + ' failed. The batch was not checkpointed; rerunning is safe.');
  }
  return result.map((item) => item.result);
}

function atomicWriteJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  renameSync(temp, file);
}

function loadProgress(file, fingerprint, totalEntries, restart, apply) {
  if (!apply) {
    if (!existsSync(file)) return { nextIndex: 0 };
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (saved.fingerprint === fingerprint && saved.totalEntries === totalEntries) {
        return { nextIndex: Number(saved.nextIndex) || 0 };
      }
      return { nextIndex: 0, stale: true };
    } catch {
      return { nextIndex: 0, stale: true };
    }
  }
  if (restart) return { fingerprint, totalEntries, nextIndex: 0, startedAt: new Date().toISOString() };
  if (!existsSync(file)) return { fingerprint, totalEntries, nextIndex: 0, startedAt: new Date().toISOString() };

  let saved;
  try {
    saved = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Progress file is invalid. Use --restart to begin a new migration pass.');
  }
  if (saved.fingerprint !== fingerprint || saved.totalEntries !== totalEntries) {
    throw new Error('The source cache changed since the last migration checkpoint. Use --restart to rescan safely.');
  }
  if (!Number.isSafeInteger(saved.nextIndex) || saved.nextIndex < 0 || saved.nextIndex > totalEntries) {
    throw new Error('Progress file has an invalid position. Use --restart to begin a new migration pass.');
  }
  return saved;
}

function help() {
  console.log('Usage: node scripts/migrate-provider-cache-to-upstash.mjs [options]');
  console.log('');
  console.log('Default mode is dry-run; no Redis commands are sent.');
  console.log('  --apply                    Write eligible entries to Upstash');
  console.log('  --file PATH                Input cache (default ' + DEFAULT_CACHE_FILE + ')');
  console.log('  --progress-file PATH       Local checkpoint file (default ' + DEFAULT_PROGRESS_FILE + ')');
  console.log('  --batch-size N             Entries per batch, 1..' + MAX_BATCH_SIZE + ' (default ' + DEFAULT_BATCH_SIZE + ')');
  console.log('  --max-commands N           Command budget for this run, 1..' + MAX_COMMAND_BUDGET + ' (default ' + DEFAULT_COMMAND_BUDGET + ')');
  console.log('  --restart                  Reset only the local checkpoint; does not delete Redis data');
  console.log('  --help                     Show help');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    help();
    return;
  }
  const allowed = new Set(['--apply', '--dry-run', '--restart', '--file', '--progress-file', '--batch-size', '--max-commands']);
  for (const arg of args.filter((value) => value.startsWith('--'))) {
    if (!allowed.has(arg)) throw new Error('Unknown option ' + arg + '. Use --help for usage.');
  }
  if (args.includes('--apply') && args.includes('--dry-run')) {
    throw new Error('Use either --apply or --dry-run, not both.');
  }
  const apply = args.includes('--apply');
  const restart = args.includes('--restart');
  if (restart && !apply) throw new Error('--restart only applies with --apply.');

  const cacheFile = path.resolve(optionValue(args, '--file', DEFAULT_CACHE_FILE));
  const progressFile = path.resolve(optionValue(args, '--progress-file', DEFAULT_PROGRESS_FILE));
  const batchSize = positiveInteger(optionValue(args, '--batch-size', String(DEFAULT_BATCH_SIZE)), '--batch-size', MAX_BATCH_SIZE);
  const commandBudget = positiveInteger(optionValue(args, '--max-commands', String(DEFAULT_COMMAND_BUDGET)), '--max-commands', MAX_COMMAND_BUDGET);

  if (!existsSync(cacheFile)) {
    throw new Error('Cache file not found: ' + cacheFile + '. Run this command from the repository root or pass --file.');
  }

  const rawText = readFileSync(cacheFile, 'utf8');
  const fingerprint = createHash('sha256').update(rawText).digest('hex');
  let store;
  try {
    store = JSON.parse(rawText);
  } catch {
    throw new Error('The source cache is not valid JSON; no Redis commands were sent.');
  }
  if (!isRecord(store)) throw new Error('The source cache root must be a JSON object; no Redis commands were sent.');

  const now = Date.now();
  const { entries, stats } = collectMigratableEntries(store, now);
  const progress = loadProgress(progressFile, fingerprint, entries.length, restart, apply);
  const startIndex = progress.nextIndex;
  if (!Number.isSafeInteger(startIndex) || startIndex < 0 || startIndex > entries.length) {
    throw new Error('Progress index is invalid. Use --restart to begin a new migration pass.');
  }

  const estimatedCommands = entries.length === 0
    ? 0
    : entries.length + new Set(entries.map((entry) => entry.slug)).size + Math.ceil(entries.length / batchSize);
  console.log('Provider cache → Upstash migration');
  console.log('Mode: ' + (apply ? 'APPLY' : 'DRY RUN (read-only)'));
  console.log('Source file: ' + cacheFile);
  console.log('Source fingerprint: ' + fingerprint.slice(0, 12));
  console.log('Cache keys: ' + stats.cacheKeys);
  console.log('Episode keys: ' + stats.episodeKeys);
  console.log('Expired/malformed entries skipped: ' + (stats.expiredEntries + stats.malformedEpisodeKeys));
  console.log('Entries without direct sources skipped: ' + stats.entriesWithoutDirectSources);
  console.log('Eligible fresh episode entries: ' + entries.length);
  console.log('Direct sources in eligible entries: ' + stats.directSources);
  console.log('Unique titles with eligible entries: ' + stats.uniqueTitles);
  console.log('Batch size: ' + batchSize + '; command budget per apply run: ' + commandBudget);
  console.log('Estimated command count for full pass (upper bound): ' + estimatedCommands);

  if (!apply) {
    console.log('Checkpoint position: ' + startIndex + ' of ' + entries.length);
    if (progress.stale) console.warn('A prior checkpoint belongs to a different cache file. Use --restart with --apply to rescan.');
    if (estimatedCommands > commandBudget) {
      console.warn('This migration requires multiple apply runs; the command budget prevents one unbounded write.');
    }
    console.log('DRY RUN complete. No Redis commands were sent and no files were modified.');
    return;
  }

  if (entries.length === 0) {
    console.log('No fresh direct-source entries are eligible; nothing to write.');
    return;
  }

  if (commandBudget < batchSize * 2 + 1) {
    throw new Error('--max-commands must be at least 2 * --batch-size + 1 so one worst-case batch can complete.');
  }

  const url = String(getEnv('UPSTASH_REDIS_REST_URL') || '').trim().replace(/\/+$/, '');
  const token = String(getEnv('UPSTASH_REDIS_REST_TOKEN') || '').trim();
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for --apply. Values were not printed.');
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('UPSTASH_REDIS_REST_URL is not a valid URL. Value was not printed.');
  }
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && loopback)) {
    throw new Error('Upstash URL must use HTTPS; only localhost HTTP is permitted for tests. Value was not printed.');
  }
  if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
    throw new Error('UPSTASH_REDIS_REST_URL must be the database root URL. Value was not printed.');
  }

  if (startIndex === entries.length) {
    console.log('Migration checkpoint is already complete. Use --restart to rescan idempotently.');
    return;
  }

  progress.fingerprint = fingerprint;
  progress.totalEntries = entries.length;
  progress.nextIndex = startIndex;
  progress.totalCommands = Number(progress.totalCommands) || 0;
  progress.totalWrittenEntries = Number(progress.totalWrittenEntries) || 0;
  progress.totalAddedSources = Number(progress.totalAddedSources) || 0;
  let commandsUsed = 0;
  let writtenEntries = 0;
  let addedSources = 0;
  let batchesCompleted = 0;

  while (progress.nextIndex < entries.length) {
    const commandsBeforeBatch = commandsUsed;
    const batch = entries.slice(progress.nextIndex, progress.nextIndex + batchSize);
    const slugs = [...new Set(batch.map((entry) => entry.slug))];
    const redisKeys = [
      ...batch.map((entry) => upstashEpisodeKey(entry.key)),
      ...slugs.map(upstashIndexKey),
    ];

    if (commandsUsed + 1 > commandBudget) break;
    const readResults = await pipeline(url, token, [['MGET', ...redisKeys]], 'read');
    commandsUsed += 1;
    const values = readResults[0];
    if (!Array.isArray(values) || values.length !== redisKeys.length) {
      throw new Error('Upstash MGET returned an unexpected result shape. Progress was not advanced.');
    }

    const cachedEpisodeValues = values.slice(0, batch.length);
    const cachedIndexValues = values.slice(batch.length);
    const writeCommands = [];
    let batchAdded = 0;
    let batchWritten = 0;
    const episodeNumbersBySlug = new Map();
    for (const entry of batch) {
      const list = episodeNumbersBySlug.get(entry.slug) ?? [];
      list.push(entry.episode);
      episodeNumbersBySlug.set(entry.slug, list);
    }

    for (let index = 0; index < batch.length; index += 1) {
      const entry = batch[index];
      const existing = storedRecord(cachedEpisodeValues[index], 'episode record');
      const merged = mergeEpisodeRecord(entry, existing, Date.now());
      batchAdded += merged.addedSources;
      if (!merged.shouldWrite) continue;
      const ttlSeconds = Math.max(1, Math.ceil(merged.record.ttlMs / 1000));
      writeCommands.push([
        'SET',
        upstashEpisodeKey(entry.key),
        JSON.stringify(merged.record),
        'EX',
        ttlSeconds,
      ]);
      batchWritten += 1;
    }

    for (let index = 0; index < slugs.length; index += 1) {
      const slug = slugs[index];
      const episodes = episodeNumbersBySlug.get(slug) ?? [];
      const mergedIndex = mergeEpisodeIndex(cachedIndexValues[index], episodes);
      if (!mergedIndex.changed) continue;
      writeCommands.push([
        'SET',
        upstashIndexKey(slug),
        JSON.stringify(mergedIndex.episodes),
        'EX',
        INDEX_TTL_SECONDS,
      ]);
    }

    if (commandsUsed + writeCommands.length > commandBudget) {
      // Reads are harmless, but don't start a batch whose writes would exceed this run's budget.
      break;
    }
    if (writeCommands.length) {
      await pipeline(url, token, writeCommands, 'write');
      commandsUsed += writeCommands.length;
    }

    writtenEntries += batchWritten;
    addedSources += batchAdded;
    progress.nextIndex += batch.length;
    progress.totalWrittenEntries += batchWritten;
    progress.totalAddedSources += batchAdded;
    progress.totalCommands += commandsUsed - commandsBeforeBatch;
    progress.updatedAt = new Date().toISOString();
    atomicWriteJson(progressFile, progress);
    batchesCompleted += 1;
    console.log(
      'Batch complete: position=' + progress.nextIndex + '/' + entries.length +
      ', episode-records-written=' + batchWritten +
      ', new-sources-merged=' + batchAdded +
      ', commands-used-this-run=' + commandsUsed,
    );
  }

  console.log('Apply summary: batches=' + batchesCompleted);
  console.log('Episode records written this run: ' + writtenEntries);
  console.log('New sources merged this run: ' + addedSources);
  console.log('Redis commands used this run: ' + commandsUsed + '/' + commandBudget);
  console.log('Checkpoint position: ' + progress.nextIndex + '/' + entries.length);
  console.log('Total episode records written across runs: ' + progress.totalWrittenEntries);
  console.log('Total new sources merged across runs: ' + progress.totalAddedSources);
  console.log('Checkpoint file: ' + progressFile);
  if (progress.nextIndex < entries.length) {
    console.log('Migration is incomplete. Rerun the same --apply command later to resume from the saved checkpoint.');
  } else {
    progress.completedAt = new Date().toISOString();
    atomicWriteJson(progressFile, progress);
    console.log('Migration complete. Source JSON and Redis values were not deleted.');
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
