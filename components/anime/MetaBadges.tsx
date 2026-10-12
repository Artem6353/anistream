import type { Title } from '@/lib/types';
import { STATUS_LABELS, TYPE_LABELS, SEASON_LABELS } from '@/lib/labels';
import { episodeCount, episodeInfo } from '@/lib/episodes';
import { IconStar } from '@/components/ui/icons';

export function MetaBadges({ title, compact }: { title: Title; compact?: boolean }) {
  const ep = episodeInfo(title);
  const epCount = episodeCount(title);
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
      {/* ТЗ 1.2: у онгоинга без объявленного итога — «1134+ сер.», у анонса — ничего */}
      {epCount !== null && epCount > 1 ? (
        <span className="badge" title={ep.totalUnknown ? 'Вышло серий; итог не объявлен' : undefined}>
          {epCount}
          {ep.totalUnknown ? '+' : ''} сер.
        </span>
      ) : null}
      {!compact ? (
        <span className={`badge ${title.status === 'ongoing' ? 'badge--success' : ''}`}>{STATUS_LABELS[title.status]}</span>
      ) : null}
    </div>
  );
}
