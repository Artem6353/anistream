'use client';

import { useState } from 'react';
import Image from 'next/image';
import { artUri } from '@/lib/art';
import { imgLoader, isProxiable } from '@/lib/img';

/** Постер с детерминированным генеративным фолбэком (офлайн/404 CDN).
    S1.2 (аудит 28.09): при включённом прокси рендерится через next/image с кастомным
    loader'ом → /img?url=…&w=…&fmt=auto: сервер ресайзит и транскодит (avif/webp),
    srcset 1x/2x строится от width слота. Фолбэк-логика (onError → artUri) сохранена. */
export function PosterArt({
  src,
  seed,
  initials,
  alt,
  eager,
  width = 220,
  quality,
}: {
  src?: string | null;
  seed: string;
  initials: string;
  alt: string;
  eager?: boolean;
  /** Ширина слота в CSS-px — из неё next/image строит srcset (1x/2x). Дефолт — карточка сетки. */
  width?: number;
  /** Качество транскода (дефолт маршрута: avif 62, webp/jpeg 75). */
  quality?: number;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = artUri(seed, initials);
  if (!failed && isProxiable(src)) {
    return (
      <Image
        className="poster-art"
        loader={imgLoader}
        src={src}
        alt={alt}
        width={width}
        height={Math.round(width * 1.5)}
        quality={quality}
        priority={!!eager}
        {...(eager ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const, fetchPriority: 'low' as const })}
        onError={() => setFailed(true)}
        draggable={false}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="poster-art"
      src={failed || !src ? fallback : src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}
