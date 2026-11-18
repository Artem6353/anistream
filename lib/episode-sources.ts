import type { EpisodeSource, EpisodeSources } from '@/lib/providers/types';
import { rewriteAniboom, rewriteCvh } from '@/lib/providers/synthesize';
import { normalizeProviderUrl } from '@/lib/providers/url';

/**
 * Реестр источников видео.
 *
 * Supabase episode_sources содержит метаданные озвучек/шаблонов; episode_source_urls
 * хранит точные URL Kodik на конкретный эпизод. Для Kodik нельзя подменять отсутствующую
 * ссылку серии общим embed_url: такой URL может открыть другой эпизод.
 */
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const dbReady = () => Boolean(SUPA_URL && SUPA_KEY);

/** Настроен ли Supabase — для веток, где файловый fallback недопустимо дорог. */
export const episodeSourcesDbConfigured = dbReady;

type SourceRow = {
  anime_id: number;
  provider: string;
  translation_id: string;
  translation_title: string | null;
  translation_type: string | null;
  kind: string | null;
  embed_url: string | null;
  episodes_count: number | null;
  checked_at: string | null;
  status: string | null;
};

type UrlRow = {
  provider: string;
  translation_id: string;
  episode: number;
  kind: string | null;
  embed_url: string | null;
  status: string | null;
};

type AvailabilityUrlRow = Pick<UrlRow, 'provider' | 'episode' | 'embed_url'>;
type AvailabilitySourceRow = Pick<SourceRow, 'provider' | 'embed_url' | 'episodes_count'>;

const PROVIDER_NAMES: Record<string, string> = {
  kodik: 'Kodik',
  cvh: 'CVH (AnimeGo)',
  aniboom: 'AniBoom',
};

function normalizeEmbedUrl(value: string | null | undefined): string | null {
  return normalizeProviderUrl(value);
}

