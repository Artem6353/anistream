export interface HydrateTitle {
  slug: string;
  status?: string;
  type?: string;
  episodes?: number | null;
  episodesReleased?: number | null;
  favourites?: number;
  hidden?: boolean;
  airing?: { ep?: number }[];
  epdates?: Record<string, string>;
  shikimori?: { id?: number | string } | null;
  [key: string]: unknown;
}

export interface SelectedTitle extends HydrateTitle {
  episodes: number;
  favourites: number;
}

export interface SelectTitlesOptions {
  skipUpcoming?: boolean;
  skipNoShikimori?: boolean;
  skipEpisodesGreaterThan?: number;
  ongoingFirst?: boolean;
}

export interface SelectTitlesResult {
  selected: SelectedTitle[];
  skipped: {
    upcoming: number;
    noShikimori: number;
    giants: number;
    unknownEpisodes: number;
    hidden: number;
  };
}

export type TaskStatus = 'ok' | 'none' | 'err';

export interface HydrateStateEntry {
  s: TaskStatus;
  t: number;
}

export interface HydrateState {
  version: number;
  updatedAt: number;
  tasks: Record<string, HydrateStateEntry>;
}

export const IMPORT_STUBS: Set<number>;
export const STATE_VERSION: number;

export function maxCatalogEpisode(title: Pick<HydrateTitle, 'airing' | 'epdates'>): number;
export function releasedEpisodes(title: HydrateTitle): number | null;
export function selectTitles(titles: HydrateTitle[], opts?: SelectTitlesOptions): SelectTitlesResult;
export function parseState(raw: unknown): HydrateState;
export function shouldSkipTask(state: HydrateState, key: string, nowMs: number, retryMs: number): boolean;
export function markTask(state: HydrateState, key: string, status: TaskStatus, nowMs: number): HydrateState;
export function pruneState(state: HydrateState, nowMs: number, maxAgeMs?: number, maxEntries?: number): HydrateState;
export function taskKey(slug: string, episode: number): string;
