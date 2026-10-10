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

  it('uses the known production host instead of a loopback site URL on Vercel', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'aninova-catalog.vercel.app');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');

    const config = getProvidersConfig();
    expect(config.site.url).toBe('https://aninova-catalog.vercel.app');
  });

  it('uses the known production host when the configured site URL is invalid', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'aninova-catalog.vercel.app');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'not a URL');

    const config = getProvidersConfig();
    expect(config.site.url).toBe('https://aninova-catalog.vercel.app');
  });

  it('falls back to AniNova when the site name is empty or whitespace', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_NAME', '   ');

    const config = getProvidersConfig();
    expect(config.site.name).toBe('AniNova');
  });
});