async function rest<T>(path: string, range?: [number, number]): Promise<T[] | null> {
  if (!dbReady()) return null;
  try {
    const headers: Record<string, string> = {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
    };
    if (range) headers.Range = `${range[0]}-${range[1]}`;
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      headers,
      signal: AbortSignal.timeout(5000),
      /* ISR-кэш: страницы серий ревалидируются сами, не дёргаем БД на каждый запрос. */
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as T[];
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/** Есть ли у тайтла хотя бы одна запись с источником (не гарантия для каждой серии). */
export async function titleHasSources(title: { slug: string; anilistId: number }): Promise<boolean> {
  if (!dbReady()) return false;
  const rows = await rest<{ anime_id: number }>(
    `episode_sources?anime_id=eq.${title.anilistId}&status=eq.ok&select=anime_id&limit=1`,
  );
  return (rows?.length ?? 0) > 0;
}

function rowToSource(row: SourceRow, episode: number, exactEpisodeUrl?: string | null): EpisodeSource | null {
  let url = normalizeEmbedUrl(exactEpisodeUrl);
  let synthesized = false;

  if (!url) {
    const template = normalizeEmbedUrl(row.embed_url);
    if (!template) return null;

    // A provider template is safe only inside the episode range it explicitly reported.
    // A missing/zero count is unknown, not unlimited. Exact per-episode URLs above
    // remain usable regardless of this header metadata.
    const episodesCount = Number(row.episodes_count);
    if (!Number.isInteger(episodesCount) || episodesCount < 1 || episode > episodesCount) return null;

    // Kodik uses an individual /seria/<id>/<hash> URL for each episode.
    // A title-level URL is not a safe substitute for a missing episode URL.
    if (row.provider === 'kodik') return null;

    if (row.provider === 'cvh') {
      url = rewriteCvh(template, episode);
      synthesized = Boolean(url && episode !== 1);
    } else if (row.provider === 'aniboom') {
      url = rewriteAniboom(template, episode);
      synthesized = Boolean(url && episode !== 1);
    } else {
      // Unknown providers are exposed only when an exact per-episode URL exists.
      return null;
    }
  }

  if (!url) return null;
  const providerId = row.provider;
  const translationId = row.translation_id;
  return {
    id: `${providerId}:${translationId}:${episode}`,
    label: row.translation_title?.trim() || PROVIDER_NAMES[providerId] || providerId,
    providerId,
    providerName: PROVIDER_NAMES[providerId] ?? providerId,
    kind: row.kind === 'file' ? 'file' : 'embed',
    embedUrl: url,
    translationId,
    ...(Number.isInteger(Number(row.episodes_count)) && Number(row.episodes_count) > 0
      ? { episodesCount: Number(row.episodes_count) }
      : {}),
    voice: row.translation_type === 'sub' ? 'subtitles' : 'voice',
    ...(synthesized ? { synthesized: true } : {}),
  };
}

/**
 * Источники конкретной серии из Supabase.
 * Exact episode URL takes precedence. CVH/AniBoom can use an explicit URL template;
 * Kodik must have an exact episode_source_urls row to avoid showing the wrong episode.
 */
export async function dbEpisodeSources(animeId: number, episode: number): Promise<EpisodeSources | null> {
  if (!dbReady()) return null;
  const [titles, urls] = await Promise.all([
    rest<SourceRow>(
      `episode_sources?anime_id=eq.${animeId}&status=eq.ok&select=anime_id,provider,translation_id,translation_title,translation_type,kind,embed_url,episodes_count,checked_at,status&limit=200`,
    ),
    rest<UrlRow>(
      `episode_source_urls?anime_id=eq.${animeId}&episode=eq.${episode}&status=eq.ok&select=provider,translation_id,episode,kind,embed_url,status&limit=200`,
    ),
  ]);
  if (titles === null && urls === null) return null;

  const urlByTranslation = new Map<string, UrlRow>();
  for (const row of urls ?? []) {
    urlByTranslation.set(`${row.provider}:${row.translation_id}`, row);
  }

  const sources: EpisodeSource[] = [];
  for (const row of titles ?? []) {
    const exact = urlByTranslation.get(`${row.provider}:${row.translation_id}`);
    const source = rowToSource(row, episode, exact?.embed_url);
    if (source) sources.push(source);
  }

  // Per-episode rows without a header row are still valid exact provider responses.
  for (const row of urls ?? []) {
    const key = `${row.provider}:${row.translation_id}`;
    if ((titles ?? []).some((title) => `${title.provider}:${title.translation_id}` === key)) continue;
    const embedUrl = normalizeEmbedUrl(row.embed_url);
    if (!embedUrl) continue;
    sources.push({
      id: `${row.provider}:${row.translation_id}:${episode}`,
      label: PROVIDER_NAMES[row.provider] ?? row.provider,
      providerId: row.provider,
      providerName: PROVIDER_NAMES[row.provider] ?? row.provider,
      kind: row.kind === 'file' ? 'file' : 'embed',
      embedUrl,
      translationId: row.translation_id,
      voice: 'unknown',
    });
  }

  if (!sources.length) return null;
  return {
    sources,
    sourcesUsed: [...new Set(sources.map((source) => source.providerId))].sort(),
    fromCache: false,
  };
}

export interface DbEpisodeAvailability {
  /** Episode numbers with an exact, non-empty URL in episode_source_urls. */
  directEpisodes: number[];
  /** CVH/AniBoom templates, limited to the episode range reported by that provider. */
  templateProviders: string[];
  templateMaxEpisodes: Record<string, number>;
}

/**
 * Bulk availability metadata for a title. This is deliberately read from Supabase,
 * not only from the Redis episode cache: imported rows must count even on a cold cache.
 */
export async function dbEpisodeAvailability(animeId: number, maxEpisode?: number): Promise<DbEpisodeAvailability | null> {
  if (!dbReady()) return null;

  const directEpisodes = new Set<number>();
  const pageSize = 1000;
  const maxPages = 50;

  for (let page = 0; page < maxPages; page++) {
    const start = page * pageSize;
    const rows = await rest<AvailabilityUrlRow>(
      `episode_source_urls?anime_id=eq.${animeId}&status=eq.ok&embed_url=not.is.null&select=provider,episode,embed_url&order=episode.asc&limit=${pageSize}`,
      [start, start + pageSize - 1],
    );
    // Do not report a partial result as complete if the database query failed.
    if (rows === null) return null;

    for (const row of rows) {
      const episode = Number(row.episode);
      if (
        Number.isInteger(episode) &&
        episode > 0 &&
        (!Number.isFinite(maxEpisode) || !maxEpisode || episode <= (maxEpisode as number)) &&
        normalizeEmbedUrl(row.embed_url)
      ) {
        directEpisodes.add(episode);
      }
    }

    if (rows.length < pageSize) break;
    if (page === maxPages - 1) return null;
  }

  const templates = await rest<AvailabilitySourceRow>(
`episode_sources?anime_id=eq.${animeId}&status=eq.ok&select=provider,embed_url,episodes_count&limit=200`,
  );
  if (templates === null) return null;

  const templateMaxEpisodes: Record<string, number> = {};
  for (const row of templates) {
    const url = normalizeEmbedUrl(row.embed_url);
    const maxEpisode = Number(row.episodes_count);
    if (!url || !Number.isInteger(maxEpisode) || maxEpisode < 1) continue;
    if (row.provider === 'cvh' && rewriteCvh(url, 1)) {
      templateMaxEpisodes.cvh = Math.max(templateMaxEpisodes.cvh ?? 0, maxEpisode);
    }
    if (row.provider === 'aniboom' && rewriteAniboom(url, 1)) {
      templateMaxEpisodes.aniboom = Math.max(templateMaxEpisodes.aniboom ?? 0, maxEpisode);
    }
  }
  const templateProviders = Object.keys(templateMaxEpisodes).sort();

  return {
    directEpisodes: [...directEpisodes].sort((a, b) => a - b),
    templateProviders,
    templateMaxEpisodes,
  };
}
