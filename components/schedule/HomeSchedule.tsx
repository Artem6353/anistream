'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ScheduleEntry } from '@/lib/types';
import { WEEKDAYS } from '@/lib/labels';
import { formatClock, formatDate } from '@/lib/format';
import { PosterArt } from '@/components/anime/PosterArt';
import { todayIndex } from '@/lib/schedule-core';
import { IconChevronRight } from '@/components/ui/icons';

/** Двухколоночный блок главной: аккордеон расписания + лента обновлений (AnimeGO-style). */
export function HomeSchedule({ fallback }: { fallback: ScheduleEntry[] }) {
  const [entries, setEntries] = useState(fallback);
  const [live, setLive] = useState(false);
  const [openDay, setOpenDay] = useState(todayIndex());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/schedule')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        if (j.live && Array.isArray(j.entries) && j.entries.length) {
          setEntries(j.entries);
          setLive(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const today = todayIndex();
  const days = Array.from({ length: 7 }, (_, i) => i);
  const byDay = (d: number) => entries.filter((e) => (new Date(e.at).getDay() + 6) % 7 === d).sort((a, b) => a.at - b.at);
  const updates = byDay(today).slice(0, 10);

  return (
    <div className="home-schedule">
      <section className="panel" aria-label="Расписание аниме">
        <h2 className="section-title">Расписание аниме</h2>
        <p className="panel__note">Даты выхода серий в вашем часовом поясе{live ? ' · живые данные AniList' : ' · демо-данные'}.</p>
        <div className="acc">
          {days.map((d) => {
            const list = byDay(d);
            const open = openDay === d;
            return (
              <div key={d} className={`acc__item ${d === today ? 'is-today' : ''}`}>
                <button type="button" className="acc__head" onClick={() => setOpenDay(open ? -1 : d)} aria-expanded={open}>
                  <span>{WEEKDAYS[d]}</span>
                  <span className="acc__date">{d === today ? 'Сегодня' : formatDate(list[0]?.at ?? Date.now() + d * 86400000)}</span>
                </button>
                {open ? (
                  <ul className="acc__list">
                    {list.length === 0 ? (
                      <li className="acc__empty">Выходов нет</li>
                    ) : (
                      list.map((e) => (
                        <li key={`${e.anilistId}-${e.episode}-${e.at}`}>
                          <Link className="acc__entry" href={e.slug ? `/anime/${e.slug}` : `/schedule`}>
                            <span className="acc__poster">
                              <PosterArt src={e.poster} seed={String(e.anilistId)} initials={e.romaji} alt="" />
                            </span>
                            <span className="acc__info">
                              <span className="acc__title">{e.ru ?? e.romaji}</span>
                              <span className="acc__meta">
                                Серия {e.episode} · {formatClock(e.at)}
                              </span>
                            </span>
                            <IconChevronRight size={14} />
                          </Link>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel" aria-label="Обновления аниме">
        <h2 className="section-title">Обновления аниме</h2>
        <p className="panel__note">Свежие серии сегодня.</p>
        <ul className="updates">
          {updates.length === 0 ? (
            <li className="acc__empty">Сегодня обновлений нет</li>
          ) : (
            updates.map((e) => (
              <li key={`u-${e.anilistId}-${e.episode}`}>
                <Link className="updates__entry" href={e.slug ? `/anime/${e.slug}` : `/schedule`}>
                  <span className="updates__poster">
                    <PosterArt src={e.poster} seed={String(e.anilistId)} initials={e.romaji} alt="" />
                  </span>
                  <span className="updates__info">
                    <span className="updates__title">{e.ru ?? e.romaji}</span>
                    <span className="updates__meta">
                      Серия {e.episode} — сегодня, {formatClock(e.at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
        <Link className="rail-more" href="/schedule">
          Вся неделя →
        </Link>
      </section>
    </div>
  );
}
