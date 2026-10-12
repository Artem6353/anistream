import Link from 'next/link';
import { topTitles, genreStats } from '@/lib/catalog';
import { GENRE_LABELS } from '@/lib/labels';
import { imgProxyUrl } from '@/lib/img';
import { IconHeart, IconMask, IconPlanet, IconStar, IconSword } from '@/components/ui/icons';

const MOODS = [
  { slug: 'action', icon: IconSword, hint: 'драки и погони' },
  { slug: 'romance', icon: IconHeart, hint: 'чувства и сюжет' },
  { slug: 'thriller', icon: IconMask, hint: 'саспенс и твисты' },
  { slug: 'sci-fi', icon: IconPlanet, hint: 'миры и технологии' },
] as const;

/** Правый сайдбар главной (ТЗ 4.0): топ и жанры-настроения.
 *
 *  Аудит 2026-10 (ТЗ 1.1.5): блок «Сегодня в эфире МСК» удалён — он дублировал
 *  «Новые эпизоды» и при недоступном AniList показывал демо-неделю, тогда как
 *  соседний блок показывал реальные серии («Сегодня эфиров нет» рядом с живым списком).
 *  Блок «Свежие отзывы» удалён по ТЗ 3.3.1: на проде отзывов нет, пустая плашка
 *  «Пока никто не поделился мнением» висела на главной постоянно. */
export async function HomeSidebar() {
  const top = topTitles(5);
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
                <img className="sidebar-top__poster" src={imgProxyUrl(t.poster, 96) ?? undefined} alt="" loading="lazy" width={34} height={46} />
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

    </aside>
  );
}
