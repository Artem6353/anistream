/**
 * KV-адаптер кэша источников (ТЗ 2.1): если заданы UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN —
 * cache живёт в Upstash Redis (serverless-friendly, TTL 7 дней), иначе файловый кэш.
 */
const URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
export const kvEnabled = () => Boolean(URL && TOKEN);

async function cmd(body: unknown[], timeoutMs?: number): Promise<unknown> {
  const init: RequestInit = {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  if (timeoutMs) init.signal = AbortSignal.timeout(timeoutMs);
  const r = await fetch(`${URL}/`, init);
  if (!r.ok) throw new Error(`Upstash request failed with HTTP ${r.status}`);
  const j = (await r.json()) as { result?: unknown; error?: string };
  if (j.error) throw new Error('Upstash command failed');
  return j.result;
}

/** A failed GET throws so callers can distinguish a missing key from a broken connection. */
export async function kvGet(key: string): Promise<string | null> {
  const value = await cmd(['GET', key]);
  return typeof value === 'string' ? value : value == null ? null : String(value);
}

export async function kvSet(key: string, value: string, ttlSeconds = 7 * 86400): Promise<void> {
  try {
    await cmd(['SET', key, value, 'EX', ttlSeconds]);
  } catch {}
}

export async function kvDel(key: string): Promise<void> {
  try {
    await cmd(['DEL', key]);
  } catch {}
}

/** Read-only connectivity probe for the health endpoint; never changes Redis data. */
export async function kvPing(): Promise<boolean> {
  if (!kvEnabled()) return false;
  try {
    return (await cmd(['PING'], 1500)) === 'PONG';
  } catch {
    return false;
  }
}
