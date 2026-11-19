/**
 * Normalize provider URLs at every storage boundary.
 * Legacy cache rows may contain HTML-escaped ampersands or protocol-relative URLs;
 * passing those strings straight to iframe.src changes query parameter names and
 * can make an otherwise valid provider embed fail.
 */
export function normalizeProviderUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const url = trimmed.replace(/&amp;/gi, '&').replace(/^\/\//, 'https://');
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

/** Rewrite the season-local episode segment of a CVH cdn-iframe URL. */
export function rewriteCvh(url: string, episode: number): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'cdn-iframe' || parts.length < 3) return null;
    if (!/^\d+$/.test(parts[parts.length - 1])) return null;
    parts[parts.length - 1] = String(episode);
    u.pathname = '/' + parts.join('/');
    return u.toString();
  } catch {
    return null;
  }
}

/** Rewrite the ?episode=... parameter of an AniBoom iframe URL. */
export function rewriteAniboom(url: string, episode: number): string | null {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('episode')) return null;
    u.searchParams.set('episode', String(episode));
    return u.toString();
  } catch {
    return null;
  }
}
