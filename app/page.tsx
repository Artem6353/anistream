import Link from 'next/link';
import type { Metadata } from 'next';
import { Hero } from '@/components/anime/Hero';
import { Rail } from '@/components/anime/Rail';
import { PosterCard } from '@/components/anime/PosterCard';
import { ContinueWatchingRail } from '@/components/anime/ContinueWatchingRail';
import { GenreChips } from '@/components/anime/GenreChips';
import { homeRails, genreStats, heroSlides, toCardTitle } from '@/lib/catalog';
import { demoWeek } from '@/lib/schedule';
import { HomeSchedule } from '@/components/schedule/HomeSchedule';
import { ContinueBanner } from '@/components/home/ContinueBanner';
import { DiscussedRail } from '@/components/home/DiscussedRail';
import { BecauseRail } from '@/components/anime/BecauseRail';
import { LatestEpisodes } from '@/components/home/LatestEpisodes';
import { TopTabs } from '@/components/home/TopTabs';
import { LazyRail } from '@/components/home/LazyRail';
import { COLLECTIONS } from '@/lib/collections';
import { loadTitles } from '@/lib/catalog';
import { ForYouRail } from '@/components/anime/ForYouRail';
import { IconGrid, IconSparkles } from '@/components/ui/icons';
import { HomeSidebar } from '@/components/home/Sidebar';
import { SeoIntro } from '@/components/home/SeoIntro';
import { HomeJsonLd } from '@/components/home/HomeJsonLd';

export const revalidate = 3600;

/* S3.2: canonical + og:url главной (metadataBase из layout резолвит относительные
   пути в абсолютные). Title/description наследуются из layout. */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  /* Next мержит metadata поверхностно: page-level openGraph полностью заменяет
     layout-объект, поэтому type/locale/siteName дублируем здесь явно.
     og:title/og:description Next подставляет сам из резолвленного title/description. */
  openGraph: { type: 'website', url: '/', locale: 'ru_RU', siteName: 'AniNova' },
};

export default async function HomePage() {
  const rails = homeRails();
  // ТЗ 18.5: «за неделю» — ongoing + свежие finished, ранг favourites + score.
  // S2.2: в TopTabs уходят только слаги — тайтлы догрузит /api/titles при скролле.
  const weekTopSlugs = loadTitles()
    .filter((t) => t.status === 'ongoing' || (t.status === 'finished' && t.year >= 2025))
    .sort((a, b) => b.favourites + b.score * 500 - (a.favourites + a.score * 500))
    .slice(0, 10) // S2.1: 12→10
    .map((t) => t.slug);
  const allTopSlugs = rails.top.map((t) => t.slug);
  const genres = genreStats();

  return (
    <>
      {/* S3.1: page-level H1 главной (заголовок слайда Hero понижен до h2).
          sr-only: не ломает full-bleed композицию Hero, но даёт документу
          ровно один информативный H1 (аудит SuperSEO: headings 27.3). */}
      <h1 className="sr-only">AniNova — каталог аниме: онгоинги, расписание выхода серий и плеер</h1>

      {/* S3.2: JSON-LD — WebSite+SearchAction, CollectionPage+ItemList, FAQPage */}
      <HomeJsonLd popular={rails.popular} />

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

            {/* S2.1: EveningRail убран с главной — выдача пересекалась с ForYou/Because
                (план аудита: оставить 2 персональные ленты из 3). */}

            <Rail title="Сейчас популярно" action={{ href: '/catalog?sort=pop', label: 'Весь каталог' }}>
              {rails.popular.map((t) => (
                <PosterCard key={t.slug} title={toCardTitle(t)} />
              ))}
            </Rail>

            <Rail title="Новинки последних лет" action={{ href: '/catalog?sort=new', label: 'Все новинки' }}>
              {rails.fresh.map((t) => (
                <PosterCard key={t.slug} title={toCardTitle(t)} />
              ))}
            </Rail>

            <TopTabs week={weekTopSlugs} all={allTopSlugs} />

            <DiscussedRail />

            <Rail title="Подборки" action={{ href: '/collections/novichku', label: 'Все подборки' }}>
              {COLLECTIONS.map((c) => (
                <Link className="collection-card" key={c.slug} href={`/collections/${c.slug}`}>
                  <strong>{c.title}</strong>
                  <span>{c.desc}</span>
                </Link>
              ))}
            </Rail>

            {/* S2.2: рельсы ниже сгиба — ленивые (слаги в SSR, карточки — /api/titles по скроллу) */}
            {rails.ongoing.length ? (
              <LazyRail
                title="Онгоинги: выходят сейчас"
                action={{ href: '/catalog?status=ongoing', label: 'Все онгоинги' }}
                slugs={rails.ongoing.map((t) => t.slug)}
                skeleton={rails.ongoing.length}
              />
            ) : null}

            <LazyRail
              title="Полнометражки"
              action={{ href: '/catalog?type=movie', label: 'Все фильмы' }}
              slugs={rails.movies.map((t) => t.slug)}
              skeleton={rails.movies.length}
            />

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

            {/* S2.3: текстовый SEO-блок + FAQ (контент под FAQPage-разметку волны S3) */}
            <SeoIntro />
          </div>
          <HomeSidebar />
        </div>
      </div>
    </>
  );
}
