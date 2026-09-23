import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Серверный слой социалки: stateless-капча (HMAC) + rate-limit по IP (W3).
 * Без внешних сервисов; при заданных SUPABASE-ключах отзывы пишутся в общую базу.
 */
const RATE = new Map<string, { count: number; reset: number }>();

function secret(): string {
  return process.env.ADMIN_TOKEN ?? 'anistream-captcha-secret';
}

export function makeCaptcha(): { question: string; token: string; answer: number } {
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 1 + Math.floor(Math.random() * 9);
  const answer = a + b;
  const exp = Date.now() + 10 * 60_000;
  const token = createHmac('sha256', secret()).update(`${answer}|${exp}`).digest('hex') + '.' + exp;
  return { question: `Антиспам: сколько будет ${a} + ${b}?`, token, answer };
}

export function verifyCaptcha(token: string | undefined, answer: number | undefined): boolean {
  if (!token || answer === undefined || !Number.isFinite(answer)) return false;
  const [sig, expStr] = token.split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expect = Buffer.from(createHmac('sha256', secret()).update(`${answer}|${exp}`).digest('hex'));
  const got = Buffer.from(sig ?? '');
  return expect.length === got.length && timingSafeEqual(expect, got);
}

export function rateLimit(ip: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const e = RATE.get(ip);
  if (!e || e.reset < now) {
    RATE.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }
  e.count += 1;
  return e.count <= limit;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
