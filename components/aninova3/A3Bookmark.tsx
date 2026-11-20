'use client';

import { useLibrary } from '@/lib/library';
import { IconBookmark, IconBookmarkFill } from '@/components/ui/icons';

/** Закладка на реальном локальном хранилище проекта (lib/library), без серверных записей. */
export function A3Bookmark({ slug }: { slug: string }) {
  const { bookmarks } = useLibrary();
  const saved = bookmarks.includes(slug);
  return (
    <button
      className={`a3-btn a3-btn--ghost${saved ? ' is-on' : ''}`}
      type="button"
      aria-pressed={saved}
      onClick={async () => {
        const { library } = await import('@/lib/library');
        library.toggleBookmark(slug);
      }}
    >
      {saved ? <IconBookmarkFill size={16} /> : <IconBookmark size={16} />}
      {saved ? 'В закладках' : 'В закладки'}
    </button>
  );
}
