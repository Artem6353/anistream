#!/usr/bin/env node
/**
 * Read-only inventory of expected catalog episodes vs. available exact sources.
 *
 * Источник покрытия (P1-1):
 *   --source=db    Supabase `episode_source_urls` + `episode_sources` (по умолчанию,
 *                  если заданы NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_KEY);
 *   --source=file  локальный `.cache/providers-resolve-cache.json` (легаси/self-hosted);
 *   --source=auto  db → file; падает, если недоступно и то и другое.
 *
 * Usage:
 *   npm run audit:episodes
 *   node scripts/audit-episode-coverage.mjs --source=db --summary .cache/coverage.txt
 *   node scripts/audit-episode-coverage.mjs --source=file --cache .cache/providers-resolve-cache.json
 *   node scripts/audit-episode-coverage.mjs --include-upcoming --include-hidden
 *
 * No provider requests are made and neither the catalog nor the DB is modified.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildEpisodeCoverageReport, DEFAULT_CACHE_TTL_MS } from './episode-coverage-core.mjs';
import { readCoverageFromDb } from './lib/coverage-db.mjs';

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
    source: 'auto',
    summary: '',
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--include-upcoming') options.includeUpcoming = true;
    else if (arg === '--include-hidden') options.includeHidden = true;
    else if (arg.startsWith('--source=')) {
      const value = arg.slice('--source='.length).toLowerCase();
      if (!['db', 'file', 'auto'].includes(value)) throw new Error('--source must be db, file or auto.');
      options.source = value;
    } else if (arg === '--catalog' || arg === '--cache' || arg === '--output' || arg === '--summary') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) throw new Error(arg + ' requires a path.');
      options[arg.slice(2)] = value;
      // Явный --cache означает файловый источник: файл передают осознанно.
      if (arg === '--cache') options.source = 'file';
      i += 1;
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error('Unknown argument: ' + arg);
  }
  return options;
}

function printHelp() {
  console.log('Usage: node scripts/audit-episode-coverage.mjs [options]');
  console.log('  --source=db|file|auto  где брать покрытие (auto: db при наличии Supabase-кредов)');
  console.log('  --catalog PATH         catalog JSON (default lib/data/titles.json)');
  console.log('  --cache PATH           provider-cache JSON (включает --source=file)');
  console.log('  --output PATH          report JSON (default .cache/episode-coverage-report.json)');
  console.log('  --summary PATH         короткий текстовый отчёт (для Telegram), опционально');
  console.log('  --include-upcoming     count episodes of not-yet-aired titles too');
  console.log('  --include-hidden       include hidden catalog titles');
  console.log('Read-only audit: no provider requests, no writes to catalog or DB.');
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

  const supaUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const supaKey = process.env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_KEY ?? '';
  const dbAvailable = Boolean(supaUrl && supaKey);

  let source = options.source;
  if (source === 'auto') source = dbAvailable ? 'db' : 'file';
  if (source === 'db' && !dbAvailable) {
    throw new Error('--source=db требует NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_KEY (env или .env.local).');
  }

  const titles = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const configuredTtl = Number(process.env.KODIK_CACHE_TTL_MS ?? env.KODIK_CACHE_TTL_MS ?? DEFAULT_CACHE_TTL_MS);
  const defaultTtlMs = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : DEFAULT_CACHE_TTL_MS;

  let cacheStore;
  let dbStats = null;
  if (source === 'db') {
    const result = await readCoverageFromDb({ baseUrl: supaUrl, key: supaKey, titles, ttlMs: defaultTtlMs });
    cacheStore = result.store;
    dbStats = result.stats;
    console.log(
      'Coverage source: Supabase · ' + dbStats.perEpisodeRows + ' per-episode rows · ' +
      dbStats.headerRows + ' header rows · single-embed titles: ' + dbStats.headerOnlyTitles,
    );
  } else {
    if (!existsSync(cachePath)) {
      /* feat/db-cache: JSON-кэш убран из git (93 МБ → лимит GitHub 100 МБ), источник правды —
         Supabase episode_sources/episode_source_urls. */
      throw new Error(
        'Provider cache not found: ' + cachePath +
          ' — файловый кэш больше не хранится в git (feat/db-cache). ' +
          'Используйте --source=db или передайте локальный файл через --cache.',
      );
    }
    cacheStore = JSON.parse(readFileSync(cachePath, 'utf8'));
    console.log('Coverage source: local file ' + options.cache);
  }

  const report = buildEpisodeCoverageReport(titles, cacheStore, {
    defaultTtlMs,
    includeUpcoming: options.includeUpcoming,
    includeHidden: options.includeHidden,
  });
  report.inputs = { catalog: options.catalog, source, cache: source === 'file' ? options.cache : null };
  if (dbStats) report.database = dbStats;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = outputPath + '.tmp';
  writeFileSync(tempPath, JSON.stringify(report, null, 2), 'utf8');
  renameSync(tempPath, outputPath);

  const summary = report.summary;
  console.log('Episode coverage audit (' + (source === 'db' ? 'Supabase' : 'local cache') + '; no provider requests)');
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

  /* P1-1: короткий текст для Telegram. Без markdown-разметки — она ломается на
     спецсимволах в slug'ах, а parse_mode пользователь может не включать. */
  const NL = String.fromCharCode(10);
  const text = [
    'Покрытие серий (' + (source === 'db' ? 'Supabase' : 'файл') + ')',
    'Каталог: ' + summary.catalogTitles + ' тайтлов, к расчёту: ' + summary.eligibleTitles,
    'Ожидается серий: ' + summary.eligibleExpectedEpisodes,
    'С источником: ' + summary.directCoveredEpisodes + ' (' + summary.directEpisodeCoveragePercent + '%)',
    'Без источника серий: ' + summary.missingEpisodes,
    'Тайтлов без источников вообще: ' + summary.noDirectSourceTitles,
    'Полностью покрыты: ' + summary.fullyCoveredTitles + ' · частично: ' + summary.partiallyCoveredTitles,
    'Когда-либо были источники: ' + summary.historicalDirectCoveredEpisodes +
      ' серий (' + summary.historicalDirectEpisodeCoveragePercent + '%)',
    'Гидрация намерила: ' + summary.missingEpisodes + ' серий к добору',
  ];
  if (dbStats) text.push('В БД: ' + dbStats.perEpisodeRows + ' ссылок на серии, single-embed тайтлов: ' + dbStats.headerOnlyTitles);
  text.push('Подробно: .cache/episode-coverage-report.json');
  const summaryText = text.join(NL);
  console.log(summaryText);
  if (options.summary) {
    const summaryPath = path.resolve(options.summary);
    mkdirSync(path.dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath + '.tmp', summaryText + NL, 'utf8');
    renameSync(summaryPath + '.tmp', summaryPath);
    console.log('Summary saved: ' + summaryPath);
  }
  console.log('Note: URLs are not tested for live playback, and this report does not query Upstash.');
} catch (error) {
  console.error('Episode coverage audit failed: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
