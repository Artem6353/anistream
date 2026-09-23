import Link from 'next/link';
import type { Title } from '@/lib/types';
import { watchOrder, REL_LABELS } from '@/lib/franchise';
import { titleById } from '@/lib/catalog';
import { TYPE_LABELS } from '@/lib/labels';

/** Порядок просмотра франшизы: сезоны, OVA, фильмы, спешлы — в хронологии (ТЗ 2.3). */
export function WatchOrder({ title }: { title: Title }) {
  const order = watchOrder(title, titleById);
  if (order.length < 2) return null;
  return (
    <section className="watchorder" aria-label="Порядок просмотра">
      <h2 className="section-title">Порядок просмотра</h2>
      <p className="panel__note">Все связанные части франшизы в хронологическом порядке: что смотреть после этого тайтла.</p>
      <ol className="watchorder__list">
        {order.map((t, i) => {
          const rel = t.relations?.find((r) => r.id === title.anilistId);
          return (
            <li key={t.anilistId} className={`watchorder__item ${t.anilistId === title.anilistId ? 'is-current' : ''}`}>
              <span className="watchorder__num">{i + 1}</span>
              <span className="watchorder__body">
                <Link href={`/anime/${t.slug}`}>{t.ru}</Link>
                <span className="watchorder__meta">
                  {TYPE_LABELS[t.type]} · {t.year}
                  {rel ? ` · ${REL_LABELS[rel.type] ?? rel.type}` : ''}
                </span>
              </span>
              {t.anilistId === title.anilistId ? <span className="player-flag player-flag--ok">вы здесь</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
