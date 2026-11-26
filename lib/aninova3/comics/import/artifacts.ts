import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './canonical';
import { B3C_ADAPTERS, normalizeArtifact } from './adapters';
import type {
  AdapterBatch,
  SourceAdapter,
  SourceReviewRecord,
  ValidationIssue,
} from './types';

export const ARTIFACT_PATHS = {
  graph: 'lib/aninova3/comics/source-graph.json',
  metadata: 'lib/aninova3/comics/metadata-verified.json',
  candidates: 'lib/aninova3/comics/metadata-candidates.json',
  queue: 'docs/data/aninova3-b1d-review-queue.json',
  titles: 'lib/data/titles.json',
} as const;

export interface LoadedArtifact {
  adapter: SourceAdapter;
  batch: AdapterBatch;
  checksum: string;
  path: string;
}

export interface LoadedArtifacts {
  graph: LoadedArtifact;
  metadata: LoadedArtifact;
  candidates: LoadedArtifact;
  queue: LoadedArtifact;
  checksums: Record<string, string>;
  source_review: SourceReviewRecord[];
  knownAnimeIds: Set<number>;
  issues: ValidationIssue[];
  warnings: string[];
  errors: string[];
}

function readText(repoRoot: string, relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function loadArtifact(
  repoRoot: string,
  adapter: SourceAdapter,
  now: string,
  checksums: Record<string, string>,
): LoadedArtifact {
  const relativePath = adapter.artifact_path;
  const text = readText(repoRoot, relativePath);
  const checksum = sha256(text);
  checksums[relativePath] = checksum;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const batch = normalizeArtifact(adapter, raw, {
    now,
    artifact_path: relativePath,
    artifact_checksum: checksum,
  });
  return { adapter, batch, checksum, path: relativePath };
}

export function loadArtifacts(repoRoot: string, now: string): LoadedArtifacts {
  const checksums: Record<string, string> = {};
  const graphAdapter = B3C_ADAPTERS.find((adapter) => adapter.source_name === 'anilist');
  const metadataAdapter = B3C_ADAPTERS.find((adapter) => adapter.source_name === 'shikimori');
  const candidatesAdapter = B3C_ADAPTERS.find((adapter) => adapter.source_name === 'shikimori_candidates');
  const queueAdapter = B3C_ADAPTERS.find((adapter) => adapter.source_name === 'b1d_review_queue');
  if (!graphAdapter || !metadataAdapter || !candidatesAdapter || !queueAdapter) {
    throw new Error('B3-C adapter registry is incomplete');
  }
  const graph = loadArtifact(repoRoot, graphAdapter, now, checksums);
  const metadata = loadArtifact(repoRoot, metadataAdapter, now, checksums);
  const candidates = loadArtifact(repoRoot, candidatesAdapter, now, checksums);
  const queue = loadArtifact(repoRoot, queueAdapter, now, checksums);

  const titlesText = readText(repoRoot, ARTIFACT_PATHS.titles);
  checksums[ARTIFACT_PATHS.titles] = sha256(titlesText);
  let titlesRaw: unknown;
  try {
    titlesRaw = JSON.parse(titlesText);
  } catch (error) {
    throw new Error(`titles.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(titlesRaw)) throw new Error('titles.json must be an array');
  const knownAnimeIds = new Set<number>();
  for (const item of titlesRaw) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as { anilistId?: unknown }).anilistId;
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) knownAnimeIds.add(id);
  }
  if (knownAnimeIds.size === 0) throw new Error('titles.json contains no usable AniList anime ids');

  const issues = [
    ...graph.batch.issues,
    ...metadata.batch.issues,
    ...candidates.batch.issues,
    ...queue.batch.issues,
  ];
  const warnings = issues.filter((item) => item.severity === 'warning').map((item) => item.message);
  const errors = issues.filter((item) => item.severity === 'error').map((item) => item.message);
  if (metadata.batch.metadata.declared_total !== null && metadata.batch.metadata.declared_total !== metadata.batch.records.length) {
    warnings.unshift(
      `metadata-verified.json meta.total=${metadata.batch.metadata.declared_total} but records=${metadata.batch.records.length}; the measured records count is authoritative`,
    );
  }
  if (graph.batch.metadata.declared_total !== null && graph.batch.metadata.declared_total !== graph.batch.records.length) {
    warnings.unshift(
      `source-graph.json meta.comicsKept=${graph.batch.metadata.declared_total} but comics=${graph.batch.records.length}`,
    );
  }
  const sourceReview: SourceReviewRecord[] = [
    reviewRecord(graph, graph.batch.records.length),
    reviewRecord(metadata, metadata.batch.records.length),
    reviewRecord(candidates, candidates.batch.records.length),
    reviewRecord(queue, queue.batch.review_hints.length),
  ];
  return {
    graph,
    metadata,
    candidates,
    queue,
    checksums,
    source_review: sourceReview,
    knownAnimeIds,
    issues,
    warnings,
    errors,
  };
}

function reviewRecord(artifact: LoadedArtifact, recordsRead: number): SourceReviewRecord {
  return {
    source_name: artifact.adapter.source_name,
    artifact_path: artifact.path,
    checksum: artifact.checksum,
    terms_review_status: 'unknown',
    attribution_requirements: [],
    records_read: recordsRead,
    meta_total: artifact.batch.metadata.declared_total,
  };
}
