import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Мост сессий: cookie-сессия Supabase должна быть видна legacy-слою (lib/sync.ts),
 * но токены НЕ должны попадать в localStorage.
 *
 * Регрессия здесь означает либо «вошёл, но интерфейс считает гостем», либо
 * утечку access/refresh-токенов в хранилище, читаемое любым XSS.
 */

const store = new Map<string, string>();

vi.stubGlobal('window', globalThis);
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
});

const { clearLegacySession, legacySessionActive, mirrorSessionToLegacy } = await import('../lib/auth/session-bridge');
const { getToken, isSessionValid, setMirroredSession } = await import('../lib/sync');

const session = {
  access_token: 'access-abc',
  refresh_token: 'refresh-xyz',
  expires_in: 3600,
};

beforeEach(() => {
  store.clear();
  setMirroredSession(null);
});

afterEach(() => {
  clearLegacySession();
});

describe('mirrorSessionToLegacy', () => {
  it('делает сессию видимой для legacy-слоя', () => {
    mirrorSessionToLegacy(session);
    expect(getToken()).toBe('access-abc');
    expect(isSessionValid()).toBe(true);
    expect(legacySessionActive()).toBe(true);
  });

  it('не пишет токены в localStorage', () => {
    mirrorSessionToLegacy(session);
    expect(store.size).toBe(0);
  });

  it('стирает старые копии токенов, оставшиеся от модалки входа', () => {
    store.set('anistream:supa_token', 'old-access');
    store.set('anistream:supa_refresh', 'old-refresh');
    store.set('anistream:supa_expires', String(Date.now() + 60_000));
    mirrorSessionToLegacy(session);
    expect(store.has('anistream:supa_token')).toBe(false);
    expect(store.has('anistream:supa_refresh')).toBe(false);
    expect(getToken()).toBe('access-abc');
  });

  it('null и пустая сессия означают выход', () => {
    mirrorSessionToLegacy(session);
    mirrorSessionToLegacy(null);
    expect(getToken()).toBeNull();
    expect(isSessionValid()).toBe(false);
  });

  it('просроченная сессия не считается валидной', () => {
    mirrorSessionToLegacy({ access_token: 'a', expires_at: Math.floor(Date.now() / 1000) - 10 });
    expect(isSessionValid()).toBe(false);
  });

  it('сессия без срока считается валидной (401 добьёт refresh)', () => {
    mirrorSessionToLegacy({ access_token: 'a' });
    expect(isSessionValid()).toBe(true);
  });
});

describe('clearLegacySession', () => {
  it('гасит и память, и диск', () => {
    mirrorSessionToLegacy(session);
    store.set('anistream:supa_token', 'legacy');
    clearLegacySession();
    expect(getToken()).toBeNull();
    expect(store.size).toBe(0);
  });
});

describe('legacy-совместимость', () => {
  it('старый вход через localStorage продолжает работать', () => {
    store.set('anistream:supa_token', 'legacy-token');
    expect(getToken()).toBe('legacy-token');
    expect(isSessionValid()).toBe(true);
  });

  it('память приоритетнее старых ключей', () => {
    store.set('anistream:supa_token', 'legacy-token');
    mirrorSessionToLegacy(session);
    expect(getToken()).toBe('access-abc');
  });
});
