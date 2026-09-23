'use client';

import { useLibrary } from '@/lib/library';
import { useTitles } from '@/lib/useTitles';
import { LIST_STATUS_LABELS } from '@/lib/labels';
import type { ListStatus } from '@/lib/types';
import { PosterCard } from '@/components/anime/PosterCard';
import { IconList } from '@/components/ui/icons';

export function MyList() {
  const { lists } = useLibrary();
  const slugs = Object.keys(lists);
  const { bySlug } = useTitles(slugs);

  if (!slugs.length) {
    return (
      <div className="empty-state">
        <IconList size={28} />
        <h2>Списки пусты</h2>
        <p>На странице любого аниме нажмите «Добавить в список»: Смотрю, Просмотрено, Отложено и т.д.</p>
        <a className="btn btn--primary btn--md" href="/catalog">
          Выбрать аниме
        </a>
      </div>
    );
  }

  const groups = (Object.keys(LIST_STATUS_LABELS) as ListStatus[]).map((st) => ({
    st,
    items: slugs.filter((s) => lists[s] === st).map((s) => bySlug.get(s)).filter(Boolean),
  }));

  return (
    <div className="mylist">
      {groups.map(({ st, items }) =>
        items.length ? (
          <section key={st} aria-label={LIST_STATUS_LABELS[st]}>
            <h2 className="section-title">
              {LIST_STATUS_LABELS[st]} <span className="episodes__count">{items.length}</span>
            </h2>
            <div className="poster-grid">
              {items.map((t) => (
                <PosterCard key={t!.slug} title={t!} />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
