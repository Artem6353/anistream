import Link from 'next/link';
import { Hero } from '@/components/anime/Hero';
import { Rail } from '@/components/anime/Rail';
import { PosterCard } from '@/components/anime/PosterCard';
import { ContinueWatchingRail } from '@/components/anime/ContinueWatchingRail';
import { GenreChips } from '@/components/anime/GenreChips';
import { homeRails, genreStats, heroSlides } from '@/lib/catalog';
import { demoWeek } from '@/lib/schedule';
import { HomeSchedule } from '@/components/schedule/HomeSchedule';
import { ContinueBanner } from '@/components/home/ContinueBanner';
import { DiscussedRail } from '@/components/home/DiscussedRail';
import { BecauseRail } from '@/components/anime/BecauseRail';
import { LatestEpisodes } from '@/components/home/LatestEpisodes';
import { EveningRail } from '@/components/anime/EveningRail';
import { TopTabs } from '@/components/home/TopTabs';
import { COLLECTIONS } from '@/lib/collections';
import { loadTitles } from '@/lib/catalog';
import { ForYouRail } from '@/components/anime/ForYouRail';
import { IconGrid, IconSparkles } from '@/components/ui/icons';
import { HomeSidebar } from '@/components/home/Sidebar';

export const revalidate = 3600;

export default async function HomePage() {
  const rails = homeRails();
  // ТЗ 18.5: «за неделю» — ongoing + свежие finished, ранг favourites + score
  const weekTop = loadTitles()
    .filter((t) => t.status === 'ongoing' || (t.status === 'finished' && t.year >= 2025))
    .sort((a, b) => b.favourites + b.score * 500 - (a.favourites + a.score * 500))
    .slice(0, 12);
  const genres = genreStats();

  return (
    <>
      {/* ТЗ 18.5: баннер «Продолжить с MM:SS» над Hero */}
      <div className="container">
        <ContinueBanner />
      </div>

      {/* Hero — full-bleed, на всю ширину экрана (ТЗ 4.1, задача 1.3) */}
      <Hero slides={heroSlides()} />

      <div className="container">
        <LatestEpisodes />
      </div>

      <div className="container quiz-cta-wrap">
        <Link className="btn btn--primary btn--lg quiz-cta" href="/quiz">
          🎯 Не знаете, что посмотреть? → Пройти квиз
        </Link>
      </div>

      {/* Ниже — grid: контент + сайдбар */}
      <div className="container">
        <div className="home-layout">
          <div className="home-layout__main">
            <div className="page-section">
              <ContinueWatchingRail />
            </div>

            <ForYouRail />

            <BecauseRail />

            <EveningRail />

            <Rail title="Сейчас популярно" action={{ href: '/catalog?sort=pop', label: 'Весь каталог' }}>
              {rails.popular.map((t) => (
                <PosterCard key={t.slug} title={t} />
              ))}
            </Rail>

            <Rail title="Новинки последних лет" action={{ href: '/catalog?sort=new', label: 'Все новинки' }}>
              {rails.fresh.map((t) => (
                <PosterCard key={t.slug} title={t} />
              ))}
            </Rail>

            <TopTabs week={weekTop} all={rails.top} />

            <DiscussedRail />

            <Rail title="Подборки" action={{ href: '/collections/novichku', label: 'Все подборки' }}>
              {COLLECTIONS.map((c) => (
                <Link className="collection-card" key={c.slug} href={`/collections/${c.slug}`}>
                  <strong>{c.title}</strong>
                  <span>{c.desc}</span>
                </Link>
              ))}
            </Rail>

            {rails.ongoing.length ? (
              <Rail title="Онгоинги: выходят сейчас" action={{ href: '/catalog?status=ongoing', label: 'Все онгоинги' }}>
                {rails.ongoing.map((t) => (
                  <PosterCard key={t.slug} title={t} />
                ))}
              </Rail>
            ) : null}

            <Rail title="Полнометражки" action={{ href: '/catalog?type=movie', label: 'Все фильмы' }}>
              {rails.movies.map((t) => (
                <PosterCard key={t.slug} title={t} />
              ))}
            </Rail>

            <section className="page-section" aria-label="Расписание и обновления">
              <div className="container">
                <HomeSchedule fallback={demoWeek()} />
              </div>
            </section>

            <section className="page-section" aria-label="Жанры">
              <div className="rail-head">
                <h2 className="section-title">Подборки по жанрам</h2>
                <Link className="rail-more" href="/genres">
                  Все жанры
                </Link>
              </div>
              <div className="container">
                <GenreChips counts={genres} />
              </div>
            </section>

            <section className="container">
              <div className="about-card">
                <h2>
                  <IconSparkles size={18} /> Как устроен AniNova 2.0
                </h2>
                <p>
                  Каталог собран из метаданных AniList и дополнен русскими описаниями; расписание выхода серий подтягивается
                  живьём. Профиль (закладки, история, настройки) живёт локально в браузере — без регистрации и сервера.
                </p>
                <ul>
                  <li>Серверные компоненты и ISR: страницы каталога отдаются без клиентского JS.</li>
                  <li>Командная палитра Ctrl+K: тайтлы, жанры и действия в одном поиске.</li>
                  <li>Плеер с автопереходом, прогрессом, пропуском опенинга и горячими клавишами.</li>
                  <li>Реестр провайдеров: демо-поток из коробки, Kodik/Aniboom — через токены.</li>
                </ul>
                <div className="btn-row">
                  <Link className="btn btn--primary btn--md" href="/catalog">
                    <IconGrid size={15} />
                    Открыть каталог
                  </Link>
                  <Link className="btn btn--outline btn--md" href="/profile/settings">
                    Настроить плеер и интерфейс
                  </Link>
                </div>
              </div>
            </section>
          </div>
          <HomeSidebar />
        </div>
      </div>
    </>
  );
}
