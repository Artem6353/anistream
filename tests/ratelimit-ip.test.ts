import { describe, expect, it, vi, afterEach } from 'vitest';
import { rateLimit, LIMITS } from '@/lib/rateLimit';
import { clientIp } from '@/lib/ip';

/**
 * Аудит 30.09: тесты на исправленное — rate-limit (лимит/сброс окна/правила)
 * и clientIp (последний доверенный элемент XFF вместо подделываемого первого).
 */

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('rateLimit', () => {
  it('пропускает до лимита и блокирует сверх', () => {
    const key = `ip-test-${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60_000)).toBe(true);
    expect(rateLimit(key, 5, 60_000)).toBe(false);
  });

  it('сбрасывается после окна', () => {
    vi.useFakeTimers();
    const key = `ip-window-${Math.random().toString(36).slice(2)}`;
    expect(rateLimit(key, 1, 1000)).toBe(true);
    expect(rateLimit(key, 1, 1000)).toBe(false);
    vi.advanceTimersByTime(1100);
    expect(rateLimit(key, 1, 1000)).toBe(true);
  });

  it('LIMITS: admin-login ограничен жёстче общих admin-роутов и стоит раньше', () => {
    const login = LIMITS.find((r) => r.prefix === '/api/admin/login');
    const admin = LIMITS.find((r) => r.prefix === '/api/admin');
    expect(login?.limit).toBe(5);
    expect(admin).toBeDefined();
    expect(LIMITS.indexOf(login!)).toBeLessThan(LIMITS.indexOf(admin!));
  });
});

describe('clientIp (XFF-подделка закрыта)', () => {
  const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) }) as Request;

  it('берёт ПОСЛЕДНИЙ элемент x-forwarded-for (его дописывает доверенный прокси)', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('5.6.7.8');
  });

  it('подделанный первый элемент игнорируется', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'spoofed, real-client-ip' }))).toBe('real-client-ip');
  });

  /* Аудит 2026-11-12: x-real-ip доверяем только за доверенным прокси.
     Netlify его НЕ перезаписывает — клиент подделывал заголовок и обнулял лимиты. */
  it('x-real-ip БЕЗ доверенного прокси игнорируется (Netlify/прямой доступ)', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('TRUST_PROXY_HEADERS', '');
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('1.1.1.1');
  });

  it('x-real-ip приоритетнее XFF на Vercel (платформа перезаписывает заголовок)', () => {
    vi.stubEnv('VERCEL', '1');
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9');
  });

  it('TRUST_PROXY_HEADERS=1 включает доверие x-real-ip (self-hosted за Caddy)', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('TRUST_PROXY_HEADERS', '1');
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9');
  });

  it('без заголовков — local', () => {
    expect(clientIp(req({}))).toBe('local');
  });
});
