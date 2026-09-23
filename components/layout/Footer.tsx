'use client';

import Link from 'next/link';
import { Logo } from './Logo';
import { useI18n } from '@/lib/i18n';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Link className="header__brand" href="/">
            <Logo size={26} />
            <span className="header__brand-text">AniStream</span>
          </Link>
          <p>
            Каталог и агрегатор метаданных аниме. Источники: AniList (метаданные и расписание), публичные тестовые
            потоки для демо-плеера. Видео принадлежит правообладателям.
          </p>
        </div>
        <nav className="footer__col" aria-label="Разделы">
          <h3>{t('sections')}</h3>
          <Link href="/catalog">Каталог</Link>
          <Link href="/genres">Жанры</Link>
          <Link href="/schedule">Расписание</Link>
          <Link href="/search">Поиск</Link>
          <Link href="/privacy">Конфиденциальность</Link>
          <Link href="/terms">Соглашение</Link>
          <Link href="/disclaimer">Дисклеймер</Link>
          <Link href="/dmca">DMCA</Link>
        </nav>
        <nav className="footer__col" aria-label="Профиль">
          <h3>{t('profile')}</h3>
          <Link href="/profile/bookmarks">Закладки</Link>
          <Link href="/profile/history">История</Link>
          <Link href="/profile/settings">Настройки</Link>
        </nav>
        <div className="footer__col">
          <h3>{t('rights')}</h3>
          <p className="footer__note">
            Сайт — каталог метаданных и указателей на сторонние плееры; файлы не хранятся на сервере.
            Все права на тайтлы принадлежат правообладателям. Для запросов на удаление свяжитесь с
            владельцем сайта — материалы будут скрыты из каталога.
          </p>
        </div>
        <div className="footer__col">
          <h3>{t('about')}</h3>
          <p className="footer__note">
            Next.js App Router, серверные компоненты, офлайн-каталог и реестр плеер-провайдеров. Исходники и анализ
            архитектуры — в docs/ANALYSIS.md.
          </p>
        </div>
      </div>
      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} AniStream. Сделано как учебный каталог метаданных и плеер.</span>
        <span className="footer__sources">
          Метаданные: <a href="https://anilist.co" rel="noopener noreferrer" target="_blank">AniList</a>
        </span>
      </div>
    </footer>
  );
}
