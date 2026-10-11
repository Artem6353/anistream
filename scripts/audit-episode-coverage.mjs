#!/usr/bin/env node
/**
 * Read-only inventory of expected catalog episodes vs. fresh exact-source cache.
 *
 * Usage:
 *   npm run audit:episodes
 *   node scripts/audit-episode-coverage.mjs --cache .cache/providers-resolve-cache.json
 *   node scripts/audit-episode-coverage.mjs --include-upcoming --include-hidden
 *
 * No provider requests are made and the catalog/cache are never modified.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildEpisodeCoverageReport, DEFAULT_CACHE_TTL_MS } from './episode-coverage-core.mjs';

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
    ) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}

function getArguments(args, defaultCache = process.env.KODIK_CACHE_FILE || '.cache/providers-resolve-cache.json') {
  const options = {
    catalog: 'lib/data/titles.json',
    cache: defaultCache,
    output: '.cache/episode-coverage-report.json',
    includeUpcoming: false,
    includeHidden: false,
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--include-upcoming') options.includeUpcoming = true;
    else if (arg === '--include-hidden') options.includeHidden = true;
    else if (arg === '--catalog' || arg === '--cache' || arg === '--output') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) throw new Error(arg + ' requires a path.');
      options[arg.slice(2)] = value;
      i += 1;
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error('Unknown argument: ' + arg);
  }
  return options;
}

function printHelp() {
  console.log('Usage: node scripts/audit-episode-coverage.mjs [options]');
  console.log('  --catalog PATH         catalog JSON (default lib/data/titles.json)');
  console.log('  --cache PATH           provider-cache JSON (default .cache/providers-resolve-cache.json)');
  console.log('  --output PATH          report JSON (default .cache/episode-coverage-report.json)');
  console.log('  --include-upcoming     count episodes of not-yet-aired titles too');
  console.log('  --include-hidden       include hidden catalog titles');
  console.log('This is a read-only local-file audit; it does not check player URLs live.');
}

try {
  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
  const options = getArguments(
    process.argv.slice(2),
    process.env.KODIK_CACHE_FILE || env.KODIK_CACHE_FILE || '.cache/providers-resolve-cache.json',
  );
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const cachePath = path.resolve(options.cache);
  const catalogPath = path.resolve(options.catalog);
  const outputPath = path.resolve(options.output);
  if (!existsSync(catalogPath)) throw new Error('Catalog file not found: ' + catalogPath);
  if (!existsSync(cachePath)) throw new Error('Provider cache not found: ' + cachePath);

  const titles = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const cacheStore = JSON.parse(readFileSync(cachePath, 'utf8'));
  const configuredTtl = Number(process.env.KODIK_CACHE_TTL_MS ?? env.KODIK_CACHE_TTL_MS ?? DEFAULT_CACHE_TTL_MS);
  const defaultTtlMs = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : DEFAULT_CACHE_TTL_MS;

  const report = buildEpisodeCoverageReport(titles, cacheStore, {
    defaultTtlMs,
    includeUpcoming: options.includeUpcoming,
    includeHidden: options.includeHidden,
  });
  report.inputs = { catalog: options.catalog, cache: options.cache };
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = outputPath + '.tmp';
  writeFileSync(tempPath, JSON.stringify(report, null, 2), 'utf8');
  renameSync(tempPath, outputPath);

  const summary = report.summary;
  console.log('Episode coverage audit (local cache; no network requests)');
  console.log('Catalog: ' + summary.catalogTitles + ' titles; eligible: ' + summary.eligibleTitles);
  console.log('Expected episodes: ' + summary.eligibleExpectedEpisodes);
  console.log('Fresh direct cache coverage: ' + summary.directCoveredEpisodes + '/' + summary.eligibleExpectedEpisodes + ' (' + summary.directEpisodeCoveragePercent + '%)');
  console.log('Fresh missing episode entries: ' + summary.missingEpisodes);
  console.log('Historical direct-source presence: ' + summary.historicalDirectCoveredEpisodes + '/' + summary.eligibleExpectedEpisodes + ' (' + summary.historicalDirectEpisodeCoveragePercent + '%)');
  console.log('Episodes with any-age source gap: ' + summary.historicalMissingEpisodes);
  console.log('Fully covered titles: ' + summary.fullyCoveredTitles);
  console.log('Partially covered titles: ' + summary.partiallyCoveredTitles);
  console.log('Titles with no fresh direct sources: ' + summary.noDirectSourceTitles);
  console.log('Titles never found in cache: ' + summary.historicalNoDirectSourceTitles);
  console.log('Expired direct records needing refresh: ' + summary.expiredDirectCacheRecordsIgnored);
  console.log('Titles missing Shikimori ID: ' + summary.titlesMissingShikimoriId);
  console.log('Fresh episode records by provider: ' + JSON.stringify(summary.providerEpisodeCounts));
  console.log('Ignored cache records: expired=' + summary.expiredCacheRecordsIgnored +
    ', malformed=' + summary.malformedCacheRecordsIgnored +
    ', synthetic-only=' + summary.recordsWithoutDirectSourcesIgnored +
    ', orphan=' + summary.orphanCacheRecordsIgnored +
    ', excluded-title=' + summary.excludedTitleCacheRecordsIgnored +
    ', out-of-range=' + summary.outOfRangeDirectCacheRecordsIgnored);
  console.log('Report saved: ' + outputPath);
  console.log('Note: cached URLs are not tested for live playback, and this report does not query Upstash.');
} catch (error) {
  console.error('Episode coverage audit failed: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
