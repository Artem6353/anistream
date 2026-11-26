#!/usr/bin/env node
/**
 * B3-D repeatable quality report.
 *
 * Reads committed source artifacts only, runs the existing deterministic B3-C
 * dry-run plan, projects it into read-only operations counters and writes one
 * JSON report. It never applies SQL, never opens a DB connection, never calls
 * external APIs and never writes catalog/review rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT, 'docs/data/aninova3-b3d-quality-report.json');
const REQUIRED_SOURCE_PATHS = [
  'lib/aninova3/comics/operations/dashboard.ts',
  'lib/aninova3/comics/operations/model.ts',
  'lib/aninova3/comics/operations/review.ts',
  'lib/aninova3/comics/operations/conflicts.ts',
  'lib/aninova3/comics/operations/relations.ts',
  'lib/aninova3/comics/operations/report.ts',
  'lib/aninova3/comics/operations/from-plan.ts',
  'lib/aninova3/comics/operations/repository.ts',
  'scripts/comics-b3d-report.mjs',
];

function fail(message) {
  console.error(`comics:b3d:report: ${message}`);
  process.exitCode = 2;
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * The report must name the code that produced it, not the commit that later
 * stores the JSON. Resolve the supplied SHA, prove every B3-D module exists
 * in that tree, and refuse to generate from a dirty copy of those modules.
 */
function resolveSourceCommit(sha) {
  let resolved;
  try {
    resolved = git(['rev-parse', '--verify', `${sha}^{commit}`]);
  } catch {
    throw new Error(`--commit is not a local git commit: ${sha}`);
  }
  const tree = new Set(git(['ls-tree', '-r', '--name-only', resolved]).split(/\r?\n/).filter(Boolean));
  const missing = REQUIRED_SOURCE_PATHS.filter((file) => !tree.has(file));
  if (missing.length > 0) {
    throw new Error(`--commit ${resolved} is missing B3-D source files: ${missing.join(', ')}`);
  }
  try {
    git(['diff', '--quiet', resolved, '--', ...REQUIRED_SOURCE_PATHS]);
  } catch {
    throw new Error(`working tree B3-D source differs from --commit ${resolved}; commit the generator/code first`);
  }
  return resolved;
}

function parseArgs(argv) {
  const options = { out: DEFAULT_OUT, previous: null, now: null, commit: null };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/comics-b3d-report.mjs --commit=SHA [--out=FILE] [--previous=FILE] [--now=ISO]');
      console.log('The SHA is the committed source version that must be present in the working tree; it is not the report commit.');
      console.log('Read-only: builds counters from the deterministic B3-C dry-run plan. --apply/--execute are refused.');
      process.exit(0);
    }
    if (arg === '--apply' || arg === '--execute' || arg.startsWith('--mode') || arg === '--write-db') {
      throw new Error('only local report generation is supported; write/apply flags are refused');
    }
    if (arg.startsWith('--out=')) options.out = path.resolve(ROOT, arg.slice('--out='.length));
    else if (arg.startsWith('--previous=')) options.previous = path.resolve(ROOT, arg.slice('--previous='.length));
    else if (arg.startsWith('--now=')) {
      const value = arg.slice('--now='.length);
      if (Number.isNaN(Date.parse(value))) throw new Error('--now must be an ISO timestamp');
      options.now = new Date(value).toISOString();
    } else if (arg.startsWith('--commit=')) {
      const value = arg.slice('--commit='.length).trim();
      if (!/^[a-f0-9]{7,40}$/i.test(value)) throw new Error('--commit must be a 7..40 char hex SHA');
      options.commit = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!options.commit) throw new Error('--commit=<SHA> is required so the report cannot inherit an unrelated branch SHA');
  options.commit = resolveSourceCommit(options.commit);
  return options;
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}

function readPrevious(file) {
  if (!file) return null;
  if (!fs.existsSync(file)) throw new Error(`previous report not found: ${path.relative(ROOT, file)}`);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !parsed.review_queue || typeof parsed.generated_at !== 'string') {
    throw new Error('previous report does not look like a B3-D quality report');
  }
  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const previous = readPrevious(options.previous);
  const server = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const dryRunModule = await server.ssrLoadModule('/lib/aninova3/comics/import/dry-run.ts');
    const planModule = await server.ssrLoadModule('/lib/aninova3/comics/operations/from-plan.ts');
    const reportModule = await server.ssrLoadModule('/lib/aninova3/comics/operations/report.ts');
    const dryRun = dryRunModule.runDryRun({
      repoRoot: ROOT,
      now: options.now ?? new Date().toISOString(),
      canarySize: 20,
    });
    const snapshot = planModule.buildSnapshotFromPlan(dryRun);
    const inputChecksums = {
      ...dryRun.checksums,
      plan_hash: dryRun.planHash,
      source_observations: String(snapshot.counts.source_observations),
    };
    const report = reportModule.buildQualityReport({
      snapshot,
      previous,
      generatedAt: dryRun.generated_at,
      sourceCodeCommitSha: options.commit,
      inputChecksums,
      warnings: dryRun.warnings,
      errors: dryRun.errors,
    });
    writeAtomic(options.out, reportModule.reportFileContent(report));
    console.log('B3D_REPORT_OK');
    console.log(JSON.stringify({
      report: path.relative(ROOT, options.out),
      generated_at: report.generated_at,
      source_code_commit_sha: report.source_code_commit_sha,
      report_checksum: report.report_checksum,
      works: report.dashboard.metadata.works_total,
      review_items: report.review_queue.total,
      source_conflict_works: report.dashboard.quality.source_conflict_works,
      contradictory_anime_ids: report.relations.contradictory_anime_ids,
      public_works: report.publication.public_works,
      publishable_works: report.publication.publishable_works,
      comparison: report.comparison.available,
      errors: report.errors.length,
      warnings: report.warnings.length,
    }, null, 2));
    if (report.errors.length > 0) process.exitCode = 1;
  } finally {
    await server.close();
  }
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
