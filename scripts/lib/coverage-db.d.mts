/** Типы для scripts/lib/coverage-db.mjs (покрытие серий из Supabase, P1-1). */

export interface CoverageTitle {
  slug: string;
  anilistId?: number | string | null;
  episodes?: number | null;
  hidden?: boolean;
  status?: string;
  [key: string]: unknown;
}

export interface CoverageDbRow {
  anime_id?: number | string | null;
  provider?: string | null;
  episode?: number | string | null;
  episodes_count?: number | string | null;
  checked_at?: string | null;
  [key: string]: unknown;
}

export interface CoverageStats {
  perEpisodeRows: number;
  urlEpisodes: number;
  headerRows: number;
  headerEpisodes: number;
  headerOnlyTitles: number;
  orphanUrlRows: number;
  malformedUrlRows: number;
  /** Строки status=ok, проверенные раньше `stalenessMs` (в db-режиме они всё равно считаются покрытием). */
  staleEpisodes: number;
  newestCheckedAt: string | null;
  stalenessMs: number | null;
  titlesWithAnilistId: number;
}

export interface CoverageStore {
  [key: string]: {
    at: number;
    ttlMs: number;
    sources: { sources: Array<Record<string, unknown>>; sourcesUsed: string[] };
  };
}

export interface BuildCoverageStoreOptions {
  titles: CoverageTitle[];
  urlRows?: CoverageDbRow[];
  headerRows?: CoverageDbRow[];
  ttlMs?: number;
  /** Возраст, после которого серия считается устаревшей (только счётчик, не фильтр). */
  stalenessMs?: number | null;
  now?: number;
}

export interface FetchAllRowsOptions {
  baseUrl: string;
  key: string;
  table: string;
  select: string;
  filter?: string;
  order?: string;
  page?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  maxRows?: number;
}

export interface ReadCoverageFromDbOptions {
  baseUrl: string;
  key: string;
  titles: CoverageTitle[];
  ttlMs?: number;
  stalenessMs?: number | null;
  now?: number;
  page?: number;
  fetchImpl?: typeof fetch;
}

export const DB_COVERAGE_PAGE: number;
export const DB_COVERAGE_TIMEOUT_MS: number;

export function fetchAllRows(options: FetchAllRowsOptions): Promise<CoverageDbRow[]>;
export function buildCoverageStore(options: BuildCoverageStoreOptions): { store: CoverageStore; stats: CoverageStats };
export function readCoverageFromDb(options: ReadCoverageFromDbOptions): Promise<{ store: CoverageStore; stats: CoverageStats }>;
