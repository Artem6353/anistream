import { describe, expect, it } from 'vitest';
import { configDiagnostics } from '../lib/env-diagnostics';

const base = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_KEY: 'service',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
  TURNSTILE_SECRET: 'secret',
  CAPTCHA_SECRET: 'captcha',
  ADMIN_TOKEN: 'token',
  NEXT_PUBLIC_SITE_URL: 'https://aninova-catalog.vercel.app',
  UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'tok',
  BACKFILL_TOKEN: 'backfill',
} as unknown as NodeJS.ProcessEnv;

describe('configDiagnostics', () => {
  it('полный конфиг: все флаги true, предупреждений нет', () => {
    const { flags, warnings } = configDiagnostics({ ...base });
    expect(warnings).toEqual([]);
    for (const [name, flag] of Object.entries(flags)) {
      expect(flag.present, name).toBe(true);
      expect(flag.effect.length).toBeGreaterThan(0);
    }
  });

  it('значения переменных не попадают в результат', () => {
    // Уникальные маркеры: health публичный, значения секретов утекать не должны.
    const markers = {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'marker-zw8q-anon',
      TURNSTILE_SECRET: 'marker-zw8q-turnstile',
      SUPABASE_SERVICE_KEY: 'marker-zw8q-service',
      BACKFILL_TOKEN: 'marker-zw8q-backfill',
    } as unknown as NodeJS.ProcessEnv;
    const serialized = JSON.stringify(configDiagnostics({ ...base, ...markers }));
    for (const value of Object.values(markers)) expect(serialized).not.toContain(value);
  });

  it('опечатки из инцидента 17.11 ловятся', () => {
    const env: NodeJS.ProcessEnv = { ...base };
    delete env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete env.TURNSTILE_SECRET;
    env.TURNSTILE_SITE_KEY = 'wrong-name';
    env.TURNSTILE_SECRET_KEY = 'wrong-name';

    const { flags, warnings } = configDiagnostics(env);
    expect(flags.turnstileSite.present).toBe(false);
    expect(flags.turnstileSecret.present).toBe(false);
    expect(warnings.some((w) => w.includes('TURNSTILE_SITE_KEY'))).toBe(true);
  });

  it('без anon key объясняет, что нужен redeploy', () => {
    const env: NodeJS.ProcessEnv = { ...base };
    delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { flags, warnings } = configDiagnostics(env);
    expect(flags.supabaseAnon.present).toBe(false);
    expect(warnings.some((w) => w.includes('redeploy'))).toBe(true);
  });

  it('пустая строка считается отсутствием переменной', () => {
    const { flags } = configDiagnostics({ ...base, ADMIN_TOKEN: '   ' });
    expect(flags.adminToken.present).toBe(false);
  });
});
