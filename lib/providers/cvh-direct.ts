import type { EpisodeSource, ProviderContext } from './types';

const API_BASE = 'https://plapi.cdnvideohub.com/api/v1/player/sv';
const API_HEADERS = {
  Accept: 'application/json',
  Referer: 'https://animego.org/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
};
const PLAYLIST_TTL_MS = 10 * 60_000;
const VIDEO_TTL_MS = 5 * 60_000;

interface CvhEmbed {
  id: string;
  season: number;
  episode: number;
  studio: string | null;
}

interface CvhItem {
  cvhId?: string;
  vkId?: string;
  voiceStudio?: string | null;
  voiceType?: string | null;
  season?: number;
  episode?: number;
}

interface CvhPlaylist {
  titleName?: string;
  items?: CvhItem[];
}

interface CvhPlaylistData {
  titleName: string | null;
  items: CvhItem[];
}

interface CvhVideo {
  duration?: number;
  thumbUrl?: string;
  sources?: Record<string, unknown>;
}

const playlistCache = new Map<string, { expiresAt: number; data: CvhPlaylistData }>();
const playlistInFlight = new Map<string, Promise<CvhPlaylistData | null>>();
const videoCache = new Map<string, { expiresAt: number; video: CvhVideo | null }>();
const videoInFlight = new Map<string, Promise<CvhVideo | null>>();

export function parseCvhEmbedUrl(value: string): CvhEmbed | null {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'cdn-iframe' || !/^\d+$/.test(parts[1] ?? '')) return null;

    const rest = parts.slice(2).map((part) => decodeURIComponent(part));
    const numbers = rest.filter((part) => /^\d+$/.test(part)).map(Number);
    if (!numbers.length) return null;

    const pathStudio = rest.find((part) => !/^\d+$/.test(part)) ?? null;
    const season = numbers.length > 1 ? numbers[0] : 1;
    const episode = numbers.length > 1 ? numbers[1] : numbers[0];
    if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) return null;

    return {
      id: parts[1],
      season,
      episode,
      studio: url.searchParams.get('dubbing')?.trim() || pathStudio,
    };
  } catch {
    return null;
  }
}

