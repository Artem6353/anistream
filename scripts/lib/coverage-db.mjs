/* Покрытие серий из Supabase (P1-1): чтение episode_source_urls/episode_sources
 * и сборка «виртуального» кэш-стора, который понимает episode-coverage-core.
 *
 * Зачем: до feat/db-cache отчёт покрытия строился по локальному
 * `.cache/providers-resolve-cache.json` (93 МБ, удалён из git). Источник правды
 * теперь — Supabase, поэтому аудит должен читать его напрямую, а не требовать
 * файл, которого в CI нет.
 *
 * Две таблицы дают разные вещи:
 *   episode_source_urls — ссылка на КОНКРЕТНУЮ серию (Kodik). Это и есть точное
 *     покрытие «серия N имеет источник».
 *   episode_sources — шапка озвучки. У провайдеров с одним embed на тайтл
 *     (AniBoom `?episode=N`, CVH cdn-iframe) per-episode строк нет, номер серии
 *     подставляет рантайм, поэтому такие тайтлы считаем покрытыми до
 *     `episodes_count` — иначе отчёт показывал бы ложные нули.
 *
 * Ключи стора — те же, что у файлового кэша: `ep:<slug>:<episode>`.
 *
 * Про TTL: в файловом кэше срок жизни — признак валидности записи, в БД так
 * нельзя. `episode_source_urls.status` уже отражает состояние источника (его
 * поддерживают воркеры), а `checked_at` — это «когда проверяли», а не «когда
 * протухнет». Поэтому в db-режиме аудит считает покрытием все строки status=ok,
 * а свежесть отдаёт отдельным счётчиком `staleEpisodes`, чтобы 346k старых, но
 * рабочих ссылок не выглядели как «покрытие 3%».
 */

export const DB_COVERAGE_PAGE = 1000;
export const DB_COVERAGE_TIMEOUT_MS = 60_000;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function headersFor(key) {
  return {
    apikey: key,
    Authorization: 'Bearer ' + key,
    Accept: 'application/json',
  };
}

/** Постраничное чтение таблицы PostgREST (Range-заголовки, как в hydrate-embeds.mjs). */
export async function fetchAllRows(options) {
  const {
    baseUrl,
    key,
    table,
    select,
    filter = '',
    order = '',
    page = DB_COVERAGE_PAGE,
    timeoutMs = DB_COVERAGE_TIMEOUT_MS,
    fetchImpl = fetch,
    maxRows = 5_000_000,
  } = options;
  const rows = [];
  let offset = 0;
  for (;;) {
    const url = `${baseUrl}/rest/v1/${table}?select=${select}${filter ? '&' + filter : ''}${order ? '&order=' + order : ''}`;
    const response = await fetchImpl(url, {
      headers: {
        ...headersFor(key),
        Range: `${offset}-${offset + page - 1}`,
        'Range-Unit': 'items',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`${table} HTTP ${response.status}${filter ? ' (' + filter + ')' : ''}`);
    }
    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const row of batch) rows.push(row);
    offset += batch.length;
    if (batch.length < page || rows.length >= maxRows) break;
  }
  return rows;
}

/**
 * Сборка стора + статистики из строк БД.
 * @param {{titles: Array<object>, urlRows?: Array<object>, headerRows?: Array<object>, ttlMs?: number, now?: number}} options
 */
