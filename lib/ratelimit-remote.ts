/**
 * Распределённый rate-limit через Upstash REST (аудит 2026-11-12).
 *
 * Зачем: in-memory бакеты (lib/rateLimit.ts, proxy.ts) живут в одном изоляте —
 * на serverless каждый холодный старт обнуляет лимит, и брутфорс /api/admin/login
 * не останавливается. Upstash уже используется под кэш провайдеров, поэтому
 * отдельный SDK не нужен: package-lock не трогаем, только fetch.
 *
 * Возвращает null, если Upstash не настроен/недоступен — вызывающий остаётся
 * на локальном фолбэке (fail-open к существующему поведению, не к отсутствию лимита).
 */
const URL_ = process.env.UPSTASH_REDIS_REST_URL ?? '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

export async function remoteRateLimit(key: string, limit: number, windowSec = 60): Promise<boolean | null> {
  if (!URL_ || !TOKEN) return null;
  try {
    const r = await fetch(`${URL_}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', `rl:${key}`],
        ['EXPIRE', `rl:${key}`, String(windowSec), 'NX'],
      ]),
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ result?: number }>;
    const n = Number(rows?.[0]?.result);
    return Number.isFinite(n) ? n <= limit : null;
  } catch {
    return null;
  }
}
