import { describe, expect, it } from 'vitest';
import {
  buildCandidate,
  checkUrl,
  contentHash,
  detectKeywords,
  itemKey,
  parseFeed,
} from '../scripts/lib/comics-announcements.mjs';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Studio &amp; Co</title>
<item><title><![CDATA[TV anime adaptation announced!]]></title>
<link>https://studio.example/news/1</link>
<guid isPermaLink="false">news-1</guid>
<pubDate>Mon, 06 Jul 2026 03:10:08 +0000</pubDate>
<description><![CDATA[<p>An anime adaptation of the manga.</p>]]></description></item>
<item><title>Manga sale</title><link>https://studio.example/news/2</link><guid>news-2</guid></item>
<item><title>Broken item without link</title><guid>news-3</guid></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Studio Atom</title>
<entry><title>Anime adaptation greenlit</title>
<link rel="alternate" href="https://studio.example/a/1"/>
<id>tag:studio,2026:1</id>
<updated>2026-07-06T03:10:08Z</updated>
<summary type="html">A new series.</summary></entry></feed>`;

const SOURCE = { slug: 'studio', domain: 'studio.example' };

describe('parseFeed', () => {
  it('читает RSS: CDATA, сущности, guid и дату', () => {
    const feed = parseFeed(RSS);
    expect(feed.title).toBe('Studio & Co');
    expect(feed.items).toHaveLength(2);
    const [first, second] = feed.items;
    expect(first).toMatchObject({
      title: 'TV anime adaptation announced!',
      guid: 'news-1',
      link: 'https://studio.example/news/1',
      summary: 'An anime adaptation of the manga.',
      publishedAt: '2026-07-06T03:10:08.000Z',
    });
    expect(second.publishedAt).toBeNull();
  });

  it('читает Atom: alternate-link, id и updated', () => {
    const feed = parseFeed(ATOM);
    expect(feed.title).toBe('Studio Atom');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      title: 'Anime adaptation greenlit',
      guid: 'tag:studio,2026:1',
      link: 'https://studio.example/a/1',
      publishedAt: '2026-07-06T03:10:08.000Z',
    });
  });

  it('не выдумывает элементы из мусора', () => {
    expect(parseFeed('<html>not a feed</html>').items).toEqual([]);
    expect(parseFeed('').items).toEqual([]);
  });
});

describe('detectKeywords', () => {
  it('узнаёт сильный сигнал об адаптации на английском, японском и русском', () => {
    expect(detectKeywords('TV anime adaptation announced').strength).toBe('strong');
    expect(detectKeywords('TVアニメ『運命の巻戻士』追加情報解禁！').strength).toBe('strong');
    expect(detectKeywords('Анонсирована аниме-адаптация манги').strength).toBe('strong');
  });

  it('обычный релиз или распродажа не считается адаптацией', () => {
    expect(detectKeywords('Seven Seas Licenses MELTING POINT Manhwa Series').strength).toBe('none');
    expect(detectKeywords('Score sweet $0.99 Volume 1s').strength).toBe('none');
  });

  it('слух остаётся сигналом, но не actionable', () => {
    const detection = detectKeywords('Rumoured anime adaptation of the manga');
    expect(detection.strength).toBe('strong');
    expect(detection.rumour).toBe(true);
    expect(detection.actionable).toBe(false);
  });

  it('слово anime без контекста — только слабый сигнал', () => {
    const detection = detectKeywords('The manga behind this fall anime sale');
    expect(detection.strength).toBe('weak');
    expect(detection.actionable).toBe(false);
  });
});

describe('itemKey и contentHash', () => {
  it('guid стабильнее ссылки, ссылка — стабильнее заголовка', () => {
    expect(itemKey({ guid: 'g1', link: 'https://x/1', title: 't' })).toBe('guid:g1');
    expect(itemKey({ link: 'https://x/1', title: 't' })).toBe('link:https://x/1');
    expect(itemKey({ title: 't', publishedAt: '2026-01-01' })).toMatch(/^hash:[a-f0-9]{64}$/);
  });

  it('элемент без guid, ссылки и заголовка — ошибка, а не выдуманный ключ', () => {
    expect(() => itemKey({})).toThrow(/neither guid, link nor title/);
  });

  it('хэш содержимого меняется вместе с текстом', () => {
    const base = { title: 't', summary: 'a', link: 'https://x/1', publishedAt: null };
    expect(contentHash(base)).toBe(contentHash({ ...base }));
    expect(contentHash(base)).not.toBe(contentHash({ ...base, summary: 'b' }));
  });
});

describe('checkUrl', () => {
  it('пропускает https на домене источника и его поддоменах', () => {
    expect(checkUrl('https://studio.example/news/1', 'studio.example').ok).toBe(true);
    expect(checkUrl('https://www.studio.example/news/1', 'studio.example').ok).toBe(true);
  });

  it('отклоняет http, чужие домены, подделку суффикса, порт и учётные данные', () => {
    expect(checkUrl('http://studio.example/1', 'studio.example')).toMatchObject({ ok: false, reason: 'not_https' });
    expect(checkUrl('https://evil.example/1', 'studio.example')).toMatchObject({ ok: false, reason: 'domain_not_allowed' });
    expect(checkUrl('https://studio.example.evil.example/1', 'studio.example')).toMatchObject({ ok: false, reason: 'domain_not_allowed' });
    expect(checkUrl('https://studio.example:8443/1', 'studio.example')).toMatchObject({ ok: false, reason: 'unexpected_port' });
    expect(checkUrl('https://user:pass@studio.example/1', 'studio.example')).toMatchObject({ ok: false, reason: 'credentials_in_url' });
    expect(checkUrl('not a url', 'studio.example')).toMatchObject({ ok: false, reason: 'invalid_url' });
  });
});

describe('buildCandidate', () => {
  it('создаёт кандидата только в pending_review и сохраняет сигналы', () => {
    const built = buildCandidate(
      {
        title: 'TV anime adaptation announced',
        summary: 'The studio confirmed a series.',
        link: 'https://studio.example/news/1?utm_source=rss',
        guid: 'news-1',
        publishedAt: '2026-07-06T03:10:08.000Z',
      },
      SOURCE,
    );
    expect(built.ok).toBe(true);
    if (!built.ok || !built.candidate) throw new Error(built.ok ? 'no candidate' : built.reason);
    expect(built.candidate).toMatchObject({
      sourceSlug: 'studio',
      itemKey: 'guid:news-1',
      status: 'pending_review',
      strength: 'strong',
      rumour: false,
      actionable: true,
      publishedAt: '2026-07-06T03:10:08.000Z',
    });
    expect(built.candidate.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('не пропускает ссылку вне allowlist', () => {
    const built = buildCandidate(
      { title: 'TV anime adaptation', summary: '', link: 'https://aggregator.example/x', guid: 'a' },
      SOURCE,
    );
    expect(built).toMatchObject({ ok: false, reason: 'domain_not_allowed' });
  });
});
