/** Per-IP rate-limit для API (A3.2). In-memory per instance; на serverless — приближённо. */
const BUCKETS = new Map<string, { count: number; reset: number }>();
/* Аудит 30.09 (P1-6): карта росла неограниченно (подмена XFF → бесконечные ключи) —
   периодическая чистка истёкших бакетов + жёсткая граница размера. */
const MAX_BUCKETS = 20_000;
let sinceSweep = 0;

function sweep(now: number) {
  for (const [key, b] of BUCKETS) {
    if (b.reset < now) BUCKETS.delete(key);
  }
}

export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (++sinceSweep >= 1024) {
    sinceSweep = 0;
    sweep(now);
  }
  const b = BUCKETS.get(key);
  if (!b || b.reset < now) {
    if (BUCKETS.size >= MAX_BUCKETS) sweep(now);
    BUCKETS.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export const LIMITS: { prefix: string; limit: number }[] = [
  /* Аудит 30.09 (P0-4): admin-login без лимита брутфорсился; специфичные правила
     ДО общих (find() берёт первое совпадение по startsWith). */
  { prefix: '/api/admin/login', limit: 5 },
  { prefix: '/api/admin', limit: 60 },
  { prefix: '/api/search', limit: 30 },
  { prefix: '/api/providers', limit: 60 },
  // Реакции на отзывы: специфичное правило ДО общего.
  // Иначе клики по лайкам/дизлайкам упираются в общий лимит 10/мин слишком быстро.
  { prefix: '/api/social/reviews/', limit: 30 },
  { prefix: '/api/social/reviews', limit: 30 },
  { prefix: '/api/reco', limit: 30 },
  { prefix: '/api/availability', limit: 60 },
  // Аудит P1-2: writable и тяжёлые роуты, ранее без лимитов
  { prefix: '/api/push', limit: 10 },
  { prefix: '/api/social/captcha', limit: 20 },
  { prefix: '/api/social/feed', limit: 30 },
  { prefix: '/api/social/taste', limit: 30 },
  { prefix: '/api/report', limit: 10 },
  { prefix: '/api/dmca', limit: 10 },
  { prefix: '/api/quiz', limit: 20 },
];