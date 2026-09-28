import type { ImageLoaderProps } from 'next/image';

/**
 * S1 (аудит SEO/Perf 28.09): единая точка входа в image-прокси /img.
 * Прокси отключается NEXT_PUBLIC_IMG_PROXY=0 — тогда ходим напрямую на CDN (прежнее поведение).
 */
export const IMG_PROXY = process.env.NEXT_PUBLIC_IMG_PROXY !== '0';

/** Можно ли проксировать/оптимизировать src (http(s), ещё не прокси, не data/blob). */
export function isProxiable(src: string | null | undefined): src is string {
  if (!src || !IMG_PROXY) return false;
  if (src.startsWith('/img') || src.startsWith('data:') || src.startsWith('blob:')) return false;
  return /^https?:\/\//i.test(src);
}

/** Кастомный loader для next/image: /img?url=…&w=…&q=…&fmt=auto (ресайз + транскод на сервере). */
export function imgLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!isProxiable(src)) return src;
  const p = new URLSearchParams({ url: src, w: String(width), fmt: 'auto' });
  if (quality) p.set('q', String(quality));
  return `/img?${p.toString()}`;
}

/** URL прокси для plain <img> (RSC/декоративные слоты): w — физ. ширина, q — качество. */
export function imgProxyUrl(src: string | null | undefined, w?: number, q?: number): string | null {
  if (!src) return null;
  if (!isProxiable(src)) return src;
  const p = new URLSearchParams({ url: src, fmt: 'auto' });
  if (w) p.set('w', String(w));
  if (q) p.set('q', String(q));
  return `/img?${p.toString()}`;
}
