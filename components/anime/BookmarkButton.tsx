'use client';

import { library, useLibrary } from '@/lib/library';
import { useToast } from '@/components/ui/Toaster';
import { IconBookmark, IconBookmarkFill } from '@/components/ui/icons';

export function BookmarkButton({ slug, className }: { slug: string; className?: string }) {
  const { bookmarks } = useLibrary();
  const toast = useToast();
  const active = bookmarks.includes(slug);
  return (
    <button
      type="button"
      className={`icon-btn bookmark-btn ${active ? 'is-active' : ''} ${className ?? ''}`}
      aria-label={active ? 'Убрать из закладок' : 'В закладки'}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const added = library.toggleBookmark(slug);
        toast(added ? 'Добавлено в закладки' : 'Убрано из закладок');
      }}
    >
      {active ? <IconBookmarkFill size={16} /> : <IconBookmark size={16} />}
    </button>
  );
}
