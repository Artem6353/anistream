import type { Title } from '@/lib/types';
import { watchOrder, REL_LABELS } from '@/lib/franchise';
import { titleById } from '@/lib/catalog';
import { TYPE_LABELS } from '@/lib/labels';
import { WatchOrderList, type WatchOrderItem } from './WatchOrderList';

/**
 * Порядок просмотра франшизы: сезоны, OVA, фильмы, спешлы — в хронологии (ТЗ 2.3).
 * ТЗ 4.1 (4.3): тяжёлый расчёт остаётся на сервере, аккордеон («первые 5 + Показать всё»)
 * рисует клиентский WatchOrderList.
 */
export function WatchOrder({ title }: { title: Title }) {
  const order = watchOrder(title, titleById);
  if (order.length < 2) return null;
  const items: WatchOrderItem[] = order.map((t) => {
    const rel = t.relations?.find((r) => r.id === title.anilistId);
    return {
      slug: t.slug,
      ru: t.ru,
      typeLabel: TYPE_LABELS[t.type],
      year: t.year,
      relLabel: rel ? (REL_LABELS[rel.type] ?? rel.type) : undefined,
      isCurrent: t.anilistId === title.anilistId,
    };
  });
  return (
    <section className="watchorder" aria-label="Порядок просмотра">
      <h2 className="section-title">Порядок просмотра</h2>
      <p className="panel__note">Все связанные части франшизы в хронологическом порядке: что смотреть после этого тайтла.</p>
      <WatchOrderList items={items} />
    </section>
  );
}
