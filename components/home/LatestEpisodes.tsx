import Link from 'next/link';
import { getSchedule, scheduleWindow } from '@/lib/schedule';
import { mskDayIndex } from '@/lib/schedule-core';
import { formatClock } from '@/lib/format';
import type { ScheduleEntry } from '@/lib/types';
import { PosterArt } from '@/components/anime/PosterArt';

/**
 * «Новые эпизоды» — ЕДИНСТВЕННЫЙ блок главной про выходящие серии (аудит 2026-10, ТЗ 1.1.5).
 *
 * Раньше на главной было четыре пересекающихся блока с РАЗНЫМИ источниками:
 * «Новые эпизоды» (реальный airing из titles.json), «Расписание аниме» и
 * «Обновления аниме» (HomeSchedule → демо-неделя из хеша слага), «Сегодня в эфире МСК»
 * (сайдбар). В итоге один блок показывал реальные серии, второй — «One Piece серия 5»
 * с пометкой «демо», третий — «эфиров нет». Теперь источник один (lib/schedule.ts:
 * таблица airing_schedule → fallback реального графика каталога), а блоки
 * HomeSchedule и «Сегодня в эфире МСК» удалены.
 *
 * Вкладки «Вчера / Сегодня / Завтра» — на CSS :checked, без клиентского JS и гидратации.
 */

type DayKey = 'yesterday' | 'today' | 'tomorrow';

const DAYS: { key: DayKey; label: string; offset: number }[] = [
  { key: 'yesterday', label: 'Вчера', offset: -1 },
  { key: 'today', label: 'Сегодня', offset: 0 },
  { key: 'tomorrow', label: 'Завтра', offset: 1 },
];

/** Сколько строк во вкладке: «Сегодня» — основная, остальные короче. */
const PER_TAB: Record<DayKey, number> = { yesterday: 8, today: 12, tomorrow: 8 };

function Row({ e }: { e: ScheduleEntry }) {
  const href = e.slug ? `/anime/${e.slug}/${e.episode}` : '/schedule';
  return (
    <li>
      <Link className="latest-eps__item" href={href}>
        <span className="latest-eps__poster">
          <PosterArt src={e.poster} seed={String(e.anilistId)} initials={e.romaji} alt="" width={44} />
        </span>
        <span className="latest-eps__info">
          <span className="latest-eps__title">{e.ru ?? e.romaji}</span>
          <span className="latest-eps__meta">
            Серия {e.episode} · {formatClock(e.at)} МСК
          </span>
        </span>
        <span className="latest-eps__ep">EP {e.episode}</span>
      </Link>
    </li>
  );
}

export async function LatestEpisodes() {
  /* RSC: время фиксируется на момент ISR-ревалидации (revalidate 3600 на главной). */
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const { entries, source } = await getSchedule(now);
  const { startMs, endMs } = scheduleWindow(now);

  const byDay = new Map<DayKey, ScheduleEntry[]>();
  for (const { key, offset } of DAYS) {
    const target = mskDayIndex(now + offset * 86_400_000);
    const list = entries
      .filter((e) => mskDayIndex(e.at) === target && e.at >= startMs && e.at <= endMs)
      .sort((a, b) => a.at - b.at);
    if (list.length) byDay.set(key, list);
  }

  /* Пустое состояние вместо скрытого блока: пользователь не должен гадать,
     почему расписания нет (ТЗ 1.1.4). */
  if (!byDay.size) {
    return (
      <section className="page-section" aria-label="Новые эпизоды">
        <div className="rail-head">
          <h2 className="section-title">Новые эпизоды</h2>
          <Link className="rail-head__more" href="/schedule">
            Всё расписание →
          </Link>
        </div>
        <p className="panel__note">
          На этой неделе данных пока нет: расписание обновляется автоматически, как только
          источники публикуют сетку выхода серий.
        </p>
      </section>
    );
  }

  const tabs = DAYS.filter((d) => byDay.has(d.key));
  const activeKey = tabs.some((t) => t.key === 'today') ? 'today' : tabs[0].key;

  return (
    <section className="page-section latest" aria-label="Новые эпизоды">
      <div className="rail-head">
        <h2 className="section-title">Новые эпизоды</h2>
        <Link className="rail-head__more" href="/schedule">
          Всё расписание →
        </Link>
      </div>

      {/* CSS-вкладки: radio + соседние label/ul в одной grid-ячейке, без JS и гидратации */}
      <div className="latest__tabs">
        {tabs.map((d) => (
          <div className="latest__tab" key={d.key}>
            <input
              className="sr-only latest__radio"
              type="radio"
              name="latest-day"
              id={`latest-day-${d.key}`}
              defaultChecked={d.key === activeKey}
            />
            <label className="latest__tab-label" htmlFor={`latest-day-${d.key}`}>
              {d.label}
              <span className="latest__tab-count">{byDay.get(d.key)!.length}</span>
            </label>
            <ul className="latest-eps__list latest__panel">
              {byDay
                .get(d.key)!
                .slice(0, PER_TAB[d.key])
                .map((e) => (
                  <Row key={`${e.anilistId}-${e.episode}-${e.at}`} e={e} />
                ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="latest__note">
        {source === 'db'
          ? 'Сетка выхода серий обновляется автоматически. Время — московское (МСК).'
          : 'Показаны серии из графика выхода каталога; полная сетка подтянется после обновления расписания.'}
      </p>
    </section>
  );
}
