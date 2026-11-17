import { describe, expect, it, vi, afterEach } from 'vitest';
import { rateLimit, LIMITS } from '@/lib/rateLimit';
import { clientIp } from '@/lib/ip';

/**
 * Аудит 30.09: тесты на исправленное — rate-limit (лимит/сброс окна/правила)
 * и clientIp (последний доверенный элемент XFF вместо подделываемого первого).
 */

afterEach(() => {
  vi.useRealTimers();
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

describe('clientIp (XFF-подделка закрыта, аудит P2-10)', () => {
  const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) }) as Request;

  it('берёт ПОСЛЕДНИЙ элемент x-forwarded-for (его дописывает доверенный прокси)', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('5.6.7.8');
  });

  it('подделанный первый элемент игнорируется', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'spoofed, real-client-ip' }))).toBe('real-client-ip');
  });

  it('подделанный x-real-ip НЕ перебивает x-forwarded-for (обход всех лимитов закрыт)', () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('1.1.1.1');
  });

  it('x-vercel-forwarded-for (ставит платформа) приоритетнее прочих', () => {
    expect(
      clientIp(req({ 'x-vercel-forwarded-for': '7.7.7.7', 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' })),
    ).toBe('7.7.7.7');
  });

  it('cf-connecting-ip (Cloudflare) приоритетнее XFF', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' }))).toBe('8.8.8.8');
  });

  it('x-real-ip используется только без XFF (конфигурация «один прокси»)', () => {
    expect(clientIp(req({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
  });

  it('без заголовков — local', () => {
    expect(clientIp(req({}))).toBe('local');
  });
});
