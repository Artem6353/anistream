import { describe, expect, it } from 'vitest';
import { normalizeProviderUrl } from '../lib/providers/url';

describe('provider URL normalization', () => {
  it('decodes HTML-escaped query separators before iframe navigation', () => {
    expect(normalizeProviderUrl('https://aniboom.one/embed/id?episode=1&amp;translation=9&amp;parent=https%3A%2F%2Fexample.com'))
      .toBe('https://aniboom.one/embed/id?episode=1&translation=9&parent=https%3A%2F%2Fexample.com');
  });

  it('normalizes protocol-relative provider URLs to HTTPS', () => {
    expect(normalizeProviderUrl('//kodikplayer.com/seria/1/hash/720p'))
      .toBe('https://kodikplayer.com/seria/1/hash/720p');
  });

  it('rejects empty, malformed and non-http URLs', () => {
    expect(normalizeProviderUrl('')).toBeNull();
    expect(normalizeProviderUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeProviderUrl('not a url')).toBeNull();
  });
});