export function normalizeCvhStudio(value: string | null | undefined): string {
  return (value ?? '').toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Compare the provider's own media title with the catalogue title before trusting its streams. */
function normalizeCvhTitle(value: string): string {
  const withoutSeasonSuffix = value
    .trim()
    .replace(/\\s+(?:(?:season|сезон|part|часть)\\s*)?(?:[0-9]+|ii|iii|iv)$/i, '');
  return normalizeCvhStudio(withoutSeasonSuffix);
}

export function cvhTitleMatches(
  providerTitle: string | null | undefined,
  expectedTitles: readonly string[],
): boolean | null {
  if (!providerTitle?.trim()) return null;
  const actual = normalizeCvhTitle(providerTitle);
  const expected = expectedTitles.map(normalizeCvhTitle).filter((value) => value.length >= 4);
  if (!actual || !expected.length) return null;
  // Exact normalized identity only: substring matching can confuse Naruto with Naruto Shippuden.
  return expected.includes(actual);
}

export async function cvhTitleMatchesEmbed(
  embedUrl: string,
  expectedTitles: readonly string[],
): Promise<boolean | null> {
  const target = parseCvhEmbedUrl(embedUrl);
  if (!target) return null;
  const playlist = await getPlaylist(target.id);
  if (!playlist) return null;
  return cvhTitleMatches(playlist.titleName, expectedTitles);
}

export function selectCvhPlaylistItem(
  items: readonly CvhItem[],
  target: Pick<CvhEmbed, 'season' | 'episode' | 'studio'>,
): CvhItem | null {
  const candidates = items.filter(
    (item) => Number(item.season ?? 1) === target.season && Number(item.episode) === target.episode,
  );
  if (!candidates.length) return null;
  if (!target.studio) return candidates.find((item) => item.vkId) ?? null;

  const wanted = normalizeCvhStudio(target.studio);
  const exact = candidates.find((item) => normalizeCvhStudio(item.voiceStudio) === wanted && item.vkId);
  if (exact) return exact;
  return candidates.find((item) => {
    const actual = normalizeCvhStudio(item.voiceStudio);
    return item.vkId && actual && (actual.includes(wanted) || wanted.includes(actual));
  }) ?? null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function getPlaylist(id: string): Promise<CvhPlaylistData | null> {
  const cached = playlistCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = playlistInFlight.get(id);
  if (pending) return pending;

  const request = (async () => {
    const url = `${API_BASE}/playlist?pub=747&aggr=mali&id=${encodeURIComponent(id)}`;
    const response = await fetchJson<CvhPlaylist>(url);
    if (!response || !Array.isArray(response.items)) return null;
    const data = {
      titleName: typeof response.titleName === 'string' ? response.titleName : null,
      items: response.items,
    };
    playlistCache.set(id, {
      data,
      expiresAt: Date.now() + (data.items.length ? PLAYLIST_TTL_MS : 30_000),
    });
    return data;
  })();
  playlistInFlight.set(id, request);
  try {
    return await request;
  } finally {
    playlistInFlight.delete(id);
  }
}

async function getVideo(id: string): Promise<CvhVideo | null> {
  const cached = videoCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.video;
  const pending = videoInFlight.get(id);
  if (pending) return pending;

  const request = (async () => {
    const data = await fetchJson<CvhVideo>(`${API_BASE}/video/${encodeURIComponent(id)}`);
    const video = data?.sources ? data : null;
    videoCache.set(id, { video, expiresAt: Date.now() + (video ? VIDEO_TTL_MS : 30_000) });
    return video;
  })();
  videoInFlight.set(id, request);
  try {
    return await request;
  } finally {
    videoInFlight.delete(id);
  }
}

/** Exact episode numbers available for this studio in the live CVH playlist. */
export async function cvhAvailableEpisodes(embedUrl: string, expectedTitles?: readonly string[]): Promise<number[] | null> {
  const target = parseCvhEmbedUrl(embedUrl);
  if (!target) return [];
  const playlist = await getPlaylist(target.id);
  if (!playlist) return null;
  if (expectedTitles?.length && cvhTitleMatches(playlist.titleName, expectedTitles) !== true) return [];
  const items = playlist.items;
  const wanted = normalizeCvhStudio(target.studio);
  return [...new Set(items
    .filter((item) => Number(item.season ?? 1) === target.season)
    .filter((item) => {
      const actual = normalizeCvhStudio(item.voiceStudio);
      return !wanted || actual === wanted || (actual && (actual.includes(wanted) || wanted.includes(actual)));
    })
    .map((item) => Number(item.episode))
    .filter((episode) => Number.isInteger(episode) && episode > 0))]
    .sort((a, b) => a - b);
}

const QUALITY_KEYS: Array<[string, string]> = [
  ['mpeg4kUrl', '2160'],
  ['mpeg2kUrl', '2048'],
  ['mpegQhdUrl', '1440'],
  ['mpegFullHdUrl', '1080'],
  ['mpegHighUrl', '720'],
  ['mpegMediumUrl', '480'],
  ['mpegLowUrl', '360'],
  ['mpegLowestUrl', '240'],
  ['mpegTinyUrl', '144'],
  ['mpegMobileUrl', '144'],
];

/**
 * Resolve a CVH iframe template to signed HLS/MP4 URLs for one exact episode.
 * Signed stream URLs stay in the response only; callers must not persist them in Supabase.
 */
export async function resolveCvhDirectSource(
  source: EpisodeSource,
  episode: number,
  expectedTitles?: readonly string[],
): Promise<EpisodeSource | null> {
  if (source.providerId !== 'cvh' || !source.embedUrl) return null;
  const target = parseCvhEmbedUrl(source.embedUrl);
  if (!target) return null;

  const playlist = await getPlaylist(target.id);
  if (!playlist) return null;
  if (expectedTitles?.length && cvhTitleMatches(playlist.titleName, expectedTitles) !== true) return null;
  const item = selectCvhPlaylistItem(playlist.items, { ...target, episode });
  if (!item?.vkId) return null;

  const video = await getVideo(item.vkId);
  const streams = video?.sources;
  if (!streams) return null;

  const files: NonNullable<EpisodeSource['files']> = [];
  const hls = streams.hlsUrl;
  if (typeof hls === 'string' && /^https?:\/\//i.test(hls)) {
    files.push({ quality: 'auto', url: hls, type: 'hls' });
  }
  for (const [key, quality] of QUALITY_KEYS) {
    const url = streams[key];
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      files.push({ quality, url, type: 'mp4' });
    }
  }
  if (!files.length) return null;

  return {
    id: `${source.id}:direct`,
    label: `${source.label} · прямой поток`,
    providerId: 'cvh',
    providerName: source.providerName,
    kind: 'file',
    files,
    translationId: source.translationId,
    episodesCount: source.episodesCount,
    voice: source.voice,
    contentType: 'video',
  };
}


/**
 * Discover CVH directly by Shikimori id, without the AnimeGO HTML bridge.
 *
 * AnimeGO's cdn-iframe id is the same Shikimori id (`/cdn-iframe/52991/...`),
 * and plapi returns the full playlist with voice studios. This is the fallback
 * for GitHub Actions, where the AnimeGO search page rejects datacenter IPs.
 * It is intentionally strict: only an exact normalized title match is accepted.
 */
export async function discoverCvhSources(ctx: ProviderContext): Promise<EpisodeSource[]> {
  const id = Number(ctx.shikimoriId);
  if (!Number.isInteger(id) || id <= 0) return [];
  const playlist = await getPlaylist(String(id));
  if (!playlist) return [];
  const expected = [ctx.title, ctx.originalTitle, ctx.slug];
  if (cvhTitleMatches(playlist.titleName, expected) !== true) return [];

  const studios = new Map<string, { studio: string; season: number; episodes: number[]; subtitles: boolean }>();
  for (const item of playlist.items) {
    const studio = item.voiceStudio?.trim();
    const episode = Number(item.episode);
    const season = Number(item.season ?? 1);
    if (!studio || !item.vkId || !Number.isInteger(episode) || episode < 1) continue;
    if (!Number.isInteger(season) || season < 1) continue;
    const key = `${season}:${normalizeCvhStudio(studio)}`;
    const entry = studios.get(key) ?? {
      studio,
      season,
      episodes: [],
      subtitles: /суб|sub/i.test(String(item.voiceType ?? '')),
    };
    entry.episodes.push(episode);
    studios.set(key, entry);
  }

  return [...studios.values()]
    .sort((a, b) => a.season - b.season || b.episodes.length - a.episodes.length)
    .slice(0, 12)
    .map((entry) => {
      const studioPath = encodeURIComponent(entry.studio);
      return {
        id: `cvh:${normalizeCvhStudio(entry.studio)}:${entry.season}:${entry.episodes.length}`,
        label: `CVH · ${entry.studio}`,
        providerId: 'cvh',
        providerName: 'CVH (AnimeGo)',
        kind: 'embed',
        embedUrl: `https://animego.me/cdn-iframe/${id}/${studioPath}/${entry.season}/${Math.max(...entry.episodes)}`,
        translationId: `${normalizeCvhStudio(entry.studio)}:${entry.season}`,
        episodesCount: Math.max(...entry.episodes),
        voice: entry.subtitles ? 'subtitles' : 'voice',
        contentType: 'anime-serial',
      } satisfies EpisodeSource;
    });
}
