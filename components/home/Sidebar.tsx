import Link from 'next/link';
import { topTitles, genreStats } from '@/lib/catalog';
import { getWeekSchedule, groupByDay, todayIndex } from '@/lib/schedule';
import { GENRE_LABELS } from '@/lib/labels';
import { IconClock, IconHeart, IconMask, IconPlanet, IconStar, IconSword } from '@/components/ui/icons';
import { RecentReviews } from './RecentReviews';

const mskTime = (ms: number) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(ms);

const MOODS = [
  { slug: 'action', icon: IconSword, hint: 'драки и погони' },
  { slug: 'romance', icon: IconHeart, hint: 'чувства и сюжет' },
  { slug: 'thriller', icon: IconMask, hint: 'саспенс и твисты' },
  { slug: 'sci-fi', icon: IconPlanet, hint: 'миры и технологии' },
] as const;

/** Правый сайдбар главной (ТЗ 4.0): топ, эфиры дня (МСК), жанры-настроения, свежие отзывы. */
export async function HomeSidebar() {
  const top = topTitles(5);
  const { entries } = await getWeekSchedule();
  const todayList = (groupByDay(entries).get(todayIndex()) ?? []).slice(0, 5);
  const counts = new Map(genreStats().map((g) => [g.slug, g.count]));

  return (
    <aside className="home-layout__sidebar home-sidebar" aria-label="Обзор дня">
      <section className="sidebar-block">
        <h2 className="sidebar-block__title">Топ недели</h2>
        <ol className="sidebar-top">
          {top.map((t, i) => (
            <li key={t.slug}>
              <Link className="sidebar-top__row" href={`/anime/${t.slug}`}>
                <span className="sidebar-top__rank">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="sidebar-top__poster" src={t.poster} alt="" loading="lazy" width={34} height={46} />
                <span className="sidebar-top__name">{t.ru || t.romaji}</span>
                <span className="sidebar-top__score">
                  <IconStar size={11} />
                  {t.score > 0 ? t.score.toFixed(1) : '—'}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="sidebar-block">
        <h2 className="sidebar-block__title">
          <IconClock size={15} /> Сегодня в эфире <span className="sidebar-block__meta">МСК</span>
        </h2>
        {todayList.length ? (
          <ul className="sidebar-airing">
            {todayList.map((e) => (
              <li key={`${e.anilistId}-${e.episode}-${e.at}`}>
                <Link className="sidebar-airing__row" href={e.slug ? `/anime/${e.slug}` : '/schedule'}>
                  <span className="sidebar-airing__time">{mskTime(e.at)}</span>
                  <span className="sidebar-airing__body">
                    <span className="sidebar-airing__name">{e.ru || e.romaji}</span>
                    <span className="sidebar-airing__ep">серия {e.episode}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sidebar-block__empty">Сегодня эфиров нет — загляните в полное расписание.</p>
        )}
        <Link className="sidebar-block__more" href="/schedule">
          Всё расписание →
        </Link>
      </section>

      <section className="sidebar-block">
        <h2 className="sidebar-block__title">Жанры под настроение</h2>
        <div className="sidebar-moods">
          {MOODS.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.slug} className="sidebar-mood" href={`/genre/${m.slug}`} title={m.hint}>
                <Icon size={16} />
                <span className="sidebar-mood__label">{GENRE_LABELS[m.slug] ?? m.slug}</span>
                <span className="sidebar-mood__count">{counts.get(m.slug) ?? 0}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="sidebar-block">
        <h2 className="sidebar-block__title">Свежие отзывы</h2>
        <RecentReviews />
      </section>
    </aside>
  );
}
