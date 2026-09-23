import type { Title } from '@/lib/types';
import { STATUS_LABELS, TYPE_LABELS, SEASON_LABELS } from '@/lib/labels';
import { IconStar } from '@/components/ui/icons';

export function MetaBadges({ title, compact }: { title: Title; compact?: boolean }) {
  return (
    <div className="meta-badges">
      <span className="badge badge--accent">{TYPE_LABELS[title.type]}</span>
      <span className="badge">{title.year}</span>
      {title.season ? <span className="badge">{SEASON_LABELS[title.season]}</span> : null}
      {title.score > 0 ? (
        <span className="badge badge--score" title="Средняя оценка по данным AniList">
          <IconStar size={11} />
          {title.score.toFixed(1)}
        </span>
      ) : null}
      {title.episodes > 1 ? <span className="badge">{title.episodes} сер.</span> : null}
      {!compact ? <span className={`badge ${title.status === 'ongoing' ? 'badge--success' : ''}`}>{STATUS_LABELS[title.status]}</span> : null}
    </div>
  );
}
