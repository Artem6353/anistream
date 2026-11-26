#!/usr/bin/env node
/**
 * B3-C saved-artifact dry-run. Reads only committed local JSON artifacts,
 * normalizes them and writes a deterministic import report. It never opens a
 * database connection, never downloads source data and never applies SQL.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPORT = path.join(ROOT, 'docs/data/aninova3-b3c-dry-run-report.json');
const DEFAULT_CHECKSUMS = path.join(ROOT, 'docs/data/aninova3-b3c-source-checksums.json');

function fail(message) {
  console.error(`comics:b3c:dry-run: ${message}`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const options = { out: DEFAULT_REPORT, checksums: DEFAULT_CHECKSUMS, canarySize: 20, now: null };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/comics-b3c-dry-run.mjs [--out=FILE] [--checksums=FILE] [--canary-size=10..50] [--now=ISO]');
      console.log('Writes a compact audit report (plan summaries + work ids), never a full SQL plan.');
      process.exit(0);
    }
    if (arg === '--apply' || arg === '--execute' || arg.startsWith('--mode=') || arg === '--mode') {
      throw new Error('only dry-run mode is supported; --apply/--execute/--mode are refused');
    }
    if (arg.startsWith('--out=')) options.out = path.resolve(ROOT, arg.slice('--out='.length));
    else if (arg.startsWith('--checksums=')) options.checksums = path.resolve(ROOT, arg.slice('--checksums='.length));
    else if (arg.startsWith('--canary-size=')) {
      const value = Number(arg.slice('--canary-size='.length));
      if (!Number.isInteger(value) || value < 10 || value > 50) throw new Error('--canary-size must be an integer from 10 to 50');
      options.canarySize = value;
    } else if (arg.startsWith('--now=')) {
      const value = arg.slice('--now='.length);
      if (Number.isNaN(Date.parse(value))) throw new Error('--now must be an ISO timestamp');
      options.now = new Date(value).toISOString();
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}

function planSummary(plan) {
  const operationCounts = {};
  for (const operation of plan.operations) {
    const table = (operationCounts[operation.table] ??= { INSERT: 0, UPDATE: 0, SKIP: 0, REJECT: 0 });
    table[operation.op] += 1;
  }
  return {
    schema_version: plan.schema_version,
    plan_hash: plan.planHash,
    generated_at: plan.generatedAt,
    work_ids: plan.workIds,
    operation_counts: operationCounts,
    entity_counts: {
      works: plan.works.length,
      source_observations: plan.sourceObservations.length,
      external_ids: plan.externalIds.length,
      aliases: plan.aliases.length,
      people: plan.people.length,
      credits: plan.credits.length,
      adaptations: plan.adaptations.length,
      relations: plan.relations.length,
      review_queue: plan.reviewQueue.length,
      reading_sources: plan.readingSources.length,
      chapters: plan.chapters.length,
      rights: plan.rights.length,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const server = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const mod = await server.ssrLoadModule('/lib/aninova3/comics/import/dry-run.ts');
    const report = mod.runDryRun({
      repoRoot: ROOT,
      now: options.now ?? new Date().toISOString(),
      canarySize: options.canarySize,
    });
    const compactReport = {
      ...report,
      plan: planSummary(report.plan),
      canary: planSummary(report.canary),
    };
    writeAtomic(options.out, `${JSON.stringify(compactReport, null, 2)}\n`);
    writeAtomic(options.checksums, `${JSON.stringify({
      generated_at: report.generated_at,
      plan_hash: report.planHash,
      canary_hash: report.canaryHash,
      sources: report.sourceReview,
      checksums: report.checksums,
    }, null, 2)}\n`);
    console.log('B3C_DRY_RUN_OK');
    console.log(JSON.stringify({
      planHash: report.planHash,
      canaryHash: report.canaryHash,
      counts: report.counts,
      errors: report.errors.length,
      warnings: report.warnings.length,
      report: path.relative(ROOT, options.out),
      checksums: path.relative(ROOT, options.checksums),
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