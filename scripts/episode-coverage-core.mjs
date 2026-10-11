/**
 * Pure episode-cache coverage analysis shared by the local audit CLI and tests.
 * Separates exact links that exist in the file from records still fresh under TTL.
 * It does not probe third-party playback URLs for availability.
 */
export const DEFAULT_CACHE_TTL_MS = 86_400_000;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function isDirectEpisodeSource(source) {
  return isRecord(source)
    && typeof source.providerId === 'string'
    && source.providerId.length > 0
    && source.providerId !== 'demo'
    && !source.guessed
    && !source.synthesized
    && !/:s\d+$/.test(String(source.id ?? ''));
}

export function toEpisodeRanges(numbers) {
  const sorted = [...new Set(numbers)].filter((value) => Number.isSafeInteger(value) && value > 0).sort((a, b) => a - b);
  const ranges = [];
  for (const episode of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && episode === last[1] + 1) last[1] = episode;
    else ranges.push([episode, episode]);
  }
  return ranges;
}

function getShikimoriId(title) {
  const value = isRecord(title?.shikimori) ? title.shikimori.id : title?.shikimori;
  return value === null || value === undefined || value === '' || value === 0 || value === '0' ? null : String(value);
}
function safeEpisodeCount(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count > 0 ? count : 1;
}
function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

