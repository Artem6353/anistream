/** Per-IP rate-limit для API (A3.2). In-memory per instance; на serverless — приближённо. */
const BUCKETS = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || b.reset < now) {
    BUCKETS.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export const LIMITS: { prefix: string; limit: number }[] = [
  { prefix: '/api/search', limit: 30 },
  { prefix: '/api/providers', limit: 60 },
  // Реакции на отзывы: специфичное правило ДО общего.
  // Иначе клики по лайкам/дизлайкам упираются в общий лимит 10/мин слишком быстро.
  { prefix: '/api/social/reviews/', limit: 30 },
  { prefix: '/api/social/reviews', limit: 30 },
  { prefix: '/api/reco', limit: 30 },
  { prefix: '/api/availability', limit: 60 },
];