import { describe, expect, it } from 'vitest';
import { rowToSource, type SourceRow } from '../lib/episode-sources';

const row: SourceRow = {
  anime_id: 457,
  provider: 'cvh',
  translation_id: '0',
  translation_title: 'CVH · SHIZA Project',
  translation_type: 'voice',
  kind: 'embed',
  embed_url: 'https://animego.me/cdn-iframe/457/1/1?dubbing=SHIZA%20Project',
  episodes_count: 1,
  checked_at: null,
  status: 'ok',
};

describe('CVH episode URL normalization from Supabase rows', () => {
  it('corrects a stale episode-1 URL stored against episode 2', () => {
    const source = rowToSource(
      row,
      2,
      'https://animego.me/cdn-iframe/457/1/1?dubbing=SHIZA%20Project',
    );
    expect(source?.embedUrl).toBe('https://animego.me/cdn-iframe/457/1/2?dubbing=SHIZA%20Project');
    expect(source?.synthesized).toBe(true);
  });

  it('rewrites the template for an episode beyond a stale header count', () => {
    const source = rowToSource(row, 26);
    expect(source?.embedUrl).toBe('https://animego.me/cdn-iframe/457/1/26?dubbing=SHIZA%20Project');
    expect(source?.synthesized).toBe(true);
  });

  it('keeps a correctly stored exact episode URL unchanged', () => {
    const url = 'https://animego.me/cdn-iframe/457/1/26?dubbing=SHIZA%20Project';
    const source = rowToSource(row, 26, url);
    expect(source?.embedUrl).toBe(url);
    expect(source?.synthesized).toBeUndefined();
  });
});

describe('AniBoom escaped URL normalization from Supabase rows', () => {
  it('decodes &amp; and writes the requested episode number', () => {
    const source = rowToSource(
      { ...row, provider: 'aniboom', translation_id: '9', embed_url: 'https://aniboom.one/embed/id?episode=1&amp;translation=9&amp;parent=x' },
      3,
    );
    expect(source?.embedUrl).toBe('https://aniboom.one/embed/id?episode=3&translation=9&parent=x');
    expect(source?.synthesized).toBe(true);
  });
});
