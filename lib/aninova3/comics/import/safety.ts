/**
 * B3-B is dry-run-only. The planner never opens a database connection. These
 * guards exist for any future apply path and for tests: remote/Supabase targets
 * are rejected before a connection string can reach a client.
 */

export { stableUuid } from './canonical';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REMOTE_MARKERS = [
  'supabase.co',
  'supabase.in',
  'pooler.supabase.com',
  'amazonaws.com',
  'neon.tech',
  'render.com',
  'railway.app',
  'azure.com',
];

export function assertLocalDatabaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('B3-B refuses an invalid database URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('B3-B accepts only postgres/postgresql URLs');
  }
  const host = url.hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`B3-B refuses non-local database host: ${host}`);
  }
  const lower = value.toLowerCase();
  if (REMOTE_MARKERS.some((marker) => lower.includes(marker))) {
    throw new Error('B3-B refuses a remote/Supabase database URL');
  }
  for (const key of ['host', 'hostaddr']) {
    if (url.searchParams.has(key)) {
      throw new Error(`B3-B refuses a database URL that overrides ${key}`);
    }
  }
  return url;
}

export function assertNoRemoteDatabaseEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of ['SUPABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'POSTGRES_URL']) {
    const value = env[key];
    if (value && /supabase\.(co|in)|amazonaws\.com|neon\.tech|render\.com|railway\.app/i.test(value)) {
      throw new Error(`B3-B refuses to run with remote database environment ${key}`);
    }
  }
}

export function assertApplyMode(mode: string): void {
  if (mode !== 'dry-run') {
    throw new Error('B3-B repository script is dry-run-only; apply is available only in disposable PGlite tests');
  }
}

export function redactDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) url.password = '[redacted]';
    return url.toString();
  } catch {
    return '[invalid-url]';
  }
}
