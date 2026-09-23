/**
 * KV-адаптер кэша источников (ТЗ 2.1): если заданы UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN —
 * cache живёт в Upstash Redis (serverless-friendly, TTL 7 дней), иначе файловый кэш.
 */
const URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
export const kvEnabled = () => Boolean(URL && TOKEN);

async function cmd(body: unknown[]): Promise<unknown> {
  const r = await fetch(`${URL}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as { result?: unknown };
  return j.result;
}

export async function kvGet(key: string): Promise<string | null> {
  try {
    return (await cmd(['GET', key])) as string | null;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string, ttlSeconds = 7 * 86400): Promise<void> {
  try {
    await cmd(['SET', key, value, 'EX', ttlSeconds]);
  } catch {}
}
