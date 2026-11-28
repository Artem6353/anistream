/**
 * Pure helpers for the B3-E official-announcement monitor.
 *
 * No network, no database, no filesystem here: the script does I/O, this module
 * decides what an item is. Keeping it pure lets unit tests prove the rules
 * (allowlist, keyword detection, stable keys) without hitting real feeds.
 */

import { createHash } from 'node:crypto';

/** Named and numeric HTML entities that appear in RSS titles. */
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name] ?? match;
  });
}

/** Remove markup, scripts/styles and CDATA wrappers from a feed fragment. */
export function stripMarkup(value) {
  return decodeEntities(
    String(value ?? '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTag(block, names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
    const match = re.exec(block);
    if (match) return match[1];
  }
  return null;
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)];
  let fallback = null;
  for (const link of links) {
    const attrs = link[1] ?? '';
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? 'alternate';
    if (rel === 'alternate') return decodeEntities(href).trim();
    fallback ??= decodeEntities(href).trim();
  }
  return fallback;
}

function rssLink(block) {
  const raw = firstTag(block, ['link']);
  if (!raw) return null;
  const text = stripMarkup(raw);
  return text || decodeEntities(raw).trim();
}

function normalizeDate(raw) {
  if (!raw) return null;
  const text = stripMarkup(raw);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Parse RSS 2.0 or Atom into a flat list. Unknown shapes yield an empty list
 * instead of guesses: the monitor must not invent items.
 */
export function parseFeed(xml) {
  const body = String(xml ?? '');
  const channelTitle = stripMarkup(firstTag(body, ['title']) ?? '');
  const blocks = [...body.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const items = blocks.map((block) => {
    const title = stripMarkup(firstTag(block, ['title']) ?? '');
    const guid = stripMarkup(firstTag(block, ['guid', 'id']) ?? '');
    const link = atomLink(block) ?? rssLink(block) ?? '';
    const summary = stripMarkup(
      firstTag(block, ['description', 'summary', 'content:encoded', 'content']) ?? '',
    );
    const publishedAt = normalizeDate(
      firstTag(block, ['pubDate', 'published', 'updated', 'dc:date']) ?? null,
    );
    return { title, guid, link, summary, publishedAt };
  });
  return { title: channelTitle, items: items.filter((item) => item.title && item.link) };
}

/**
 * Keyword policy. A hit only proposes review; it never confirms an adaptation.
 * Japanese and Russian forms are included because the seeded feeds are not all
 * English.
 */
const STRONG_PATTERNS = [
  /anime\s+(?:adaptation|series|adaptation announced|announced)/i,
  /(?:tv|television)\s+anime/i,
  /anime\s+adaptation/i,
  /adapt(?:ed|ation)\s+(?:in)?to\s+anime/i,
  /gets?\s+(?:a\s+)?(?:tv\s+)?anime/i,
  /greenlit\s+(?:for\s+)?(?:an\s+)?anime/i,
  /アニメ化/,
  /tvアニメ/i,
  /テレビアニメ/,
  /экранизац\w*\s+(?:в\s+)?аниме/i,
  /аниме[- ]адаптац\w*/i,
  /(?:по\s+мотивам|по\s+сюжету).{0,80}аниме/i,
];
const WEAK_PATTERNS = [/\banime\b/i, /アニメ/, /\bаниме\b/i];
const RUMOUR_PATTERNS = [
  /rumou?r/i,
  /leak(?:ed|s)?/i,
  /reportedly/i,
  /unconfirmed/i,
  /未確認/,
  /噂/,
  /слух\w*/i,
  /неподтвержд\w*/i,
];

export function detectKeywords(...parts) {
  const text = parts.filter(Boolean).join(' \n ');
  const hits = [];
  let strength = 'none';
  for (const re of STRONG_PATTERNS) {
    const match = re.exec(text);
    if (match) {
      hits.push(match[0].trim());
      strength = 'strong';
    }
  }
  for (const re of WEAK_PATTERNS) {
    const match = re.exec(text);
    if (match) {
      hits.push(match[0].trim());
      if (strength === 'none') strength = 'weak';
    }
  }
  const rumour = RUMOUR_PATTERNS.some((re) => re.test(text));
  return {
    keywords: [...new Set(hits.map((hit) => hit.toLowerCase()))].slice(0, 12),
    strength,
    rumour,
    /** Only a strong, non-rumour hit is worth a human's time first. */
    actionable: strength === 'strong' && !rumour,
  };
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

/** Stable identity of a feed item within its source. */
export function itemKey(item) {
  const guid = String(item?.guid ?? '').trim();
  if (guid) return `guid:${guid}`.slice(0, 512);
  const link = String(item?.link ?? '').trim();
  if (link) return `link:${link}`.slice(0, 512);
  const title = String(item?.title ?? '').trim();
  const published = String(item?.publishedAt ?? '').trim();
  if (!title) throw new Error('announcement item has neither guid, link nor title');
  return `hash:${sha256(`${title}\n${published}`)}`;
}

export function contentHash(item) {
  return sha256(
    [item?.title ?? '', item?.summary ?? '', item?.link ?? '', item?.publishedAt ?? ''].join('\n'),
  );
}

/**
 * URL policy: https only, no credentials, no custom port, host must equal the
 * source domain or be its subdomain. Anything else is rejected by name so the
 * monitor can report why instead of silently skipping.
 */
export function checkUrl(rawUrl, domain) {
  let url;
  try {
    url = new URL(String(rawUrl ?? ''));
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  if (url.username || url.password) return { ok: false, reason: 'credentials_in_url' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'unexpected_port' };
  const host = url.hostname.toLowerCase();
  const allowed = String(domain ?? '').toLowerCase();
  if (!allowed) return { ok: false, reason: 'source_domain_missing' };
  if (host !== allowed && !host.endsWith(`.${allowed}`)) {
    return { ok: false, reason: 'domain_not_allowed', host };
  }
  return { ok: true, url: url.toString() };
}

/**
 * Turn a parsed item into a review-queue candidate. Status is always
 * pending_review: ingestion is not confirmation.
 */
export function buildCandidate(item, source) {
  const urlCheck = checkUrl(item.link, source.domain);
  if (!urlCheck.ok) return { ok: false, reason: urlCheck.reason, item };
  const detection = detectKeywords(item.title, item.summary);
  return {
    ok: true,
    candidate: {
      sourceSlug: source.slug,
      itemKey: itemKey(item),
      title: String(item.title).trim().slice(0, 500),
      summary: item.summary ? String(item.summary).slice(0, 4000) : null,
      url: urlCheck.url,
      publishedAt: item.publishedAt ?? null,
      detectedKeywords: detection.keywords,
      strength: detection.strength,
      rumour: detection.rumour,
      actionable: detection.actionable,
      status: 'pending_review',
      contentHash: contentHash(item),
    },
  };
}
