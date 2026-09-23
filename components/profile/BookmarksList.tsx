'use client';

import { useLibrary } from '@/lib/library';
import { useTitles } from '@/lib/useTitles';
import { PosterCard } from '@/components/anime/PosterCard';
import { IconBookmark } from '@/components/ui/icons';

export function BookmarksList() {
  const { bookmarks } = useLibrary();
  const { items, bySlug } = useTitles(bookmarks);

  if (!bookmarks.length) {
    return (
      <div className="empty-state">
        <IconBookmark size={28} />
        <h2>В закладках пусто</h2>
        <p>Нажмите на закладку на карточке тайтла — и он появится здесь, на всех устройствах этого браузера.</p>
        <a className="btn btn--primary btn--md" href="/catalog">
          Выбрать аниме
        </a>
      </div>
    );
  }

  return (
    <div className="poster-grid">
      {bookmarks.map((slug) => {
        const t = bySlug.get(slug);
        return t ? <PosterCard key={slug} title={t} /> : null;
      })}
      {items.length === 0 ? <p className="settings__note">Загружаем закладки…</p> : null}
    </div>
  );
}
