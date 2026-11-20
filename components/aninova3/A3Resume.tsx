'use client';

import Link from 'next/link';
import { useLibrary } from '@/lib/library';
import { formatTime } from '@/lib/format';
import { IconPlay } from '@/components/ui/icons';

/** Продолжение с последней серии — из локальной истории, без обращения к серверу. */
export function A3Resume({ slug }: { slug: string }) {
  const { history } = useLibrary();
  const last = history.find((h) => h.slug === slug);
  if (!last) return null;
  return (
    <Link className="a3-resume" href={`/preview/aninova-3/anime/${slug}/${last.episode}`}>
      <IconPlay size={16} />
      <span>
        Продолжить с серии {last.episode}
        {last.position > 30 ? ` · ${formatTime(last.position)}` : ''}
      </span>
    </Link>
  );
}
