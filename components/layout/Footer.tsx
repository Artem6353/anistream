'use client';

import Link from 'next/link';
import { Logo } from './Logo';
import { useI18n } from '@/lib/i18n';

/** Компактный футер (ТЗ 4.0, задача 8): бренд + документы + о проекте + нижняя строка. */
export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer footer--compact">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Link className="header__brand" href="/">
            <Logo size={24} />
            <span className="header__brand-text">AniNova</span>
          </Link>
          <p>Каталог метаданных аниме: живое расписание, плеер и локальный профиль без регистрации.</p>
        </div>
        <nav className="footer__col" aria-label={t('docs')}>
          {/* ТЗ5 3.3: h3→h4 — SuperSEO требует присутствия H4 (заголовок колонки футера) */}
          <h4>{t('docs')}</h4>
          <div className="footer__docs">
            <Link href="/privacy">Конфиденциальность</Link>
            <Link href="/terms">Соглашение</Link>
            <Link href="/disclaimer">Дисклеймер</Link>
            <Link href="/dmca">DMCA</Link>
          </div>
        </nav>
        <nav className="footer__col" aria-label={t('about')}>
          {/* ТЗ5 3.3: h3→h4 */}
          <h4>{t('about')}</h4>
          <Link href="/catalog">Каталог</Link>
          <Link href="/schedule">Расписание</Link>
          <Link href="/genres">Жанры</Link>
          <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">
            Метаданные: AniList
          </a>
        </nav>
      </div>
      <div className="container footer__bottom">
        {/* ТЗ5 3.3: нижние строки — h5/h6 (стили сбрасываются до вида обычного текста):
            SuperSEO требует присутствия всех уровней заголовков H4–H6 на странице. */}
        <h5>© {new Date().getFullYear()} AniNova. Учебный каталог метаданных и плеер.</h5>
        <h6 className="footer__sources">Видео принадлежит правообладателям.</h6>
      </div>
    </footer>
  );
}
