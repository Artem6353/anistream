'use client';

import Link from 'next/link';
import type { ScheduleEntry } from '@/lib/types';
import { WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/labels';
import { formatClock, formatDate } from '@/lib/format';
import { PosterArt } from '@/components/anime/PosterArt';
import { todayIndex } from '@/lib/schedule-core';
import { IconCalendar } from '@/components/ui/icons';

/** Недельная доска расписания: 7 колонок, сегодняшний день подсвечен. */
export function ScheduleBoard({ entries, live }: { entries: ScheduleEntry[]; live: boolean }) {
  const today = todayIndex();
  const days = Array.from({ length: 7 }, (_, i) => i);

  return (
    <div className="schedule">
      <p className={`schedule__note ${live ? 'schedule__note--live' : ''}`}>
        {live
          ? 'Неделя выхода серий по данным AniList, время ваше локальное.'
          : 'Живое расписание AniList загружается… показан демо-набор каталога.'}
      </p>
      <div className="schedule__grid">
        {days.map((d) => {
          const list = entries.filter((e) => (new Date(e.at).getDay() + 6) % 7 === d).sort((a, b) => a.at - b.at);
          return (
            <section key={d} className={`schedule__day ${d === today ? 'is-today' : ''}`} aria-label={WEEKDAYS[d]}>
              <header className="schedule__day-head">
                <span className="schedule__weekday">{WEEKDAYS_SHORT[d]}</span>
                <span className="schedule__date">{formatDate(list[0]?.at ?? Date.now())}</span>
              </header>
              {list.length === 0 ? (
                <p className="schedule__empty">Выходов нет</p>
              ) : (
                <ul className="schedule__list">
                  {list.map((e) => (
                    <li key={`${e.anilistId}-${e.episode}-${e.at}`}>
                      <EntryRow entry={e} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Блок «Сегодня выходит» для главной. */
export function TodayList({ entries, live }: { entries: ScheduleEntry[]; live: boolean }) {
  const today = todayIndex();
  const list = entries.filter((e) => (new Date(e.at).getDay() + 6) % 7 === today).slice(0, 9);
  return (
    <div className="container">
      {list.length ? (
        <div className="today-grid">
          {list.map((e) => (
            <EntryRow key={`${e.anilistId}-${e.episode}-${e.at}`} entry={e} />
          ))}
        </div>
      ) : (
        <p className="schedule__empty">Сегодня эфиров нет — загляните в недельное расписание.</p>
      )}
      {!live ? <p className="schedule__note">Демо-расписание: живые данные AniList подгрузятся автоматически.</p> : null}
    </div>
  );
}

function EntryRow({ entry }: { entry: ScheduleEntry }) {
  const href = entry.slug ? `/anime/${entry.slug}` : `https://anilist.co/anime/${entry.anilistId}`;
  const inner = (
    <>
      <span className="schedule__time">
        <IconCalendar size={13} /> {formatClock(entry.at)}
      </span>
      <span className="schedule__poster">
        <PosterArt src={entry.poster} seed={String(entry.anilistId)} initials={entry.romaji} alt="" />
      </span>
      <span className="schedule__info">
        <span className="schedule__title">{entry.ru ?? entry.romaji}</span>
        <span className="schedule__meta">
          {entry.episode} серия{entry.source === 'demo' ? ' · демо' : ''}
        </span>
      </span>
    </>
  );
  return entry.slug ? (
    <Link className="schedule__entry" href={href}>
      {inner}
    </Link>
  ) : (
    <a className="schedule__entry" href={href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  );
}
