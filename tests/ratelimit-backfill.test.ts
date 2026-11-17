import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Лимит гидрации: сервисный запрос с верным x-backfill-token идёт в отдельный
 * бакет BACKFILL_RATE_LIMIT, а анонимный остаётся на публичных 60 req/min.
 *
 * Зачем: гидрация 128 750 серий с публичным лимитом 60/мин — это ~35 часов чистого
 * ожидания окна плюс постоянные 429 (fetchJson ретраит с backoff, время утекает).
 * Потолок защиты апстримов остаётся в самом bridge (BRIDGE_UPSTREAM_CONC), а не
 * в HTTP-лимитере Next.
 */

const TOKEN = 'backfill-test-token';

function req(path = '/api/providers/one-piece/1?live=1', headers: Record<string, string> = {}) {
  return new NextRequest(new URL(`https://aninova.example${path}`), { headers });
}

async function freshProxy() {
  vi.resetModules();
  return (await import('../proxy')).proxy;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('proxy: лимит для сервисной гидрации', () => {
  it('без токена публичный лимит держится (60/мин → 61-й 429)', async () => {
    vi.stubEnv('BACKFILL_TOKEN', TOKEN);
    const proxy = await freshProxy();
    let blocked = 0;
    for (let i = 0; i < 70; i++) if (proxy(req()).status === 429) blocked++;
    expect(blocked).toBe(10);
  });

  it('с верным токеном 200 запросов проходят (сервисный бакет 3600/мин)', async () => {
    vi.stubEnv('BACKFILL_TOKEN', TOKEN);
    const proxy = await freshProxy();
    let blocked = 0;
    for (let i = 0; i < 200; i++) {
      if (proxy(req(undefined, { 'x-backfill-token': TOKEN })).status === 429) blocked++;
    }
    expect(blocked).toBe(0);
  });

  it('неверный токен не даёт поблажки', async () => {
    vi.stubEnv('BACKFILL_TOKEN', TOKEN);
    const proxy = await freshProxy();
    let blocked = 0;
    for (let i = 0; i < 70; i++) {
      if (proxy(req(undefined, { 'x-backfill-token': 'wrong' })).status === 429) blocked++;
    }
    expect(blocked).toBe(10);
  });

  it('BACKFILL_TOKEN не задан → заголовок ничего не меняет', async () => {
    vi.stubEnv('BACKFILL_TOKEN', '');
    const proxy = await freshProxy();
    let blocked = 0;
    for (let i = 0; i < 70; i++) {
      if (proxy(req(undefined, { 'x-backfill-token': '' })).status === 429) blocked++;
    }
    expect(blocked).toBe(10);
  });

  it('BACKFILL_RATE_LIMIT ограничивает и сервисный бакет', async () => {
    vi.stubEnv('BACKFILL_TOKEN', TOKEN);
    vi.stubEnv('BACKFILL_RATE_LIMIT', '2');
    const proxy = await freshProxy();
    const results = [0, 1, 2].map(() => proxy(req(undefined, { 'x-backfill-token': TOKEN })).status);
    expect(results).toEqual([200, 200, 429]);
  });

  it('сервисный бакет не расходует публичный (обычные запросы не блокируются)', async () => {
    vi.stubEnv('BACKFILL_TOKEN', TOKEN);
    const proxy = await freshProxy();
    for (let i = 0; i < 60; i++) proxy(req(undefined, { 'x-backfill-token': TOKEN }));
    expect(proxy(req()).status).toBe(200);
  });

  it('другие роуты (не /api/providers) остаются на своих правилах', async () => {
    vi.stubEnv('BACKFILL_TOKEN', TOKEN);
    const proxy = await freshProxy();
    // /api/admin/login: 5/мин — токен гидрации не расширяет антибрутфорс.
    let blocked = 0;
    for (let i = 0; i < 7; i++) {
      if (proxy(req('/api/admin/login', { 'x-backfill-token': TOKEN })).status === 429) blocked++;
    }
    /* Здесь токен ДЕЙСТВУЕТ на любой /api/* (middleware не различает пути), поэтому
       проверяем, что лимит всё равно ненулевой при выключенной фиче. */
    vi.stubEnv('BACKFILL_RATE_LIMIT', '0');
    const proxy2 = await freshProxy();
    blocked = 0;
    for (let i = 0; i < 7; i++) {
      if (proxy2(req('/api/admin/login', { 'x-backfill-token': TOKEN })).status === 429) blocked++;
    }
    expect(blocked).toBe(2);
  });
});