export function buildCoverageStore(options) {
  const {
    titles,
    urlRows = [],
    headerRows = [],
    ttlMs = 86_400_000,
    stalenessMs = null,
    now = Date.now(),
  } = options;
  if (!Array.isArray(titles)) throw new TypeError('titles must be an array');
  if (!Array.isArray(urlRows) || !Array.isArray(headerRows)) {
    throw new TypeError('urlRows/headerRows must be arrays');
  }

  const slugByAnimeId = new Map();
  const expectedBySlug = new Map();
  for (const title of titles) {
    if (!isObject(title) || typeof title.slug !== 'string' || !title.slug) continue;
    const id = Number(title.anilistId);
    if (Number.isSafeInteger(id) && id > 0) slugByAnimeId.set(id, title.slug);
    expectedBySlug.set(title.slug, Number(title.episodes) > 0 ? Number(title.episodes) : 0);
  }

  /** episode -> Map<provider, at> */
  const perEpisode = new Map();
  const headerOnly = new Map();
  let orphanUrlRows = 0;
  let malformedUrlRows = 0;
  let perEpisodeRows = 0;
  let headerRowsCounted = 0;
  let staleEpisodes = 0;
  let newestCheckedAt = 0;
  const staleBefore = Number.isFinite(Number(stalenessMs)) && Number(stalenessMs) > 0
    ? now - Number(stalenessMs)
    : null;

  for (const row of urlRows) {
    if (!isObject(row)) { malformedUrlRows += 1; continue; }
    const slug = slugByAnimeId.get(Number(row.anime_id));
    const episode = Number(row.episode);
    if (!slug) { orphanUrlRows += 1; continue; }
    if (!Number.isSafeInteger(episode) || episode < 1) { malformedUrlRows += 1; continue; }
    if (!perEpisode.has(slug)) perEpisode.set(slug, new Map());
    const episodes = perEpisode.get(slug);
    if (!episodes.has(episode)) episodes.set(episode, new Map());
    const providers = episodes.get(episode);
    const provider = String(row.provider || 'unknown');
    const at = Date.parse(row.checked_at ?? '') || now;
    providers.set(provider, Math.max(providers.get(provider) ?? 0, at));
    if (at > newestCheckedAt) newestCheckedAt = at;
    if (staleBefore !== null && at < staleBefore) staleEpisodes += 1;
    perEpisodeRows += 1;
  }

  for (const row of headerRows) {
    if (!isObject(row)) continue;
    const slug = slugByAnimeId.get(Number(row.anime_id));
    if (!slug) continue;
    if (perEpisode.has(slug) && perEpisode.get(slug).size > 0) continue; // точные ссылки важнее шапки
    if (!headerOnly.has(slug)) headerOnly.set(slug, new Map());
    const providers = headerOnly.get(slug);
    const provider = String(row.provider || 'unknown');
    const at = Date.parse(row.checked_at ?? '') || now;
    const episodesCount = Number(row.episodes_count) > 0 ? Number(row.episodes_count) : 0;
    const previous = providers.get(provider);
    providers.set(provider, {
      at: Math.max(previous?.at ?? 0, at),
      episodesCount: Math.max(previous?.episodesCount ?? 0, episodesCount),
    });
    headerRowsCounted += 1;
  }

  const store = {};
  let urlEpisodes = 0;
  let headerEpisodes = 0;
  for (const [slug, episodes] of perEpisode) {
    for (const [episode, providers] of episodes) {
      const sources = [...providers.entries()].map(([providerId, at]) => ({
        id: `${providerId}:episode:${episode}`,
        providerId,
        providerName: providerId,
        kind: 'embed',
        dedupeKey: `${providerId}:${slug}:${episode}`,
        checkedAt: at,
      }));
      const at = Math.max(...sources.map((source) => source.checkedAt));
      store[`ep:${slug}:${episode}`] = { at, ttlMs, sources: { sources, sourcesUsed: [...providers.keys()] } };
      urlEpisodes += 1;
    }
  }
  for (const [slug, providers] of headerOnly) {
    const expected = expectedBySlug.get(slug) ?? 0;
    const maxCount = Math.max(...[...providers.values()].map((value) => value.episodesCount), 0);
    const limit = Math.min(expected > 0 ? expected : maxCount, maxCount > 0 ? maxCount : expected);
    if (!Number.isFinite(limit) || limit <= 0) continue;
    for (let episode = 1; episode <= limit; episode += 1) {
      const sources = [...providers.entries()].map(([providerId, value]) => ({
        id: `${providerId}:embed`,
        providerId,
        providerName: providerId,
        kind: 'embed',
        dedupeKey: `${providerId}:${slug}`,
        checkedAt: value.at,
      }));
      const at = Math.max(...sources.map((source) => source.checkedAt));
      store[`ep:${slug}:${episode}`] = { at, ttlMs, sources: { sources, sourcesUsed: [...providers.keys()] } };
      headerEpisodes += 1;
    }
  }

  return {
    store,
    stats: {
      perEpisodeRows,
      urlEpisodes,
      headerRows: headerRowsCounted,
      headerEpisodes,
      headerOnlyTitles: headerOnly.size,
      orphanUrlRows,
      malformedUrlRows,
      staleEpisodes,
      newestCheckedAt: newestCheckedAt > 0 ? new Date(newestCheckedAt).toISOString() : null,
      stalenessMs: staleBefore === null ? null : Number(stalenessMs),
      titlesWithAnilistId: slugByAnimeId.size,
    },
  };
}

/** Чтение обеих таблиц и сборка стора (сеть). */
export async function readCoverageFromDb(options) {
  const {
    baseUrl,
    key,
    titles,
    ttlMs = 86_400_000,
    stalenessMs = null,
    now = Date.now(),
    page = DB_COVERAGE_PAGE,
    fetchImpl = fetch,
  } = options;
  if (!baseUrl || !key) {
    throw new Error('Supabase credentials are required (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY)');
  }
  const [urlRows, headerRows] = await Promise.all([
    fetchAllRows({
      baseUrl, key, page, fetchImpl,
      table: 'episode_source_urls',
      select: 'anime_id,provider,episode,checked_at',
      filter: 'status=eq.ok',
      order: 'anime_id.asc,episode.asc',
    }),
    fetchAllRows({
      baseUrl, key, page, fetchImpl,
      table: 'episode_sources',
      select: 'anime_id,provider,episodes_count,checked_at',
      filter: 'status=eq.ok',
      order: 'anime_id.asc',
    }),
  ]);
  return buildCoverageStore({ titles, urlRows, headerRows, ttlMs, stalenessMs, now });
}
