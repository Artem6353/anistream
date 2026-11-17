import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildReport, estimateTable, readExactSize } from '../scripts/check-db-size.mjs';

const MB = 1024 * 1024;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('check-db-size: вердикт по квоте', () => {
  it('ниже порога — ok', () => {
    const { report, verdict } = buildReport({ databaseBytes: 100 * MB, quotaMb: 500, alertPct: 80, criticalPct: 95 });
    expect(report.usedPct).toBe(20);
    expect(report.overThreshold).toBe(false);
    expect(report.freeMb).toBe(400);
    expect(verdict).toBe('ok');
  });

  it('80% и выше — alert (exit 3)', () => {
    const { report, verdict } = buildReport({ databaseBytes: 400 * MB, quotaMb: 500, alertPct: 80, criticalPct: 95 });
    expect(report.usedPct).toBe(80);
    expect(verdict).toBe('alert');
  });

  it('95% и выше — critical (exit 1), даже если порог алерта ниже', () => {
    const { report, verdict } = buildReport({ databaseBytes: 480 * MB, quotaMb: 500, alertPct: 50, criticalPct: 95 });
    expect(verdict).toBe('critical');
    expect(report.overThreshold).toBe(true);
  });

  it('квоту можно переопределить (self-hosted больше 500 МБ)', () => {
    const { verdict } = buildReport({ databaseBytes: 900 * MB, quotaMb: 4096, alertPct: 80, criticalPct: 95 });
    expect(verdict).toBe('ok');
  });

  it('считает МБ у таблиц и сохраняет признак «это оценка»', () => {
    const { report } = buildReport({
      databaseBytes: 200 * MB,
      quotaMb: 500,
      alertPct: 80,
      criticalPct: 95,
      exact: false,
      exactReason: 'HTTP 404',
      tables: [{ name: 'episode_source_urls', bytes: 120 * MB, rows: 300_000 }],
    });
    expect(report.exact).toBe(false);
    expect(report.exactReason).toBe('HTTP 404');
    expect(report.tables[0]).toEqual({ name: 'episode_source_urls', mb: 120, rows: 300_000 });
  });
});

describe('check-db-size: источники размера', () => {
  it('берёт pg_database_size из RPC', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        databaseBytes: 300 * MB,
        tables: [{ name: 'a', bytes: 10 }, { name: 'b', bytes: 30 }],
      }),
    })));

    const result = await readExactSize({ baseUrl: 'https://x', headers: { apikey: 'k' } });
    expect(result.exact).toBe(true);
    expect(result.databaseBytes).toBe(300 * MB);
    expect(result.tables?.map((table) => table.name)).toEqual(['b', 'a']);
  });

  it('404 (миграция не применена) — не падение, а честный fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    const result = await readExactSize({ baseUrl: 'https://x', headers: { apikey: 'k' } });
    expect(result.exact).toBe(false);
    expect(String(result.reason)).toContain('404');
  });

  it('оценка: строки × средний размер строки (+25% на страницы)', async () => {
    const row = { anime_id: 1, provider: 'kodik', episode: 1, embed_url: 'https://x/' + 'a'.repeat(60) };
    const rowBytes = JSON.stringify(row).length;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('Prefer') || url.includes('limit=1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-range': '0-0/1000' }),
          json: async () => [row],
        };
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => [row, row] };
    });
    vi.stubGlobal('fetch', fetchMock);

    const estimate = await estimateTable('episode_source_urls', { baseUrl: 'https://x', headers: { apikey: 'k' } });
    expect(estimate.rows).toBe(1000);
    expect(estimate.bytes).toBe(Math.round(1000 * rowBytes * 1.25));
  });
});
