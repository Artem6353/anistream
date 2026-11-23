import Link from 'next/link';
import type { ScheduleEntry } from '@/lib/types';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconCalendar, IconChevronRight, IconPlay } from '@/components/ui/icons';
import { AIRING_STATE_LABELS, airingState, mskTimeLabel } from '@/lib/aninova3/schedule-view';

const ROOT = '/preview/aninova-3';

/**
 * Список эфиров одного дня. Серверный компонент без клиентского JS: расписание
 * читается из реальных данных (`getWeekSchedule`), а не собирается в браузере.
 *
 * `compact` — вариант для главной: те же данные, меньше служебных подписей.
 */
export function A3ScheduleList({
  entries,
  now,
  compact = false,
  emptyText = 'На этот день эфиров нет.',
}: {
  entries: ScheduleEntry[];
  now: number;
  compact?: boolean;
  emptyText?: string;
}) {
  if (!entries.length) {
    return (
      <div className="a3-empty a3-empty--inline">
        <p className="a3-empty__title">{emptyText}</p>
        <p className="a3-muted">Данные приходят из реального графика каталога; пустой день — это нормально.</p>
      </div>
    );
  }

  return (
    <ol className={`a3-sched${compact ? ' a3-sched--compact' : ''}`}>
      {entries.map((entry) => {
        /* Без слага и русского названия строку показать нечем: в расписание
           попадают только произведения каталога, но тип допускает пустые поля. */
        const slug = entry.slug;
        if (!slug) return null;
        const state = airingState(entry.at, now);
        const episodeHref = `${ROOT}/anime/${slug}/${entry.episode}`;
        return (
          <li key={`${slug}-${entry.episode}-${entry.at}`} className={`a3-sched__row is-${state}`} data-state={state}>
            <time className="a3-sched__time" dateTime={new Date(entry.at).toISOString()}>
              {mskTimeLabel(entry.at)}
            </time>
            <span className="a3-sched__art">
              <PosterArt src={entry.poster} seed={slug} initials={entry.romaji} alt="" width={compact ? 40 : 56} />
            </span>
            <span className="a3-sched__body">
              <Link className="a3-sched__title" href={`${ROOT}/anime/${slug}`} data-a3-focusable>
                {entry.ru ?? slug}
              </Link>
              <span className="a3-sched__meta">Серия {entry.episode}</span>
            </span>
            <span className="a3-sched__side">
              {!compact ? <span className={`a3-sched__badge is-${state}`}>{AIRING_STATE_LABELS[state]}</span> : null}
              <Link className="a3-sched__play" href={episodeHref} aria-label={`Смотреть: ${entry.ru ?? slug}, серия ${entry.episode}`} data-a3-focusable>
                <IconPlay size={14} />
                {!compact ? <span>Смотреть</span> : null}
                <IconChevronRight size={14} />
              </Link>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Подпись «обновлено по расписанию каталога» — без обещаний живого опроса AniList. */
export function A3ScheduleNote({ entries, compact = false }: { entries: ScheduleEntry[]; compact?: boolean }) {
  return (
    <p className="a3-muted a3-sched__note">
      <IconCalendar size={14} /> Время московское (МСК).{' '}
      {entries.length
        ? `Показов на неделю: ${entries.length}. Источник — график каталога и расписание воркера.`
        : 'Показов нет: сетка обновится автоматически.'}
      {compact ? null : ' Прошедшие серии остаются в сетке с пометкой «вышла».'}
    </p>
  );
}
