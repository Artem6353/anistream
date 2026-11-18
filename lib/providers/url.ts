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
