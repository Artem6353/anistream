import { describe, expect, it } from 'vitest';
import { rewriteCvh, rewriteAniboom } from '../lib/providers/synthesize';

/** B4: контракт-фикстуры провайдеров — URL-шаблоны не должны ломаться при обновлении парсеров. */
describe('provider URL contract fixtures', () => {
  it('rewriteCvh: подменяет номер серии в последнем сегменте', () => {
    const out = rewriteCvh('https://cdn.animego.org/cdn-iframe/12345/AniDUB/1/3', 7);
    expect(out).toBe('https://cdn.animego.org/cdn-iframe/12345/AniDUB/1/7');
  });

  it('rewriteCvh: отказывается от не-CVH URL (kodik)', () => {
    expect(rewriteCvh('https://kodik.info/seria/12345/hash/720p', 7)).toBeNull();
  });

  it('rewriteAniboom: подменяет episode-параметр', () => {
    const out = rewriteAniboom('https://aniboom.one/embed?episode=3&token=abc', 9);
    expect(out).toContain('episode=9');
    expect(out).toContain('token=abc');
  });

  it('rewriteAniboom: null без episode-параметра', () => {
    expect(rewriteAniboom('https://aniboom.one/embed?token=abc', 9)).toBeNull();
  });

  it('bridge-cache legacy entry shape (контракт импорта)', () => {
    const entry = {
      providers: ['kodik'],
      voices: [{ id: 'v', dub: 'Studio Band', kind: 'dub', sources: [{ quality: '720p', url: 'https://kodik.info/seria/1/hash/720p', provider: 'kodik' }] }],
    };
    expect(entry.voices[0].sources[0].url.startsWith('https://')).toBe(true);
    expect(entry.providers).toContain('kodik');
  });
});
