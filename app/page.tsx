import Link from 'next/link';
import { Hero } from '@/components/anime/Hero';
import { Rail } from '@/components/anime/Rail';
import { PosterCard } from '@/components/anime/PosterCard';
import { ContinueWatchingRail } from '@/components/anime/ContinueWatchingRail';
import { GenreChips } from '@/components/anime/GenreChips';
import { PosterArt } from '@/components/anime/PosterArt';
import { homeRails, genreStats, heroSlides } from '@/lib/catalog';
import { demoWeek } from '@/lib/schedule';
import { WEEKDAYS } from '@/lib/labels';
import { todayIndex } from '@/lib/schedule';
import { HomeSchedule } from '@/components/schedule/HomeSchedule';
import { ForYouRail } from '@/components/anime/ForYouRail';
import { IconCalendar, IconGrid, IconSparkles } from '@/components/ui/icons';
import { HomeSidebar } from '@/components/home/Sidebar';

export const revalidate = 3600;

export default async function HomePage() {
  const rails = homeRails();
  const genres = genreStats();
  const today = todayIndex();

  return (
    <div className="home-layout">
      <div className="home-layout__main">
      <Hero slides={heroSlides()} />

      <div className="page-section">
        <ContinueWatchingRail />
      </div>

      <ForYouRail />

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

      <Rail title="Топ по оценкам" action={{ href: '/catalog?sort=score', label: 'Весь топ' }}>
        {rails.top.map((t) => (
          <PosterCard key={t.slug} title={t} />
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
  );
}
