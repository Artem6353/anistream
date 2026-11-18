import type { EpisodeSource } from './types';

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
  items?: CvhItem[];
}

interface CvhVideo {
  duration?: number;
  thumbUrl?: string;
  sources?: Record<string, unknown>;
}

const playlistCache = new Map<string, { expiresAt: number; items: CvhItem[] }>();
const videoCache = new Map<string, { expiresAt: number; video: CvhVideo | null }>();

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
      signal: AbortSignal.timeout(4500),
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function getPlaylist(id: string): Promise<CvhItem[]> {
  const cached = playlistCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  const url = `${API_BASE}/playlist?pub=747&aggr=mali&id=${encodeURIComponent(id)}`;
  const data = await fetchJson<CvhPlaylist>(url);
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length) {
    playlistCache.set(id, { items, expiresAt: Date.now() + PLAYLIST_TTL_MS });
  }
  return items;
}

async function getVideo(id: string): Promise<CvhVideo | null> {
  const cached = videoCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.video;

  const data = await fetchJson<CvhVideo>(`${API_BASE}/video/${encodeURIComponent(id)}`);
  const video = data?.sources ? data : null;
  videoCache.set(id, { video, expiresAt: Date.now() + (video ? VIDEO_TTL_MS : 30_000) });
  return video;
}

/** Exact episode numbers available for this studio in the live CVH playlist. */
export async function cvhAvailableEpisodes(embedUrl: string): Promise<number[]> {
  const target = parseCvhEmbedUrl(embedUrl);
  if (!target) return [];
  const items = await getPlaylist(target.id);
  const wanted = normalizeCvhStudio(target.studio);
  return [...new Set(items
    .filter((item) => Number(item.season ?? 1) === target.season)
    .filter((item) => !wanted || normalizeCvhStudio(item.voiceStudio) === wanted)
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
): Promise<EpisodeSource | null> {
  if (source.providerId !== 'cvh' || !source.embedUrl) return null;
  const target = parseCvhEmbedUrl(source.embedUrl);
  if (!target) return null;

  const items = await getPlaylist(target.id);
  const item = selectCvhPlaylistItem(items, { ...target, episode });
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
