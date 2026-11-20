'use client';

import Image from 'next/image';
import { imgLoader } from '@/lib/img';

/** Широкий кадр (key art) через /img-прокси. Клиентский, потому что next/image
 *  принимает loader-функцию только внутри клиентской границы. */
export function A3BannerImg({
  src,
  className,
  quality = 58,
  priority = false,
}: {
  src: string;
  className?: string;
  quality?: number;
  priority?: boolean;
}) {
  return (
    <Image
      className={className}
      loader={imgLoader}
      src={src}
      alt=""
      fill
      sizes="100vw"
      quality={quality}
      priority={priority}
      {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
    />
  );
}
