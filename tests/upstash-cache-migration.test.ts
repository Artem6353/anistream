import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const scriptPath = path.resolve(process.cwd(), 'scripts/migrate-provider-cache-to-upstash.mjs');
let tempDir = '';
let server: ReturnType<typeof createServer> | null = null;

const source = (providerId: string, embedUrl: string) => ({
  id: providerId + ':episode:1',
  label: providerId,
  providerId,
  providerName: providerId,
  kind: 'embed',
  embedUrl,
});

const cacheEntry = (sources: unknown[], ttlMs = 3_600_000, at = Date.now()) => ({
  at,
  ttlMs,
  sources: {
    sources,
    sourcesUsed: [...new Set(sources.map((item) => (item as { providerId?: string }).providerId).filter(Boolean))],
    fromCache: false,
  },
});

function writeCache(value: unknown) {
  const file = path.join(tempDir, 'providers-resolve-cache.json');
  writeFileSync(file, JSON.stringify(value), 'utf8');
  return file;
}

function runCli(args: string[], extraEnv: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function startFakeUpstash(redis: Map<string, string>) {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      try {
        const commands = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown[][];
        const results = commands.map((command) => {
          const [name, ...args] = command;
          if (String(name).toUpperCase() === 'MGET') {
            return { result: args.map((key) => redis.get(String(key)) ?? null) };
          }
          if (String(name).toUpperCase() === 'SET') {
            const key = String(args[0]);
            const value = String(args[1]);
            if (String(args[2]).toUpperCase() !== 'EX' || !Number.isSafeInteger(Number(args[3])) || Number(args[3]) < 1) {
              return { error: 'invalid test TTL' };
            }
            redis.set(key, value);
            return { result: 'OK' };
          }
          return { error: 'unsupported test command' };
        });
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(results));
      } catch {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'invalid request' }));
      }
    });
  });

  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fake Redis did not bind to a TCP port.');
  return 'http://127.0.0.1:' + address.port;
}

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'aninova-upstash-migration-'));
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    server = null;
  }
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('safe Upstash cache migration CLI', () => {
  it('defaults to read-only dry-run and skips expired or non-direct entries', async () => {
    const now = Date.now();
    const file = writeCache({
      'ep:series:1': cacheEntry([source('kodik', 'https://kodik.example/episode/1')], 3_600_000, now),
      'ep:series:2': cacheEntry([source('demo', 'https://demo.example/video')], 3_600_000, now),
      'ep:series:3': cacheEntry([source('kodik', 'https://kodik.example/old')], 1000, now - 10_000),
    });
    const before = readFileSync(file, 'utf8');
    const progress = path.join(tempDir, 'progress.json');

    const result = await runCli(['--file', file, '--progress-file', progress]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Mode: DRY RUN (read-only)');
    expect(result.stdout).toContain('Eligible fresh episode entries: 1');
    expect(result.stdout).toContain('Direct sources in eligible entries: 1');
    expect(result.stdout).toContain('No Redis commands were sent');
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(existsSync(progress)).toBe(false);
  });

  it('merges provider+URL identities and episode indexes using resumable batched writes', async () => {
    const now = Date.now();
    const sharedUrl = 'https://player.example/episode/1';
    const file = writeCache({
      'ep:series:1': cacheEntry([source('kodik', sharedUrl)], 3_600_000, now),
      'ep:series:2': cacheEntry([source('kodik', 'https://kodik.example/episode/2')], 3_600_000, now),
    });
    const redis = new Map<string, string>();
    redis.set('ep:ep:series:1', JSON.stringify(cacheEntry([source('cvh', sharedUrl)], 3_600_000, now)));
    redis.set('epidx:series', JSON.stringify([1]));
    const endpoint = await startFakeUpstash(redis);
    const progressFile = path.join(tempDir, 'progress.json');
    const token = 'test-token-that-must-never-be-printed';

    const result = await runCli(
      ['--file', file, '--progress-file', progressFile, '--apply', '--batch-size', '10', '--max-commands', '100'],
      { UPSTASH_REDIS_REST_URL: endpoint, UPSTASH_REDIS_REST_TOKEN: token },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Migration complete');
    expect(result.stdout).toContain('New sources merged this run: 2');
    expect(result.stdout).not.toContain(token);

    const first = JSON.parse(redis.get('ep:ep:series:1') || '{}');
    expect(new Set(first.sources.sources.map((item: { providerId: string }) => item.providerId))).toEqual(new Set(['cvh', 'kodik']));
    expect(JSON.parse(redis.get('ep:ep:series:2') || '{}').sources.sources[0].providerId).toBe('kodik');
    expect(JSON.parse(redis.get('epidx:series') || '[]')).toEqual([1, 2]);
    expect(JSON.parse(readFileSync(progressFile, 'utf8')).nextIndex).toBe(2);

    const secondRun = await runCli(
      ['--file', file, '--progress-file', progressFile, '--apply', '--batch-size', '10', '--max-commands', '100'],
      { UPSTASH_REDIS_REST_URL: endpoint, UPSTASH_REDIS_REST_TOKEN: token },
    );
    expect(secondRun.code).toBe(0);
    expect(secondRun.stdout).toContain('checkpoint is already complete');
    expect(secondRun.stdout).not.toContain(token);
  });

  it('rejects a command budget too small for one worst-case batch before contacting Redis', async () => {
    const now = Date.now();
    const file = writeCache({
      'ep:series:1': cacheEntry([source('kodik', 'https://kodik.example/episode/1')], 3_600_000, now),
    });

    const result = await runCli([
      '--file', file,
      '--progress-file', path.join(tempDir, 'progress.json'),
      '--apply',
      '--batch-size', '10',
      '--max-commands', '10',
    ], {
      UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:1',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('--max-commands must be at least');
    expect(result.stderr).not.toContain('test-token');
  });
});
