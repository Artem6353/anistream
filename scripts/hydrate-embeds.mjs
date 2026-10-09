/* Hydrator v4: fills all catalog episodes without a direct provider result.
 *
 * HYDRATE_MODE=gaps (default): query every episode not backed by a direct result in cache.
 * "synth" and "guess" availability states are gaps, not completed episodes.
 * HYDRATE_MODE=live: refresh every eligible episode, bypassing cache and URL synthesis.
 *
 * Safe controls:
 *   --dry-run                  inventory and save .cache/hydrate-plan.json; no provider resolves
 *   LIMIT=25                   only the 25 most popular eligible titles
 *   MAX_EPISODES=200           cap a run to a fixed number of episodes
 *   SKIP_UPCOMING=1             skip not-yet-aired titles (default)
 *   SKIP_NO_SHIKIMORI=1         optionally skip titles without a Shikimori ID
 *   HYDRATE_CONCURRENCY=4       restrained default concurrency
 *
 * Requires a running Next.js server and configured live bridge(s).
 * Re-running is safe: directly-resolved episodes are skipped, failed ones remain eligible.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const MODE = process.env.HYDRATE_MODE ?? 'gaps';
const numberEnv = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};
const CONCURRENCY = Math.max(1, Math.min(12, Math.floor(numberEnv('HYDRATE_CONCURRENCY', numberEnv('CONCURRENCY', 4)))));
const INVENTORY_CONCURRENCY = Math.max(1, Math.min(4, Math.floor(numberEnv('HYDRATE_INVENTORY_CONCURRENCY', 1))));
const INVENTORY_DELAY_MS = Math.max(0, numberEnv('HYDRATE_INVENTORY_DELAY_MS', 500));
const ALLOW_PARTIAL_INVENTORY = process.env.HYDRATE_ALLOW_INVENTORY_ERRORS === '1';
const INVENTORY_SOURCE = (process.env.HYDRATE_INVENTORY_SOURCE ?? 'auto').toLowerCase();
const TIMEOUT_MS = Math.max(3000, numberEnv('HYDRATE_TIMEOUT_MS', 30000));
const DELAY_MS = Math.max(0, numberEnv('HYDRATE_DELAY_MS', 120));
const SETTLE_MS = Math.max(0, numberEnv('HYDRATE_SETTLE_MS', 6000));
const SKIP_UPCOMING = (process.env.SKIP_UPCOMING ?? '1') !== '0';
const SKIP_NO_SHIKIMORI = (process.env.SKIP_NO_SHIKIMORI ?? '0') !== '0';
const LIMIT = Math.max(0, Math.floor(numberEnv('LIMIT', 0)));
const MAX_EPISODES = Math.max(0, Math.floor(numberEnv('MAX_EPISODES', 0)));
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

const localEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
const configValue = (key) => process.env[key] ?? localEnv[key];
const cacheFile = configValue('KODIK_CACHE_FILE') || '.cache/providers-resolve-cache.json';
const cacheEnabledValue = configValue('PROVIDER_CACHE_ENABLED');
const localCacheEnabled = cacheEnabledValue === undefined
  ? true
  : ['1', 'true', 'yes', 'on'].includes(String(cacheEnabledValue).toLowerCase());
const kvConfigured = Boolean(
  configValue('UPSTASH_REDIS_REST_URL') && configValue('UPSTASH_REDIS_REST_TOKEN'),
);
const configuredTtl = Number(configValue('KODIK_CACHE_TTL_MS') ?? 86_400_000);
const cacheDefaultTtlMs = Number.isFinite(configuredTtl) && configuredTtl > 0
  ? configuredTtl
  : 86_400_000;

function isDirectSource(source) {
  return source &&
    typeof source === 'object' &&
    source.providerId !== 'demo' &&
    !source.guessed &&
    !source.synthesized &&
    !/:s\d+$/.test(String(source.id ?? ''));
}

function readLocalCacheInventory(titles) {
  const store = JSON.parse(readFileSync(cacheFile, 'utf8'));
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    throw new Error('Unexpected provider cache format');
  }
  const now = Date.now();
  const bySlug = new Map(titles.map((title) => [title.slug, {}]));
  let directEpisodeCount = 0;
  for (const [key, entry] of Object.entries(store)) {
    const match = /^ep:([^:]+):(\d+)$/.exec(key);
    if (!match || !entry || typeof entry !== 'object') continue;
    const episodes = bySlug.get(match[1]);
    if (!episodes) continue;
    const at = Number(entry.at);
    const ttlMs = Number(entry.ttlMs ?? cacheDefaultTtlMs);
    if (!Number.isFinite(at) || !Number.isFinite(ttlMs) || now - at > ttlMs) continue;
    const sources = Array.isArray(entry.sources?.sources) ? entry.sources.sources : [];
    if (!sources.some(isDirectSource)) continue;
    episodes[Number(match[2])] = 'cache';
    directEpisodeCount++;
  }
  return { bySlug, directEpisodeCount };
}


if (!['gaps', 'live'].includes(MODE)) {
  console.error('HYDRATE_MODE must be "gaps" or "live".');
  process.exit(1);
}
if (!['auto', 'api', 'file'].includes(INVENTORY_SOURCE)) {
  console.error('HYDRATE_INVENTORY_SOURCE must be "auto", "api", or "file".');
  process.exit(1);
}

function retryDelayMs(response, attempt) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(300_000, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(300_000, Math.max(0, date - Date.now()));
  }
  // 429 gets a slower exponential backoff; 5xx/network failures use a shorter one.
  const base = response.status === 429 ? 1000 : 400;
  const max = response.status === 429 ? 30_000 : 8000;
  return Math.min(max, base * (2 ** attempt)) + Math.floor(Math.random() * 250);
}

async function fetchJson(url, timeoutMs) {
  let lastError = 'unknown error';
  let lastStatus = 0;
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let delayMs = Math.min(8000, 400 * (2 ** attempt));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      lastStatus = response.status;
      if (response.ok) {
        try {
          return { ok: true, status: response.status, body: await response.json(), error: null };
        } catch (error) {
          lastError = 'invalid JSON: ' + String(error);
        }
      } else {
        lastError = 'HTTP ' + response.status;
        if (response.status !== 429 && response.status < 500) {
          return { ok: false, status: response.status, body: null, error: lastError };
        }
        delayMs = retryDelayMs(response, attempt);
      }
    } catch (error) {
      lastError = String(error);
    }
    if (attempt < maxAttempts - 1) await sleep(delayMs);
  }
  return { ok: false, status: lastStatus, body: null, error: lastError };
}

const health = await fetchJson(BASE + '/api/schedule', 5000);
if (!health.ok) {
  console.error('Next.js is not responding at ' + BASE + ': ' + health.error);
  console.error('Start npm run dev (or npm run start) and retry. No provider calls were made.');
  process.exit(1);
}

mkdirSync('.cache', { recursive: true });
const allTitles = JSON.parse(readFileSync('lib/data/titles.json', 'utf8'));
const eligibleTitles = allTitles
  .filter((title) => title?.slug && !title.hidden)
  .map((title) => ({
    ...title,
    episodes: Math.max(1, Math.floor(Number(title.episodes) || 1)),
    favourites: Number(title.favourites) || 0,
  }))
  .filter((title) => !(SKIP_UPCOMING && title.status === 'upcoming'))
  .filter((title) => !(SKIP_NO_SHIKIMORI && !title.shikimori?.id))
  .sort((a, b) => b.favourites - a.favourites || a.slug.localeCompare(b.slug));
const selectedTitles = LIMIT ? eligibleTitles.slice(0, LIMIT) : eligibleTitles;
const skippedUpcoming = allTitles.filter((title) => !title.hidden && SKIP_UPCOMING && title.status === 'upcoming').length;
const skippedNoShikimori = SKIP_NO_SHIKIMORI
  ? allTitles.filter((title) => !title.hidden && !(SKIP_UPCOMING && title.status === 'upcoming') && !title.shikimori?.id).length
  : 0;

console.log(
  'Mode: ' + MODE +
  ' · server: ' + BASE +
  ' · eligible titles: ' + selectedTitles.length +
  ' · concurrency: ' + CONCURRENCY +
  ' · inventory requested: ' + INVENTORY_SOURCE +
  ' · inventory concurrency: ' + INVENTORY_CONCURRENCY +
  ' · inventory delay: ' + INVENTORY_DELAY_MS + ' ms' +
  ' · timeout: ' + TIMEOUT_MS + ' ms' +
  ' · upcoming skipped: ' + skippedUpcoming +
  ' · no-Shikimori skipped: ' + skippedNoShikimori,
);

const availability = new Map();
let inventoryErrors = 0;
let inventoryTitlesChecked = 0;
let inventoryEarlyStopped = false;
let actualInventorySource = 'none';

if (MODE === 'gaps') {
  const canUseLocalFile = localCacheEnabled && !kvConfigured && existsSync(cacheFile);
  const useLocalFile = INVENTORY_SOURCE === 'file' ||
    (INVENTORY_SOURCE === 'auto' && canUseLocalFile);

  if (useLocalFile && (!localCacheEnabled || kvConfigured || !existsSync(cacheFile))) {
    console.error(
      'HYDRATE_INVENTORY_SOURCE=file requires an enabled local file cache and no configured Upstash KV.',
    );
    process.exit(1);
  }

  if (useLocalFile) {
    try {
      const inventory = readLocalCacheInventory(selectedTitles);
      for (const [slug, episodes] of inventory.bySlug) availability.set(slug, episodes);
      inventoryTitlesChecked = selectedTitles.length;
      actualInventorySource = 'file';
      console.log(
        'Inventory loaded from local cache: ' + inventory.directEpisodeCount +
        ' direct episode entries across ' + selectedTitles.length + ' selected titles.',
      );
    } catch (error) {
      if (INVENTORY_SOURCE === 'file') {
        console.error('Could not read local provider cache: ' + String(error));
        process.exit(1);
      }
      console.warn('Local cache inventory unavailable; falling back to API: ' + String(error));
    }
  }

  if (actualInventorySource !== 'file') {
    actualInventorySource = 'api';
    let knownGapEpisodes = 0;

    const recordResult = (title, result) => {
      inventoryTitlesChecked++;
      if (result?.ok && result.body?.episodes) {
        const known = result.body.episodes;
        availability.set(title.slug, known);
        for (let episode = 1; episode <= title.episodes; episode++) {
          if (known[episode] !== 'cache') knownGapEpisodes++;
        }
      } else {
        inventoryErrors++;
        availability.set(title.slug, null);
        console.warn(
          '\nInventory failed for ' + title.slug + ': ' + (result?.error ?? 'no episode map'),
        );
      }

      if (inventoryTitlesChecked % 25 === 0 || inventoryTitlesChecked === selectedTitles.length) {
        process.stdout.write(
          '\rInventory: ' + inventoryTitlesChecked + '/' + selectedTitles.length +
          ' titles · known gaps=' + knownGapEpisodes + ' · errors=' + inventoryErrors + '   ',
        );
      }
    };

    if (INVENTORY_CONCURRENCY === 1) {
      for (const title of selectedTitles) {
        let result;
        try {
          result = await fetchJson(
            BASE + '/api/availability/' + encodeURIComponent(title.slug),
            Math.min(TIMEOUT_MS, 15000),
          );
        } catch (error) {
          result = { ok: false, body: null, error: String(error) };
        }
        recordResult(title, result);

        // The first MAX_EPISODES gaps in title-priority order are now known.
        // No need to query the rest of a 7k-title catalog for a capped plan.
        if (
          MAX_EPISODES > 0 &&
          inventoryErrors === 0 &&
          knownGapEpisodes >= MAX_EPISODES
        ) {
          inventoryEarlyStopped = inventoryTitlesChecked < selectedTitles.length;
          break;
        }
        if (INVENTORY_DELAY_MS) await sleep(INVENTORY_DELAY_MS);
      }
    } else {
      // Parallel mode deliberately scans the complete selection so results can be
      // ordered by title priority before MAX_EPISODES is applied.
      const queue = [...selectedTitles];
      const workers = Array.from(
        { length: Math.min(INVENTORY_CONCURRENCY, queue.length || 1) },
        async () => {
          while (queue.length) {
            const title = queue.shift();
            if (!title) break;
            let result;
            try {
              result = await fetchJson(
                BASE + '/api/availability/' + encodeURIComponent(title.slug),
                Math.min(TIMEOUT_MS, 15000),
              );
            } catch (error) {
              result = { ok: false, body: null, error: String(error) };
            }
            recordResult(title, result);
            if (INVENTORY_DELAY_MS) await sleep(INVENTORY_DELAY_MS);
          }
        },
      );
      await Promise.all(workers);
    }

    if (inventoryTitlesChecked) {
      process.stdout.write(
        '\\rInventory: ' + inventoryTitlesChecked + '/' + selectedTitles.length +
        ' titles · known gaps=' + knownGapEpisodes + ' · errors=' + inventoryErrors + '   ',
      );
      console.log('');
    }
  }
}

const plan = [];
for (const title of selectedTitles) {
  const known = availability.get(title.slug);
  const episodes = [];
  for (let episode = 1; episode <= title.episodes; episode++) {
    const hasDirectCache = known?.[episode] === 'cache';
    // In gaps mode, any state except a direct cache record is a gap.
    // If inventory failed, attempt all episodes rather than silently omitting the title.
    if (MODE === 'live' || !hasDirectCache) episodes.push(episode);
  }
  if (episodes.length) plan.push({ slug: title.slug, episodes, favourites: title.favourites });
}

const allTasks = plan.flatMap((item) => item.episodes.map((episode) => ({
  slug: item.slug,
  episode,
  favourites: item.favourites,
})));
const tasks = MAX_EPISODES ? allTasks.slice(0, MAX_EPISODES) : allTasks;
const planSummary = {
  generatedAt: new Date().toISOString(),
  mode: MODE,
  server: BASE,
  catalogTitles: allTitles.length,
  eligibleTitles: selectedTitles.length,
  plannedTitles: new Set(tasks.map((task) => task.slug)).size,
  episodesTotal: tasks.length,
  dryRun: DRY_RUN,
  concurrency: CONCURRENCY,
  skippedUpcoming,
  skippedNoShikimori,
  inventoryErrors,
  inventorySource: actualInventorySource,
  inventoryTitlesChecked,
  inventoryEarlyStopped,
  limitTitles: LIMIT || null,
  limitEpisodes: MAX_EPISODES || null,
  note: 'Only direct non-demo resolver results count as filled; guessed/synthesized URLs are not treated as verified coverage.',
};
writeFileSync('.cache/hydrate-plan.json', JSON.stringify({
  ...planSummary,
  tasks: tasks.map(({ slug, episode }) => ({ slug, episode })),
}, null, 2));

console.log('Planned: ' + planSummary.plannedTitles + ' titles / ' + tasks.length + ' episodes.');
console.log('Plan written to .cache/hydrate-plan.json');
if (inventoryErrors > 0) {
  console.warn(
    'WARNING: inventory failed for ' + inventoryErrors + ' title(s). The plan may overestimate gaps for those titles.',
  );
  if (!DRY_RUN && !ALLOW_PARTIAL_INVENTORY) {
    console.error(
      'ABORT: no provider resolutions were started. Wait for rate limits to clear and retry. ' +
      'Set HYDRATE_ALLOW_INVENTORY_ERRORS=1 only if you intentionally want to continue with incomplete inventory.',
    );
    process.exit(1);
  }
}
if (DRY_RUN) {
  console.log('DRY RUN: provider resolution was not started.');
  console.log('Sample: ' + tasks.slice(0, 12).map((task) => task.slug + ':' + task.episode).join(', '));
} else {
  let done = 0;
  let resolved = 0;
  let noSource = 0;
  let requestErrors = 0;
  let sourcesFound = 0;
  const providerCounts = {};
  const failures = [];
  const queue = [...tasks];
  const startedAt = Date.now();

  async function resolveTask(task) {
    const url = BASE + '/api/providers/' + encodeURIComponent(task.slug) + '/' + task.episode + '?live=1';
    const result = await fetchJson(url, TIMEOUT_MS);
    if (!result.ok || !result.body) {
      requestErrors++;
      if (failures.length < 1000) failures.push({
        slug: task.slug,
        episode: task.episode,
        kind: 'request-error',
        error: result.error,
      });
      return;
    }

    // ?live=1 disables cache and URL-template synthesis on the server. Only an exact
    // provider/bridge result can count as a filled episode.
    const directSources = (Array.isArray(result.body.sources) ? result.body.sources : [])
      .filter((source) =>
        source &&
        source.providerId !== 'demo' &&
        !source.guessed &&
        !source.synthesized &&
        !/:s\d+$/.test(String(source.id ?? '')),
      );
    if (directSources.length) {
      resolved++;
      sourcesFound += directSources.length;
      for (const source of directSources) {
        const provider = String(source.providerId ?? 'unknown');
        providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;
      }
    } else {
      noSource++;
      if (failures.length < 1000) failures.push({
        slug: task.slug,
        episode: task.episode,
        kind: 'no-direct-source',
        providerErrors: result.body.errors ?? {},
      });
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, tasks.length)) }, async () => {
    while (queue.length) {
      const task = queue.shift();
      if (!task) break;
      try {
        await resolveTask(task);
      } catch (error) {
        requestErrors++;
        if (failures.length < 1000) failures.push({
          slug: task.slug,
          episode: task.episode,
          kind: 'request-error',
          error: String(error),
        });
      }
      done++;
      if (DELAY_MS) await sleep(DELAY_MS);
      if (done % 50 === 0 || done === tasks.length) {
        const elapsed = (Date.now() - startedAt) / 1000;
        const eta = done ? Math.round((elapsed / done) * (tasks.length - done)) : 0;
        process.stdout.write(
          '\r' + done + '/' + tasks.length +
          ' · direct=' + resolved +
          ' · no-source=' + noSource +
          ' · errors=' + requestErrors +
          ' · ETA ~' + eta + ' s   ',
        );
      }
    }
  });
  await Promise.all(workers);
  console.log('');

  if (resolved > 0 && SETTLE_MS) {
    console.log('Waiting ' + SETTLE_MS + ' ms for debounced file-cache writes…');
    await sleep(SETTLE_MS);
  }

  const report = {
    ...planSummary,
    generatedAt: new Date().toISOString(),
    dryRun: false,
    completedEpisodes: done,
    resolvedEpisodes: resolved,
    unresolvedEpisodes: noSource,
    requestErrors,
    directSourcesFound: sourcesFound,
    providerCounts,
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    unresolvedSample: failures.slice(0, 100),
    unresolvedTruncated: Math.max(0, failures.length - 100),
  };
  writeFileSync('.cache/hydrate-report.json', JSON.stringify(report, null, 2));
  console.log('Hydrator finished: direct=' + resolved + '/' + tasks.length +
    ', no-source=' + noSource + ', request-errors=' + requestErrors);
  console.log('Providers: ' + JSON.stringify(providerCounts));
  console.log('Report: .cache/hydrate-report.json');

  if (tasks.length > 0 && resolved === 0) {
    console.error('No direct source was found. Check bridge health, provider tokens and upstream access.');
    process.exitCode = 2;
  } else if (requestErrors > 0) {
    process.exitCode = 1;
  }
}
