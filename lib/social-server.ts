import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Серверный слой социалки: stateless-капча (HMAC) + rate-limit по IP (W3).
 * Без внешних сервисов; при заданных SUPABASE-ключах отзывы пишутся в общую базу.
 *
 * Аудит 30.09 (P0-3):
 *  - секрет капчи — ОТДЕЛЬНЫЙ CAPTCHA_SECRET (ADMIN_TOKEN как фолбэк сохранён для
 *    совместимости, но больше не единственная опция: ротация админ-токена не ломает капчу);
 *  - в production без секрета капча fail-closed: verifyCaptcha всегда false —
 *    хардкод-фолбэк 'anistream-captcha-secret' из репозитория позволял подделывать
 *    токены оффлайн. В dev/test фолбэк оставлен, чтобы локальная разработка не вставала;
 *  - энтропия ответа повышена: сумма была 3…19 (~17 вариантов, тривиальный перебор),
 *    теперь 11…108 (~98 вариантов) — вместе с rate-limit перебор нерентабелен.
 */
const RATE = new Map<string, { count: number; reset: number }>();
/* Карта не должна расти неограниченно (подмена IP-ключа) — чистка истёкших. */
const MAX_RATE_ENTRIES = 20_000;
let sinceSweep = 0;

function secret(): string {
  const s = process.env.CAPTCHA_SECRET || process.env.ADMIN_TOKEN || '';
  if (s) return s;
  return process.env.NODE_ENV === 'production' ? '' : 'anistream-captcha-secret';
}

export function captchaAvailable(): boolean {
  return Boolean(secret());
}

export function makeCaptcha(): { question: string; token: string; answer: number } {
  const a = 10 + Math.floor(Math.random() * 90); // 10..99
  const b = 1 + Math.floor(Math.random() * 9); // 1..9
  const answer = a + b;
  const exp = Date.now() + 10 * 60_000;
  const token = createHmac('sha256', secret()).update(`${answer}|${exp}`).digest('hex') + '.' + exp;
  return { question: `Антиспам: сколько будет ${a} + ${b}?`, token, answer };
}

export function verifyCaptcha(token: string | undefined, answer: number | undefined): boolean {
  const sec = secret();
  if (!sec || !token || answer === undefined || !Number.isFinite(answer)) return false;
  const [sig, expStr] = token.split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expect = Buffer.from(createHmac('sha256', sec).update(`${answer}|${exp}`).digest('hex'));
  const got = Buffer.from(sig ?? '');
  return expect.length === got.length && timingSafeEqual(expect, got);
}

export function rateLimit(ip: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  if (++sinceSweep >= 1024) {
    sinceSweep = 0;
    for (const [key, e] of RATE) if (e.reset < now) RATE.delete(key);
  }
  const e = RATE.get(ip);
  if (!e || e.reset < now) {
    if (RATE.size >= MAX_RATE_ENTRIES) {
      for (const [key, x] of RATE) if (x.reset < now) RATE.delete(key);
    }
    RATE.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }
  e.count += 1;
  return e.count <= limit;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/* ---------- Верификация сессии Supabase (аудит 30.09, P0-1/P0-2) ---------- */

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

/** uid из Authorization: Bearer <access_token>, подтверждённый Supabase /auth/v1/user.
 *  Тело запроса как источник uid БОЛЬШЕ не принимается (подделка авторства). */
export async function verifiedUid(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !SUPA_URL || !SUPA_ANON) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_ANON, Authorization: auth },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const u = (await r.json()) as { id?: string };
    return typeof u?.id === 'string' && u.id ? u.id : null;
  } catch {
    return null;
  }
}

/** Подписки пользователя (service-ключ: таблица follows закрыта RLS для чужих). */
export async function followingOf(me: string): Promise<Set<string>> {
  if (!SUPA_SERVICE || !SUPA_URL) return new Set();
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/follows?follower_id=eq.${encodeURIComponent(me)}&select=following_id&limit=1000`,
      { headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}` }, cache: 'no-store' },
    );
    if (!r.ok) return new Set();
    const rows = (await r.json()) as Array<{ following_id: string }>;
    return new Set(rows.map((x) => x.following_id).filter(Boolean));
  } catch {
    return new Set();
  }
}
