/** Доменные типы плеер-слоя (повторяют проверенную схему оригинала). */

export interface StreamFile {
  quality: string;
  url: string;
  type: 'hls' | 'mp4';
}

export interface SkipWindow {
  intro?: [number, number];
  outro?: [number, number];
}

/**
 * Единая единица выбора в плеере: озвучка/источник конкретного провайдера.
 * kind=embed — iframe embedUrl (Kodik /seria/…, animego cdn-iframe, aniboom embed);
 * kind=file  — разрешённые HLS/MP4 файлы (demo, опционально kodik-direct).
 */
export interface EpisodeSource {
  id: string;
  label: string;
  providerId: string;
  providerName: string;
  kind: 'embed' | 'file';
  embedUrl?: string;
  files?: StreamFile[];
  translationId?: string;
  voice?: 'voice' | 'subtitles' | 'unknown';
  /** URL подобран пулом озвучек (без кэш-шаблона) — может не найтись у провайдера. */
  guessed?: boolean;
  contentType?: string;
}

export interface EpisodeSources {
  sources: EpisodeSource[];
  sourcesUsed: string[];
  fromCache: boolean;
  cachedAt?: number;
  /** Тайминги OP/ED (Kodik skipButtons или AniSkip). */
  skip?: SkipWindow;
  errors?: Record<string, string>;
}

export interface ProviderMeta {
  id: string;
  label: string;
  hint: string;
  available: boolean;
}

/**
 * Контекст из каталога AniList: провайдер не должен сам угадывать тайтл.
 * Передаётся registry вместе с episode/totalEpisodes.
 */
export interface ProviderContext {
  slug: string;
  anilistId: number;
  malId?: number | null;
  shikimoriId?: number | null;
  title: string;
  originalTitle: string;
  year: number;
  format: string;
  episodesCount: number;
  isAdult: boolean;
  episode: number;
  totalEpisodes: number;
}

export type ResolveOutcome = { sources: EpisodeSource[]; error?: string; skip?: SkipWindow };