export function buildEpisodeCoverageReport(titles, cacheStore, options = {}) {
  if (!Array.isArray(titles)) throw new TypeError('Catalog root must be an array.');
  if (!isRecord(cacheStore)) throw new TypeError('Provider cache root must be an object.');
  const now = Number(options.now ?? Date.now());
  const defaultTtlMs = Number(options.defaultTtlMs ?? DEFAULT_CACHE_TTL_MS);
  const includeUpcoming = options.includeUpcoming === true;
  const includeHidden = options.includeHidden === true;
  if (!Number.isFinite(now)) throw new TypeError('now must be a finite timestamp.');
  if (!Number.isFinite(defaultTtlMs) || defaultTtlMs <= 0) throw new TypeError('defaultTtlMs must be a positive finite number.');

  const bySlug = new Map();
  const seenSlugs = new Set();
  let duplicateCatalogSlugs = 0;
  for (const title of titles) {
    if (!isRecord(title) || typeof title.slug !== 'string' || !title.slug) continue;
    if (seenSlugs.has(title.slug)) { duplicateCatalogSlugs += 1; continue; }
    seenSlugs.add(title.slug);
    bySlug.set(title.slug, title);
  }
  const selectedTitles = [...bySlug.values()].filter((title) => (includeHidden || !title.hidden) && (includeUpcoming || title.status !== 'upcoming'));
  const selectedSlugs = new Set(selectedTitles.map((title) => title.slug));
  const currentEpisodeCache = new Map();
  const historicalEpisodeCache = new Map();

  let episodeCacheRecords = 0;
  let expiredCacheRecordsIgnored = 0;
  let expiredDirectCacheRecordsIgnored = 0;
  let malformedCacheRecordsIgnored = 0;
  let recordsWithoutDirectSourcesIgnored = 0;
  let orphanCacheRecordsIgnored = 0;
  let excludedTitleCacheRecordsIgnored = 0;
  let outOfRangeDirectCacheRecordsIgnored = 0;
  let activeDirectCacheRecords = 0;
  let historicalDirectCacheRecords = 0;
  const providerEpisodeSets = new Map();
  const providerSourceCounts = {};

  for (const [key, entry] of Object.entries(cacheStore)) {
    const match = /^ep:([^:]+):(\d+)$/.exec(key);
    if (!match) continue;
    episodeCacheRecords += 1;
    const slug = match[1];
    const episode = Number(match[2]);
    if (!Number.isSafeInteger(episode) || episode < 1 || !isRecord(entry) || !isRecord(entry.sources)) {
      malformedCacheRecordsIgnored += 1;
      continue;
    }
    const title = bySlug.get(slug);
    if (!title) { orphanCacheRecordsIgnored += 1; continue; }
    if (!selectedSlugs.has(slug)) { excludedTitleCacheRecordsIgnored += 1; continue; }

    const at = Number(entry.at);
    const ttlMs = Number(entry.ttlMs ?? defaultTtlMs);
    if (!Number.isFinite(at) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      malformedCacheRecordsIgnored += 1;
      continue;
    }
    const directSources = (Array.isArray(entry.sources.sources) ? entry.sources.sources : []).filter(isDirectEpisodeSource);
    const fresh = now - at <= ttlMs;
    if (!fresh) expiredCacheRecordsIgnored += 1;
    if (!directSources.length) {
      if (fresh) recordsWithoutDirectSourcesIgnored += 1;
      continue;
    }
    if (episode > safeEpisodeCount(title.episodes)) {
      outOfRangeDirectCacheRecordsIgnored += 1;
      continue;
    }

    historicalDirectCacheRecords += 1;
    let historical = historicalEpisodeCache.get(slug);
    if (!historical) { historical = new Set(); historicalEpisodeCache.set(slug, historical); }
    historical.add(episode);
    if (!fresh) { expiredDirectCacheRecordsIgnored += 1; continue; }

    activeDirectCacheRecords += 1;
    let current = currentEpisodeCache.get(slug);
    if (!current) { current = new Map(); currentEpisodeCache.set(slug, current); }
    current.set(episode, directSources);
    for (const source of directSources) {
      const provider = String(source.providerId || 'unknown');
      providerSourceCounts[provider] = (providerSourceCounts[provider] || 0) + 1;
      if (!providerEpisodeSets.has(provider)) providerEpisodeSets.set(provider, new Set());
      providerEpisodeSets.get(provider).add(slug + ':' + episode);
    }
  }

  let expectedEpisodes = 0;
  let directCoveredEpisodes = 0;
  let historicalDirectCoveredEpisodes = 0;
  let fullyCoveredTitles = 0;
  let partiallyCoveredTitles = 0;
  let noDirectSourceTitles = 0;
  let historicalFullyCoveredTitles = 0;
  let historicalPartiallyCoveredTitles = 0;
  let historicalNoDirectSourceTitles = 0;
  let titlesMissingShikimoriId = 0;
  const titleCoverage = [];

  for (const title of selectedTitles) {
    const expected = safeEpisodeCount(title.episodes);
    const current = currentEpisodeCache.get(title.slug) ?? new Map();
    const historical = historicalEpisodeCache.get(title.slug) ?? new Set();
    const foundEpisodes = [];
    const missingEpisodes = [];
    const historicalFoundEpisodes = [];
    const historicalMissingEpisodes = [];
    for (let episode = 1; episode <= expected; episode += 1) {
      if (current.has(episode)) foundEpisodes.push(episode); else missingEpisodes.push(episode);
      if (historical.has(episode)) historicalFoundEpisodes.push(episode); else historicalMissingEpisodes.push(episode);
    }
    const directEpisodes = foundEpisodes.length;
    const historicalDirectEpisodes = historicalFoundEpisodes.length;
    expectedEpisodes += expected;
    directCoveredEpisodes += directEpisodes;
    historicalDirectCoveredEpisodes += historicalDirectEpisodes;
    if (directEpisodes === expected) fullyCoveredTitles += 1;
    else if (directEpisodes > 0) partiallyCoveredTitles += 1;
    else noDirectSourceTitles += 1;
    if (historicalDirectEpisodes === expected) historicalFullyCoveredTitles += 1;
    else if (historicalDirectEpisodes > 0) historicalPartiallyCoveredTitles += 1;
    else historicalNoDirectSourceTitles += 1;
    if (!getShikimoriId(title)) titlesMissingShikimoriId += 1;
    titleCoverage.push({
      slug: title.slug,
      title: String(title.ru ?? title.romaji ?? title.slug),
      type: String(title.type ?? 'unknown'),
      status: String(title.status ?? 'unknown'),
      episodesExpected: expected,
      episodesWithDirectSources: directEpisodes,
      coveragePercent: percent(directEpisodes, expected),
      missingEpisodeRanges: toEpisodeRanges(missingEpisodes),
      episodesWithAnyAgeDirectSources: historicalDirectEpisodes,
      historicalCoveragePercent: percent(historicalDirectEpisodes, expected),
      missingEpisodeRangesAnyAge: toEpisodeRanges(historicalMissingEpisodes),
      hasShikimoriId: Boolean(getShikimoriId(title)),
      favourites: Number(title.favourites) || 0,
    });
  }

  titleCoverage.sort((a, b) =>
    a.historicalCoveragePercent - b.historicalCoveragePercent
    || a.coveragePercent - b.coveragePercent
    || b.favourites - a.favourites
    || a.slug.localeCompare(b.slug));

  const hiddenTitles = titles.filter((title) => isRecord(title) && title.hidden).length;
  const upcomingTitles = titles.filter((title) => isRecord(title) && title.status === 'upcoming' && (includeHidden || !title.hidden)).length;
  const providerEpisodeCounts = Object.fromEntries([...providerEpisodeSets.entries()]
    .map(([provider, episodes]) => [provider, episodes.size])
    .sort(([a], [b]) => String(a).localeCompare(String(b))));

  return {
    generatedAt: new Date(now).toISOString(),
    measurement: 'direct source coverage from the local file cache; current TTL and historical presence are measured separately; URLs are not probed',
    filters: { includeUpcoming, includeHidden },
    summary: {
      catalogTitles: titles.length,
      catalogTitlesWithValidSlugs: bySlug.size,
      duplicateCatalogSlugs,
      hiddenTitles,
      upcomingTitles,
      eligibleTitles: selectedTitles.length,
      eligibleExpectedEpisodes: expectedEpisodes,
      directCoveredEpisodes,
      missingEpisodes: expectedEpisodes - directCoveredEpisodes,
      directEpisodeCoveragePercent: percent(directCoveredEpisodes, expectedEpisodes),
      historicalDirectCoveredEpisodes,
      historicalMissingEpisodes: expectedEpisodes - historicalDirectCoveredEpisodes,
      historicalDirectEpisodeCoveragePercent: percent(historicalDirectCoveredEpisodes, expectedEpisodes),
      fullyCoveredTitles,
      partiallyCoveredTitles,
      noDirectSourceTitles,
      historicalFullyCoveredTitles,
      historicalPartiallyCoveredTitles,
      historicalNoDirectSourceTitles,
      titlesMissingShikimoriId,
      episodeCacheRecords,
      activeDirectCacheRecords,
      historicalDirectCacheRecords,
      expiredCacheRecordsIgnored,
      expiredDirectCacheRecordsIgnored,
      malformedCacheRecordsIgnored,
      recordsWithoutDirectSourcesIgnored,
      orphanCacheRecordsIgnored,
      excludedTitleCacheRecordsIgnored,
      outOfRangeDirectCacheRecordsIgnored,
      providerEpisodeCounts,
      providerSourceCounts: Object.fromEntries(Object.entries(providerSourceCounts).sort(([a], [b]) => a.localeCompare(b))),
    },
    titles: titleCoverage,
  };
}
