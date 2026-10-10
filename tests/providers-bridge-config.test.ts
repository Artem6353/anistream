import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvidersConfig } from '../lib/config/providers.config';

describe('bridge URL configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses localhost bridge defaults during local development', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('KODIK_BRIDGE_URL', undefined);
    vi.stubEnv('KODIK_BRIDGE_PORT', undefined);
    vi.stubEnv('MULTIPLAYER_BRIDGE_URL', undefined);
    vi.stubEnv('MULTIPLAYER_BRIDGE_PORT', undefined);

    const config = getProvidersConfig();
    expect(config.bridges.kodik.url).toBe('http://127.0.0.1:8765');
    expect(config.bridges.multiplayer.url).toBe('http://127.0.0.1:8766');
  });

  it('does not treat serverless localhost as a reachable bridge', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('KODIK_BRIDGE_URL', '');
    vi.stubEnv('MULTIPLAYER_BRIDGE_URL', '');

    const config = getProvidersConfig();
    expect(config.bridges.kodik.url).toBe('');
    expect(config.bridges.multiplayer.url).toBe('');
  });

  it('rejects explicit loopback URLs on Vercel but accepts remote bridge URLs', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('KODIK_BRIDGE_URL', 'http://127.0.0.1:8765');
    vi.stubEnv('MULTIPLAYER_BRIDGE_URL', 'https://bridge.example.test');

    const config = getProvidersConfig();
    expect(config.bridges.kodik.url).toBe('');
    expect(config.bridges.multiplayer.url).toBe('https://bridge.example.test');
  });
});
