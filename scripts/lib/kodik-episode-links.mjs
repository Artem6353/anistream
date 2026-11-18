/**
 * Extract real per-episode links from one Kodik material.
 *
 * Kodik season episode numbers may restart at 1 for each season. We flatten
 * those local numbers into the title's continuous episode sequence instead
 * of inserting them into one Map where season 2 episode 1 overwrites season 1.
 * Already-global numbering is preserved when the next season starts after
 * the previous season's maximum. Only HTTP(S) URLs are accepted.
 */
function normalizeLink(value) {
  const raw = typeof value === 'string' ? value : value?.link;
  if (typeof raw !== 'string' || !raw.trim()) return null;

  let link = raw.trim().replace(/&amp;/gi, '&');
  if (link.startsWith('//')) link = `https:${link}`;
  if (!/^https?:\/\//i.test(link)) return null;

  try {
    const parsed = new URL(link);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function collectEpisodes(raw) {
  const found = new Map();
  if (Array.isArray(raw)) {
    raw.forEach((episode, index) => {
      const number = Number(episode?.episode ?? index + 1);
      const link = normalizeLink(episode);
      if (Number.isInteger(number) && number > 0 && link) found.set(number, link);
    });
    return found;
  }

  if (raw && typeof raw === 'object') {
    for (const [rawNumber, episode] of Object.entries(raw)) {
      const number = Number(rawNumber);
      const link = normalizeLink(episode);
      if (Number.isInteger(number) && number > 0 && link) found.set(number, link);
    }
  }
  return found;
}

function orderedSeasonEntries(seasons) {
  if (Array.isArray(seasons)) return seasons.map((season, index) => [String(index + 1), season]);
  if (!seasons || typeof seasons !== 'object') return [];

  return Object.entries(seasons).sort(([a], [b]) => {
    const left = Number(a);
    const right = Number(b);
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function episodeLinks(material) {
  const seasonGroups = orderedSeasonEntries(material?.seasons)
    .map(([, season]) => collectEpisodes(season?.episodes))
    .filter((episodes) => episodes.size > 0);

  if (seasonGroups.length) {
    const flattened = new Map();
    let previousMax = 0;

    for (const group of seasonGroups) {
      const numbers = [...group.keys()].sort((a, b) => a - b);
      const minimum = numbers[0];
      // If numbering restarts (1, 2, 3...) in a later season, append it.
      // If it already continues (25, 26, 27...), leave it unchanged.
      const offset = previousMax > 0 && minimum <= previousMax ? previousMax : 0;

      for (const number of numbers) {
        const globalNumber = number + offset;
        const link = group.get(number);
        if (link && !flattened.has(globalNumber)) flattened.set(globalNumber, link);
        previousMax = Math.max(previousMax, globalNumber);
      }
    }
    return flattened;
  }

  const topLevel = collectEpisodes(material?.episodes);
  if (topLevel.size) return topLevel;

  // A standalone movie/special may expose only its direct material link.
  if (material?.type === 'anime') {
    const link = normalizeLink(material?.link);
    if (link) return new Map([[1, link]]);
  }

  return new Map();
}
