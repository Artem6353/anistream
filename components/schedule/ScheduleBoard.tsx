'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ScheduleEntry } from '@/lib/types';
import { WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/labels';
import { formatClock, formatDate, plural } from '@/lib/format';
import { PosterArt } from '@/components/anime/PosterArt';
import { mskDayIndex, todayIndex } from '@/lib/schedule-core';
import { IconCalendar } from '@/components/ui/icons';

/**
 * Недельная доска расписания (редизайн ТЗ 4.0):
 * крупная секция «Сегодня», компактные колонки остальных дней,
 * пустые дни — одной строкой.
 */
export function ScheduleBoard({ entries, live }: { entries: ScheduleEntry[]; live: boolean }) {
  const today = todayIndex();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const byDay = (d: number) =>
    entries.filter((e) => mskDayIndex(e.at) === d).sort((a, b) => a.at - b.at);

  const todayEntries = byDay(today);
  const otherDays = Array.from({ length: 6 }, (_, i) => (today + 1 + i) % 7);

  return (
    <div className="schedule schedule--v2">
      <p className={`schedule__note ${live ? 'schedule__note--live' : ''}`}>
        {live
          ? 'Неделя выхода серий по данным AniList. Время — московское (МСК).'
          : 'AniList недоступен — показана неделя из кэша (демо). Живые данные подгрузятся автоматически.'}
      </p>

      <section className="schedule__today" aria-label={`Сегодня: ${WEEKDAYS[today]}`}>
        <header className="schedule__today-head">
          <h2>
            Сегодня · {WEEKDAYS[today].toLowerCase()}, {formatDate(Date.now())}
          </h2>
          <span className="schedule__today-count">
            {todayEntries.length} {plural(todayEntries.length, ['выход', 'выхода', 'выходов'])}
          </span>
        </header>
        {todayEntries.length ? (
          <div className="schedule__today-grid">
            {todayEntries.map((e) => (
              <EntryRow key={`${e.anilistId}-${e.episode}-${e.at}`} entry={e} big />
            ))}
          </div>
        ) : (
          <p className="schedule__empty">Сегодня выходов нет — ближайшие эфиры собраны ниже по дням недели.</p>
        )}
      </section>

      <div className="schedule__week">
        {otherDays.map((d) => {
          const list = byDay(d);
          if (!list.length) {
            return (
              <div key={d} className="schedule__dayrow" aria-label={`${WEEKDAYS[d]}: выходов нет`}>
                <span className="schedule__dayrow-name">{WEEKDAYS[d]}</span>
                <span className="schedule__dayrow-note">выходов нет</span>
              </div>
            );
          }
          const open = !!expanded[d];
          const shown = open ? list : list.slice(0, 5);
          return (
            <section key={d} className="schedule__day schedule__day--compact" aria-label={WEEKDAYS[d]}>
              <header className="schedule__day-head">
                <span className="schedule__weekday">{WEEKDAYS_SHORT[d]}</span>
                <span className="schedule__date">{formatDate(list[0].at)}</span>
              </header>
              <ul className="schedule__list">
                {shown.map((e) => (
                  <li key={`${e.anilistId}-${e.episode}-${e.at}`}>
                    <EntryRow entry={e} compact />
                  </li>
                ))}
              </ul>
              {list.length > 5 ? (
                <button
                  type="button"
                  className="schedule__showall"
                  onClick={() => setExpanded((s) => ({ ...s, [d]: !s[d] }))}
                >
                  {open ? 'Свернуть' : `Показать все (${list.length})`}
                </button>
              ) : null}
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
  const list = entries.filter((e) => mskDayIndex(e.at) === today).slice(0, 9);
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
      {!live ? <p className="schedule__note">Данные из кэша (демо-неделя): живые данные AniList подгрузятся автоматически.</p> : null}
    </div>
  );
}

function EntryRow({ entry, big, compact }: { entry: ScheduleEntry; big?: boolean; compact?: boolean }) {
  const href = entry.slug ? `/anime/${entry.slug}` : `https://anilist.co/anime/${entry.anilistId}`;
  const cls = `schedule__entry ${big ? 'schedule__entry--big' : ''} ${compact ? 'schedule__entry--compact' : ''}`;
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
    <Link className={cls} href={href}>
      {inner}
    </Link>
  ) : (
    <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  );
}
