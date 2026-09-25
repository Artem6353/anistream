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
          <h3>{t('docs')}</h3>
          <div className="footer__docs">
            <Link href="/privacy">Конфиденциальность</Link>
            <Link href="/terms">Соглашение</Link>
            <Link href="/disclaimer">Дисклеймер</Link>
            <Link href="/dmca">DMCA</Link>
          </div>
        </nav>
        <nav className="footer__col" aria-label={t('about')}>
          <h3>{t('about')}</h3>
          <Link href="/catalog">Каталог</Link>
          <Link href="/schedule">Расписание</Link>
          <Link href="/genres">Жанры</Link>
          <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">
            Метаданные: AniList
          </a>
        </nav>
      </div>
      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} AniNova. Учебный каталог метаданных и плеер.</span>
        <span className="footer__sources">Видео принадлежит правообладателям.</span>
      </div>
    </footer>
  );
}
