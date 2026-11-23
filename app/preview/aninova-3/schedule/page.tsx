import type { Metadata } from 'next';
import Link from 'next/link';
import { getWeekSchedule, weekBounds } from '@/lib/schedule';
import {
  DAY_FULL,
  DAY_SHORT,
  currentDayIndex,
  dayCounts,
  entriesForDay,
  mskDateLabel,
  parseScheduleDay,
  weekDayDates,
} from '@/lib/aninova3/schedule-view';
import { A3ScheduleList, A3ScheduleNote } from '@/components/aninova3/A3ScheduleList';
import { serverNow } from '@/lib/aninova3/clock';

/* Расписание обновляется воркером каждые 30 минут — часовая ревалидация
   показывала бы вчерашнюю сетку. Значение то же, что у production-страницы. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Расписание',
  description: 'Неделя эфиров аниме по Москве: дни, серии и время показа.',
  robots: { index: false, follow: false },
};

const ROOT = '/preview/aninova-3';

export default async function A3SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const now = serverNow();
  const today = currentDayIndex(now);
  const day = parseScheduleDay(sp.day, today);
  /* Реальные данные: таблица воркера, а до её заполнения — график каталога.
     Демонстрационной недели нет. */
  const { entries, source, freshAt } = await getWeekSchedule();
  const counts = dayCounts(entries);
  const dates = weekDayDates(weekBounds().start);
  const list = entriesForDay(entries, day);
  const href = (target: number) => (target === today ? `${ROOT}/schedule` : `${ROOT}/schedule?day=${target}`);

  return (
    <div className="a3-wrap a3-sched-page">
      <header className="a3-pagehead">
        <p className="a3-kicker">Расписание · {entries.length ? `${entries.length} показов` : 'данных пока нет'}</p>
        <h1 className="a3-h1">Эфир недели</h1>
        <p className="a3-pagehead__lead">
          Дни, серии и время выхода по Москве. Сетка строится из реального графика каталога и обновляется фоновой задачей —
          прямых запросов к внешним API на странице нет.
        </p>
      </header>

      <nav className="a3-week" aria-label="Дни недели">
        {DAY_SHORT.map((short, index) => {
          const active = index === day;
          const isToday = index === today;
          return (
            <Link
              key={short}
              className={`a3-week__day${active ? ' is-on' : ''}${isToday ? ' is-today' : ''}`}
              href={href(index)}
              aria-current={active ? 'true' : undefined}
              data-a3-focusable
            >
              <span className="a3-week__wd">
                {short}
                {isToday ? <span className="a3-week__dot" aria-label="сегодня" /> : null}
              </span>
              <span className="a3-week__date">{mskDateLabel(dates[index])}</span>
              <span className="a3-week__count">{counts[index]}</span>
            </Link>
          );
        })}
      </nav>

      <section className="a3-sched-day" aria-labelledby="a3-sched-day-title">
        <div className="a3-section__head a3-section__head--inline">
          <div>
            <h2 className="a3-h2" id="a3-sched-day-title">
              {DAY_FULL[day]}
              {day === today ? ' · сегодня' : ''}
            </h2>
            <p className="a3-muted">
              {list.length ? `${list.length} ${list.length === 1 ? 'показ' : 'показов'}` : 'показов нет'}
            </p>
          </div>
          <Link className="a3-link" href={`${ROOT}/catalog?status=ongoing&sort=new`}>
            Онгоинги каталога →
          </Link>
        </div>

        <A3ScheduleList entries={list} now={now} emptyText={`В ${DAY_FULL[day].toLowerCase()} эфиров нет.`} />
        <A3ScheduleNote entries={entries} />
        <p className="a3-muted a3-sched__source">
          Источник данных: {source === 'db' ? 'таблица расписания воркера' : source === 'catalog' ? 'график каталога' : 'нет данных'}
          {freshAt ? ` · последний эфир ${mskDateLabel(freshAt)}` : ''}. Время МСК (UTC+3, без перехода на летнее).
        </p>
      </section>
    </div>
  );
}
