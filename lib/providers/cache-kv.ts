/**
 * KV-адаптер кэша источников (ТЗ 2.1): если заданы UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN —
 * cache живёт в Upstash Redis (serverless-friendly, TTL 7 дней), иначе файловый кэш.
 *
 * Задача 4 аудита: Redis здесь — ТОЛЬКО горячий кэш, а не хранилище сида.
 * У подключённой базы отдельный db_memory_threshold=64 MiB (LIMITS.md), а весь
 * providers-resolve-cache.json в компактном виде — 37,9 МБ на 79 426 ключей:
 * один сид оставил бы от порога меньше половины и съел бы треть месячных 500k команд.
 * Поэтому: обязательный TTL на каждую запись и потолок размера значения.
 */
const URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
export const kvEnabled = () => Boolean(URL && TOKEN);

/** Потолок размера одного значения: озвучки тайтла в среднем занимают ~500 Б,
 *  64 КБ — это уже аномалия (сотни источников у одной серии). */
const MAX_VALUE_BYTES = Number(process.env.UPSTASH_MAX_VALUE_BYTES ?? 65_536);

/** TTL по умолчанию 24 ч (KODIK_CACHE_TTL_MS в config = 86 400 000 мс). */
const DEFAULT_TTL_SECONDS = 86_400;

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

/**
 * Bounded multi-key read for episode indexes. Every returned item corresponds
 * to the key at the same position; missing keys are null and transport failures throw.
 */
export async function kvMget(keys: string[]): Promise<(string | null)[]> {
  if (!keys.length) return [];
  const value = await cmd(['MGET', ...keys]);
  if (!Array.isArray(value) || value.length !== keys.length) {
    throw new Error('Upstash MGET returned an unexpected result shape.');
  }
  return value.map((item) => item == null ? null : typeof item === 'string' ? item : String(item));
}

export async function kvSet(key: string, value: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
  /* TTL обязателен: запись без срока осталась бы в базе навсегда и постепенно
     съела бы db_memory_threshold. Неположительный TTL нормализуем к 24 ч. */
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.round(ttlSeconds) : DEFAULT_TTL_SECONDS;
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > MAX_VALUE_BYTES) return; // защита от переполнения: аномально большое значение не кэшируем
  try {
    await cmd(['SET', key, value, 'EX', ttl]);
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
