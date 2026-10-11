import type { EpisodeSources } from './types';

export interface EpisodeCacheRecord {
  at: number;
  ttlMs?: number;
  sources: EpisodeSources;
  [key: string]: unknown;
}

export function encodeEpisodeCacheValue(record: EpisodeCacheRecord | Record<string, unknown>): string;
export function decodeEpisodeCacheValue(value: string): EpisodeCacheRecord;
export const EPISODE_CACHE_COMPRESSION_PREFIX: string;
