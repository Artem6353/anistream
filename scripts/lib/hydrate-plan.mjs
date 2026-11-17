/**
 * Чистые помощники гидратора (без сети и I/O на импорте) — чтобы покрывать их тестами
 * и держать scripts/hydrate-embeds.mjs тонким.
 *
 * - releasedEpisodes(): граница серий по единому правилу lib/episodes.ts
 *   (онгоинг → max(airing, epdates, episodesReleased); завершённый → итог; фильм → 1).
 * - selectTitles(): фильтры SKIP_UPCOMING / SKIP_NO_SHIKIMORI / SKIP_EPISODES_GREATER_THAN.
 * - resume-состояние: какие задачи уже отработаны и какие можно не повторять.
 */

/** Заглушки импортёра (24 — онгоинг, 12 — прочий ТВ): за реальный итог не считаем. */
export const IMPORT_STUBS = new Set([12, 24]);

/** Максимальный номер серии по каталогу: график эфира + точные даты. */
export function maxCatalogEpisode(title) {
  let max = 0;
  for (const airing of title?.airing ?? []) {
    const ep = Number(airing?.ep);
    if (Number.isFinite(ep) && ep > max) max = ep;
  }
  for (const key of Object.keys(title?.epdates ?? {})) {
    const n = Number(key);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** Сколько серий ВЫШЛО (верхняя граница гидрации). null — данных нет. */
export function releasedEpisodes(title) {
  const aired = maxCatalogEpisode(title);
  const stated = title?.episodes !== null && Number.isFinite(Number(title?.episodes))
    ? Number(title.episodes)
    : null;
  const stub = stated !== null && IMPORT_STUBS.has(stated);
  const statedUsable = stated !== null && stated > 0 && !(stub && aired > stated);

  if (title?.status === 'upcoming') return statedUsable && !(stub && !aired) ? stated : null;
  if (title?.type === 'movie' && !aired) return 1;
  if (title?.status === 'ongoing') {
    const fromCatalog = Number.isFinite(Number(title?.episodesReleased)) ? Number(title.episodesReleased) : 0;
    return Math.max(aired, fromCatalog) || (statedUsable ? stated : null);
  }
  const total = statedUsable ? stated : aired || null;
  return total === null ? null : Math.max(aired, total);
}

/**
 * Фильтрация каталога под прогон.
 * @param {Array<Record<string, unknown>>} titles
 * @param {{ skipUpcoming?: boolean, skipNoShikimori?: boolean, skipEpisodesGreaterThan?: number }} opts
 * @returns {{ selected: Array<Record<string, unknown> & { episodes: number }>, skipped: Record<string, number> }}
 */
export function selectTitles(titles, opts = {}) {
  const skipUpcoming = opts.skipUpcoming !== false;
  const skipNoShikimori = Boolean(opts.skipNoShikimori);
  const giantThreshold = Number(opts.skipEpisodesGreaterThan) || 0;
  const skipped = { upcoming: 0, noShikimori: 0, giants: 0, unknownEpisodes: 0, hidden: 0 };
  const selected = [];

  for (const title of titles) {
    if (!title?.slug) continue;
    if (title.hidden) {
      skipped.hidden++;
      continue;
    }
    if (skipUpcoming && title.status === 'upcoming') {
      skipped.upcoming++;
      continue;
    }
    if (skipNoShikimori && !title?.shikimori?.id) {
      skipped.noShikimori++;
      continue;
    }
    const released = releasedEpisodes(title);
    if (!released) {
      skipped.unknownEpisodes++;
      continue;
    }
    /* SKIP_EPISODES_GREATER_THAN: длинные онгоинги (sazae-san 2784, one-piece 1134)
       не блокируют первый проход по обычным тайтлам — их заливаем отдельным прогоном. */
    if (giantThreshold > 0 && released > giantThreshold) {
      skipped.giants++;
      continue;
    }
    selected.push({ ...title, episodes: released, favourites: Number(title.favourites) || 0 });
  }

  selected.sort((a, b) => b.favourites - a.favourites || a.slug.localeCompare(b.slug));
  return { selected, skipped };
}

export const STATE_VERSION = 1;

/** Разбор файла состояния (битый/чужой формат → пустое состояние, без падения). */
export function parseState(raw) {
  const empty = { version: STATE_VERSION, updatedAt: 0, tasks: {} };
  if (!raw || typeof raw !== 'object') return empty;
  const tasks = raw.tasks && typeof raw.tasks === 'object' && !Array.isArray(raw.tasks) ? raw.tasks : {};
  const clean = {};
  for (const [key, value] of Object.entries(tasks)) {
    if (!value || typeof value !== 'object') continue;
    const status = value.s;
    const at = Number(value.t);
    if (!['ok', 'none', 'err'].includes(status) || !Number.isFinite(at)) continue;
    clean[key] = { s: status, t: at };
  }
  return { version: STATE_VERSION, updatedAt: Number(raw.updatedAt) || 0, tasks: clean };
}

/**
 * Пропускать ли задачу по resume-состоянию.
 *  ok            → всегда (эпизод уже залит; кэш это подтвердит отдельно);
 *  none/err      → пока не истёк HYDRATE_RETRY_MINUTES (по умолчанию 6 часов),
 *                  иначе прогон вечно бьётся в одни и те же «пустые» серии.
 */
export function shouldSkipTask(state, key, nowMs, retryMs) {
  const entry = state?.tasks?.[key];
  if (!entry) return false;
  if (entry.s === 'ok') return true;
  if (!Number.isFinite(retryMs) || retryMs <= 0) return false;
  return nowMs - entry.t < retryMs;
}

export function markTask(state, key, status, nowMs) {
  if (!state.tasks) state.tasks = {};
  state.tasks[key] = { s: status, t: nowMs };
  state.updatedAt = nowMs;
  return state;
}

/** Обрезка состояния, чтобы файл не рос бесконечно при многодневных прогонах. */
export function pruneState(state, nowMs, maxAgeMs = 14 * 24 * 3600 * 1000, maxEntries = 300000) {
  const keys = Object.keys(state.tasks ?? {});
  if (keys.length <= maxEntries) {
    for (const key of keys) {
      if (nowMs - Number(state.tasks[key]?.t ?? 0) > maxAgeMs) delete state.tasks[key];
    }
    return state;
  }
  const sorted = keys
    .map((key) => [key, Number(state.tasks[key]?.t ?? 0)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntries);
  const kept = {};
  for (const [key, at] of sorted) {
    if (nowMs - at <= maxAgeMs) kept[key] = state.tasks[key];
  }
  state.tasks = kept;
  return state;
}

/** Ключ задачи: один и тот же формат в плане, отчёте и состоянии. */
export function taskKey(slug, episode) {
  return `${slug}:${episode}`;
}
