import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvidersConfig } from '../lib/config/providers.config';

const netlifyConfig = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
const exampleEnv = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

describe('Netlify secrets scanning configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('excludes only noncredential configuration keys from value matching', () => {
    const omittedKeys = netlifyConfig.match(/SECRETS_SCAN_OMIT_KEYS\s*=\s*"([^"]+)"/)?.[1].split(',');

    expect(omittedKeys).toBeDefined();
    expect(omittedKeys).toContain('KODIK_BRIDGE_TIMEOUT_MS');
    expect(omittedKeys).toContain('MULTIPLAYER_BRIDGE_TIMEOUT_MS');
    for (const key of omittedKeys ?? []) {
      expect(key).toMatch(
        /^(?:ANIBOOM_ENABLED|ANISKIP_ENABLED|BRIDGE_HOST|DEMO_PROVIDER_ENABLED|KODIK_(?:API_BASE_URL|BRIDGE_TIMEOUT_MS|BRIDGE_URL|CACHE_FILE|CACHE_TTL_MS|ENABLED|EPISODE_SEARCH_LIMIT|TIMEOUT_MS)|MULTIPLAYER_BRIDGE_(?:TIMEOUT_MS|URL)|NEXT_PUBLIC_SITE_(?:NAME|URL)|PROVIDER_(?:CACHE_ENABLED|CACHE_WRITE|CACHE_WRITE_DEBOUNCE_MS|TIMEOUT_MS)|PUSH_CONTACT|SHIKIMORI_(?:ENABLED|USER_AGENT))$/,
      );
    }
    expect(netlifyConfig).not.toMatch(/SECRETS_SCAN_(?:ENABLED|OMIT_PATHS|SMART_DETECTION_ENABLED)\s*=/);
  });

  it('keeps example credentials empty', () => {
    const assignments = exampleEnv.split('\n').filter((line) => /^[A-Z_][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)=/.test(line));

    expect(assignments.length).toBeGreaterThan(0);
    for (const assignment of assignments) {
      expect(assignment.split('=').slice(1).join('=').trim()).toBe('');
    }
  });

  it('uses application defaults for empty example bridge timeouts', () => {
    for (const key of ['KODIK_BRIDGE_TIMEOUT_MS', 'MULTIPLAYER_BRIDGE_TIMEOUT_MS']) {
      expect(exampleEnv.split('\n')).toContain(`${key}=`);
      vi.stubEnv(key, undefined);
    }
    const defaults = getProvidersConfig();

    vi.stubEnv('KODIK_BRIDGE_TIMEOUT_MS', '');
    vi.stubEnv('MULTIPLAYER_BRIDGE_TIMEOUT_MS', '');
    const config = getProvidersConfig();

    expect(config.bridges.kodik.timeoutMs).toBe(defaults.bridges.kodik.timeoutMs);
    expect(config.bridges.multiplayer.timeoutMs).toBe(defaults.bridges.multiplayer.timeoutMs);
  });
});
