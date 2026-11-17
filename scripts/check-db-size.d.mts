/** Типы для scripts/check-db-size.mjs (монитор квоты Supabase, P1-2). */

export interface StorageTable {
  name: string;
  bytes: number;
  rows?: number | null;
}

export interface StorageReport {
  generatedAt: string;
  exact: boolean;
  exactReason: string | null;
  databaseBytes: number;
  databaseMb: number;
  quotaMb: number;
  usedPct: number;
  thresholdPct: number;
  criticalPct: number;
  overThreshold: boolean;
  overCritical: boolean;
  freeMb: number;
  newestSourceAgeDays: number | null;
  tables: Array<{ name: string; mb: number; rows: number | null }>;
}

export interface BuildReportInput {
  databaseBytes: number;
  quotaMb: number;
  alertPct: number;
  criticalPct: number;
  tables?: StorageTable[];
  exact?: boolean;
  exactReason?: string | null;
  newestSourceAgeDays?: number | null;
}

export interface ExactSizeResult {
  exact: boolean;
  reason?: string;
  databaseBytes?: number;
  tables?: StorageTable[];
}

export interface FetchOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_QUOTA_MB: number;
export const DEFAULT_ALERT_PCT: number;
export const DEFAULT_CRITICAL_PCT: number;

export function buildReport(input: BuildReportInput): { report: StorageReport; verdict: 'ok' | 'alert' | 'critical' };
export function readExactSize(options?: FetchOptions): Promise<ExactSizeResult>;
export function estimateTable(
  table: string,
  options?: FetchOptions,
): Promise<{ name: string; bytes: number; rows: number; sampled: number }>;
