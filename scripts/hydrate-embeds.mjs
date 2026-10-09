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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const MODE = process.env.HYDRATE_MODE ?? 'gaps';
const numberEnv = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};
const CONCURRENCY = Math.max(1, Math.min(12, Math.floor(numberEnv('HYDRATE_CONCURRENCY', numberEnv('CONCURRENCY', 4)))));
const TIMEOUT_MS = Math.max(3000, numberEnv('HYDRATE_TIMEOUT_MS', 30000));
const DELAY_MS = Math.max(0, numberEnv('HYDRATE_DELAY_MS', 120));
const SETTLE_MS = Math.max(0, numberEnv('HYDRATE_SETTLE_MS', 6000));
const SKIP_UPCOMING = (process.env.SKIP_UPCOMING ?? '1') !== '0';
const SKIP_NO_SHIKIMORI = (process.env.SKIP_NO_SHIKIMORI ?? '0') !== '0';
const LIMIT = Math.max(0, Math.floor(numberEnv('LIMIT', 0)));
const MAX_EPISODES = Math.max(0, Math.floor(numberEnv('MAX_EPISODES', 0)));
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!['gaps', 'live'].includes(MODE)) {
  console.error('HYDRATE_MODE must be "gaps" or "live".');
  process.exit(1);
}

async function fetchJson(url, timeoutMs) {
  let lastError = 'unknown error';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
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
      }
    } catch (error) {
      lastError = String(error);
    }
    if (attempt < 2) await sleep(350 * (attempt + 1));
  }
  return { ok: false, status: 0, body: null, error: lastError };
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
  ' · timeout: ' + TIMEOUT_MS + ' ms' +
  ' · upcoming skipped: ' + skippedUpcoming +
  ' · no-Shikimori skipped: ' + skippedNoShikimori,
);

const availability = new Map();
let inventoryErrors = 0;
if (MODE === 'gaps') {
  const queue = [...selectedTitles];
  const inventoryWorkers = Array.from({ length: Math.min(8, CONCURRENCY * 2) }, async () => {
    while (queue.length) {
      const title = queue.shift();
      if (!title) break;
      const result = await fetchJson(
        BASE + '/api/availability/' + encodeURIComponent(title.slug),
        Math.min(TIMEOUT_MS, 15000),
      );
      if (result.ok && result.body?.episodes) {
        availability.set(title.slug, result.body.episodes);
      } else {
        inventoryErrors++;
        availability.set(title.slug, null);
        console.warn('\nInventory failed for ' + title.slug + ': ' + (result.error ?? 'no episode map'));
      }
    }
  });
  await Promise.all(inventoryWorkers);
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
