'use client';

import { useState } from 'react';
import { artUri } from '@/lib/art';

/** Постер с детерминированным генеративным фолбэком (офлайн/404 CDN). */
export function PosterArt({
  src,
  seed,
  initials,
  alt,
  eager,
}: {
  src?: string | null;
  seed: string;
  initials: string;
  alt: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = artUri(seed, initials);
  const proxied = src && process.env.NEXT_PUBLIC_IMG_PROXY !== '0' && !src.startsWith('/img') ? `/img?url=${encodeURIComponent(src)}` : src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="poster-art"
      src={failed || !proxied ? fallback : proxied}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}
